import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../db/database';
import { computeHealthScore } from '../utils/healthScore';
import { detectRecurring } from '../utils/recurringDetector';
import { Sparkles, Loader2, RefreshCw, TrendingDown, TrendingUp, Shield, Clock } from 'lucide-react';
import { isGeminiFallbackError } from '../services/gemini';
import { generateInsightsWithGroq } from '../services/groq';

const INSIGHT_SYSTEM_PROMPT = `You are Kosha — a friendly, concise personal financial advisor for India. 
Analyse the provided financial data and give 5-7 SHORT, punchy, personalised insights.
Format as JSON: { "insights": [{ "type": "positive"|"warning"|"tip"|"alert", "title": "Short title", "body": "1-2 sentences max" }] }
Be specific with numbers. Be encouraging but honest. Focus on actionable advice.`;

const TYPE_META = {
  positive: { icon: <TrendingUp size={16} />, colour: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  warning:  { icon: <TrendingDown size={16} />, colour: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  tip:      { icon: <Shield size={16} />, colour: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  alert:    { icon: <Clock size={16} />, colour: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};

interface Insight { type: 'positive' | 'warning' | 'tip' | 'alert'; title: string; body: string; }

export const InsightsView: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Gemini is reading your financial data and crafting personalised insights…');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<'gemini' | 'groq' | null>(null);
  const runningRef = useRef(false);

  const data = useLiveQuery(async () => {
    const transactions = await db.transactions.toArray();
    const budgets = await db.budgets.toArray();
    const salarySlips = await db.salarySlips.toArray();
    const investments = await db.investments.toArray();
    const goals = await db.goals.toArray();
    const debts = await db.debts.toArray();
    return { transactions, budgets, salarySlips, investments, goals, debts };
  }, []) ?? { transactions: [], budgets: [], salarySlips: [], investments: [], goals: [], debts: [] };

  useEffect(() => {
    getSetting('geminiApiKey', '').then(setApiKey);
    getSetting('groqApiKey', '').then(setGroqApiKey);
    getSetting('cachedInsights', null as any).then((cached: any) => {
      if (cached?.insights) {
        setInsights(cached.insights);
        setLastUpdated(cached.at);
        setProviderUsed(cached.provider ?? 'gemini');
      }
    });
  }, []);


  const buildContext = () => {
    const { transactions, budgets, salarySlips, investments, goals, debts } = data;
    const today = new Date();
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    // Smart month: use most recent month with data
    const allMonths = [...new Set(transactions.map((t: any) => t.date.slice(0, 7)))].sort().reverse();
    const activeMonth = allMonths.includes(monthStr) ? monthStr : (allMonths[0] ?? monthStr);
    const periodTxs = transactions.filter((t: any) => t.date.startsWith(activeMonth));

    const income   = periodTxs.filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + t.amount, 0);
    const expenses = periodTxs.filter((t: any) => t.type === 'debit').reduce((s: number, t: any) => s + t.amount, 0);
    const recurring = detectRecurring(transactions);
    const cash = transactions.reduce((s: number, t: any) => t.type === 'credit' ? s + t.amount : s - t.amount, 0);
    const portfolio = investments.reduce((s: number, i: any) => s + i.quantity * (i.currentPrice || i.avgCost), 0);
    const totalDebt = debts.reduce((s: number, d: any) => s + d.outstandingAmount, 0);
    const hs = computeHealthScore(periodTxs, budgets, salarySlips, recurring.filter((r: any) => r.frequency === 'monthly').reduce((s: number, r: any) => s + r.averageAmount, 0), cash);

    const catBreakdown: Record<string, number> = {};
    periodTxs.filter((t: any) => t.type === 'debit').forEach((t: any) => {
      catBreakdown[t.category] = (catBreakdown[t.category] || 0) + t.amount;
    });

    const budgetAlerts = budgets
      .map(b => ({ cat: b.category, spent: catBreakdown[b.category] || 0, limit: b.monthlyLimit }))
      .filter(b => b.spent > b.limit * 0.8);

    return JSON.stringify({
      currentMonth: { income, expenses, savings: income - expenses, savingsRate: income > 0 ? ((income - expenses) / income * 100).toFixed(1) + '%' : 'N/A', topCategories: catBreakdown },
      netWorth: { cash, portfolio, total: cash + portfolio },
      debt: { totalOutstanding: totalDebt, monthlyEmi: debts.reduce((s, d) => s + d.emiAmount, 0) },
      recurringSubscriptions: { count: recurring.length, monthlyTotal: recurring.filter(r => r.frequency === 'monthly').reduce((s, r) => s + r.averageAmount, 0) },
      budgetAlerts,
      healthScore: { total: hs.total, grade: hs.grade },
      goals: goals.map(g => ({ name: g.name, progress: Math.round((g.savedAmount / g.targetAmount) * 100) + '%', daysLeft: Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / 86400000) })),
      latestSalary: salarySlips.length > 0 ? { net: salarySlips[0].netPay, gross: salarySlips[0].grossPay } : null,
    }, null, 2);
  };

  const generate = async () => {
    if (!apiKey && !groqApiKey) {
      setError('No API key found. Please configure a Gemini or Groq API key in Settings.');
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true); setError(null);

    try {
      const context = buildContext();
      let resultText = '';
      let provider: 'gemini' | 'groq' = 'gemini';

      const runWithGemini = async () => {
        const body = {
          contents: [
            { role: 'user', parts: [{ text: `${INSIGHT_SYSTEM_PROMPT}\n\nFinancial Data:\n${context}` }] }
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
        };

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `API error ${res.status}`);
        }

        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      };

      const runWithGroq = async () => {
        if (!groqApiKey) throw new Error('No Groq API key configured. Please add one in Settings.');
        return await generateInsightsWithGroq(INSIGHT_SYSTEM_PROMPT, `Financial Data:\n${context}`, groqApiKey);
      };

      if (apiKey) {
        try {
          setLoadingText('Gemini is reading your financial data and crafting insights...');
          resultText = await runWithGemini();
          provider = 'gemini';
        } catch (geminiErr: any) {
          if (groqApiKey && isGeminiFallbackError(geminiErr)) {
            setLoadingText('Gemini limit reached — switching to Groq (Llama 3.3 70B)...');
            console.warn('Gemini failed, falling back to Groq:', geminiErr.message);
            resultText = await runWithGroq();
            provider = 'groq';
          } else {
            throw geminiErr;
          }
        }
      } else {
        setLoadingText('Groq is reading your financial data and crafting insights...');
        resultText = await runWithGroq();
        provider = 'groq';
      }

      const match = resultText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse AI response');
      const parsed = JSON.parse(match[0]);
      const list: Insight[] = parsed.insights ?? [];
      const at = new Date().toLocaleString('en-IN');
      setInsights(list);
      setLastUpdated(at);
      setProviderUsed(provider);
      await db.settings.put({ key: 'cachedInsights', value: { insights: list, at, provider } });
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>AI Financial Insights</h1>
          <p>AI analyses your data and gives personalised, actionable advice.</p>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          <span>{loading ? 'Analysing...' : 'Generate Insights'}</span>
        </button>
      </header>

      {lastUpdated && (
        <div className="insights-last-updated">
          <RefreshCw size={13} /> Last updated: {lastUpdated}
          {providerUsed && (
            <span className="provider-tag">
              via {providerUsed === 'groq' ? 'Groq (Llama 3.3)' : 'Gemini 2.5 Flash'}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="glass-card error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}

      {loading && (
        <div className="glass-card insights-loading-card">
          <Loader2 size={32} className="spin primary-color" />
          <p>{loadingText}</p>
        </div>
      )}

      {insights.length === 0 && !loading && !error && (
        <div className="glass-card empty-state">
          <Sparkles size={48} className="empty-icon" />
          <h3>No Insights Yet</h3>
          <p>Click "Generate Insights" to let AI analyse your spending, savings, goals, and investments and give you personalised advice.</p>
        </div>
      )}

      {insights.length > 0 && !loading && (
        <div className="insights-grid">
          {insights.map((ins, i) => {
            const meta = TYPE_META[ins.type] ?? TYPE_META.tip;
            return (
              <div key={i} className="glass-card insight-card" style={{ borderColor: meta.colour + '33', background: `linear-gradient(135deg, ${meta.bg} 0%, transparent 100%)` }}>
                <div className="insight-type-badge" style={{ color: meta.colour, background: meta.bg }}>
                  {meta.icon}
                  <span>{ins.type.charAt(0).toUpperCase() + ins.type.slice(1)}</span>
                </div>
                <h3 className="insight-title">{ins.title}</h3>
                <p className="insight-body">{ins.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .insights-last-updated {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.78rem; color: var(--text-muted); margin-top: -8px;
        }
        .provider-tag {
          margin-left: 6px;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          font-size: 0.72rem;
          color: var(--text-secondary);
          border: 1px solid var(--border-glass);
        }
        .insights-loading-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; padding: 48px; text-align: center;
          color: var(--text-muted); font-size: 0.95rem;
        }
        .insights-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .insight-card { padding: 20px; display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border-glass); }
        .insight-type-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700;
          align-self: flex-start;
        }
        .insight-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .insight-body { font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin: 0; }
        .spin { animation: spin 1.2s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .error-banner { padding: 14px 18px; border: 1px solid rgba(239,68,68,.2); color: #ef4444; font-size: 0.9rem; }
      `}</style>
    </div>
  );
};
