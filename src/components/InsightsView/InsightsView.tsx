import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../../db/database';
import { computeHealthScore } from '../../utils/healthScore';
import { detectRecurring } from '../../utils/recurringDetector';
import { Sparkles, Loader2, RefreshCw, TrendingDown, TrendingUp, Shield, Clock } from 'lucide-react';

import { generateInsightsWithGroq } from '../../services/groq';
import { buildInsightsPrompt } from '../../services/insightsPrompt';
import { fetchLatestMacroContext, MACRO_DEFINITIONS, DEFAULT_MACRO_CONTEXT } from '../../services/macroContext';
import type { IndianMacroContext } from '../../services/macroContext';
import './InsightsView.css';

const TYPE_META = {
  positive: { icon: <TrendingUp size={16} />, colour: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  warning:  { icon: <TrendingDown size={16} />, colour: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  tip:      { icon: <Shield size={16} />, colour: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  alert:    { icon: <Clock size={16} />, colour: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};

const MACRO_THEMES = {
  cpiInflation: {
    color: '#f97316', // Orange
    bg: 'rgba(249,115,22,0.06)',
    borderColor: 'rgba(249,115,22,0.2)'
  },
  repoRate: {
    color: '#8b5cf6', // Purple
    bg: 'rgba(139,92,246,0.06)',
    borderColor: 'rgba(139,92,246,0.2)'
  },
  section80CLimit: {
    color: '#22c55e', // Green
    bg: 'rgba(34,197,94,0.06)',
    borderColor: 'rgba(34,197,94,0.2)'
  },
  nps80CCDLimit: {
    color: '#22c55e', // Green
    bg: 'rgba(34,197,94,0.06)',
    borderColor: 'rgba(34,197,94,0.2)'
  },
  standardDeductionNewRegime: {
    color: '#3b82f6', // Blue
    bg: 'rgba(59,130,246,0.06)',
    borderColor: 'rgba(59,130,246,0.2)'
  },
  basicExemptionNewRegime: {
    color: '#3b82f6', // Blue
    bg: 'rgba(59,130,246,0.06)',
    borderColor: 'rgba(59,130,246,0.2)'
  }
};

const getValFontSize = (val: string): string => {
  if (!val) return '1.25rem';
  if (val.length > 25) return '0.92rem';
  if (val.length > 15) return '1.1rem';
  return '1.25rem';
};

interface Insight { type: 'positive' | 'warning' | 'tip' | 'alert'; title: string; body: string; }

export const InsightsView: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [userCity, setUserCity] = useState('');
  const [macroContext, setMacroContext] = useState<IndianMacroContext>(DEFAULT_MACRO_CONTEXT);
  const [showMacroPopup, setShowMacroPopup] = useState(false);
  const [refreshingMacro, setRefreshingMacro] = useState(false);
  const [dataConfidence, setDataConfidence] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Gemini is reading your financial data and crafting personalised insights…');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const runningRef = useRef(false);

  const handleRefreshMacro = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshingMacro) return;
    setRefreshingMacro(true);
    try {
      const macro = await fetchLatestMacroContext(apiKey, true);
      setMacroContext(macro);
      console.log('[Kosha] Manually fetched latest live macro context:', macro);
    } catch (err: any) {
      console.error('Failed to manually fetch macro context:', err);
      setError(`Failed to fetch live macroeconomic data: ${err.message || err}`);
    } finally {
      setRefreshingMacro(false);
    }
  };

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
    Promise.all([
      getSetting('geminiApiKey', ''),
      getSetting('groqApiKey', ''),
      getSetting('userCity', '')
    ]).then(async ([geminiKey, groqKey, city]) => {
      setApiKey(geminiKey);
      setGroqApiKey(groqKey);
      setUserCity(city);

      // Load cached macro context
      const cachedMacro = localStorage.getItem('kosha_macro_context');
      if (cachedMacro) {
        try {
          setMacroContext(JSON.parse(cachedMacro));
        } catch (e) {
          console.warn('Failed to parse cached macro context:', e);
        }
      } else {
        // If not cached, fetch it immediately (will fallback to default if key is empty)
        try {
          const macro = await fetchLatestMacroContext(geminiKey);
          setMacroContext(macro);
        } catch (err) {
          console.warn('Failed to fetch macro context on mount:', err);
        }
      }
    });

    getSetting('cachedInsights', null as any).then((cached: any) => {
      if (cached?.insights) {
        setInsights(cached.insights);
        setLastUpdated(cached.at);
        setProviderUsed(cached.provider ?? 'Gemini 2.5 Flash');
        if (cached.dataConfidence) {
          setDataConfidence(cached.dataConfidence);
        }
        if (cached.macro) {
          setMacroContext(cached.macro);
        }
      }
    });
  }, []);

  const buildContext = () => {
    const { transactions, budgets, salarySlips, investments, goals, debts } = data;
    const today = new Date();
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    // Find active months
    const allMonths = [...new Set(transactions.map((t: any) => t.date.slice(0, 7)))].sort();
    const activeMonthsCount = Math.max(allMonths.length, 1);
    const dataPeriod = allMonths.length > 0 ? `from ${allMonths[0]} to ${allMonths[allMonths.length - 1]}` : 'N/A';
    
    // Smart month for health score fallback
    const activeMonth = allMonths.includes(monthStr) ? monthStr : (allMonths[allMonths.length - 1] ?? monthStr);
    const periodTxs = transactions.filter((t: any) => t.date.startsWith(activeMonth));

    // All-time Totals
    const totalIncome = transactions.filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + t.amount, 0);
    const totalExpenses = transactions.filter((t: any) => t.type === 'debit').reduce((s: number, t: any) => s + t.amount, 0);
    const totalSavings = totalIncome - totalExpenses;
    const allTimeSavingsRate = totalIncome > 0 ? ((totalSavings / totalIncome) * 100).toFixed(1) + '%' : 'N/A';
    
    // Monthly Averages
    const averageMonthlyIncome = Math.round(totalIncome / activeMonthsCount);
    const averageMonthlyExpenses = Math.round(totalExpenses / activeMonthsCount);

    const recurring = detectRecurring(transactions);
    const cash = transactions.reduce((s: number, t: any) => t.type === 'credit' ? s + t.amount : s - t.amount, 0);
    const portfolio = investments.reduce((s: number, i: any) => s + i.quantity * (i.currentPrice || i.avgCost), 0);
    const totalDebt = debts.reduce((s: number, d: any) => s + d.outstandingAmount, 0);
    
    // Health score uses active month snapshot to maintain formula sanity
    const hs = computeHealthScore(periodTxs, budgets, salarySlips, recurring.filter((r: any) => r.frequency === 'monthly').reduce((s: number, r: any) => s + r.averageAmount, 0), cash);

    // All-Time Category Breakdown
    const catBreakdownAllTime: Record<string, number> = {};
    transactions.filter((t: any) => t.type === 'debit').forEach((t: any) => {
      catBreakdownAllTime[t.category] = (catBreakdownAllTime[t.category] || 0) + t.amount;
    });

    const catAverages: Record<string, number> = {};
    Object.keys(catBreakdownAllTime).forEach(cat => {
      catAverages[cat] = Math.round(catBreakdownAllTime[cat] / activeMonthsCount);
    });

    // Budget compliance historical compliance trends
    const budgetCompliance = budgets.map(b => {
      const avgSpent = catAverages[b.category] || 0;
      return {
        category: b.category,
        monthlyLimit: b.monthlyLimit,
        averageMonthlySpent: avgSpent,
        status: avgSpent > b.monthlyLimit 
          ? `Averaging ${Math.round((avgSpent - b.monthlyLimit) / b.monthlyLimit * 100)}% over budget limit historically`
          : `Within budget (averaging ${Math.round((avgSpent / b.monthlyLimit) * 100)}% of limit)`
      };
    });

    return JSON.stringify({
      meta: {
        dataSpanMonths: activeMonthsCount,
        dataPeriod,
        country: "India"
      },
      allTimeStats: {
        totalIncome,
        totalExpenses,
        totalSavings,
        allTimeSavingsRate,
        averageMonthlyIncome,
        averageMonthlyExpenses
      },
      topCategoriesAllTime: catBreakdownAllTime,
      averageMonthlySpendingByCategory: catAverages,
      netWorth: { cash, portfolio, total: cash + portfolio },
      debt: { totalOutstanding: totalDebt, monthlyEmi: debts.reduce((s, d) => s + d.outstandingAmount, 0) },
      recurringSubscriptions: { count: recurring.length, monthlyTotal: recurring.filter(r => r.frequency === 'monthly').reduce((s, r) => s + r.averageAmount, 0) },
      budgetCompliance,
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

    let resultText = '';
    let activeModelLabel = 'Gemini 2.5 Flash';
    try {
      // 1. Fetch live or cached Indian macroeconomic context
      setLoadingText('Fetching latest Indian macroeconomic context...');
      const macro = await fetchLatestMacroContext(apiKey);
      setMacroContext(macro);

      // 2. Build finance data payload
      const context = buildContext();

      // 3. Compute date range and month count
      const allMonths = [...new Set(data.transactions.map((t: any) => t.date.slice(0, 7)))].sort();
      const activeMonthsCount = Math.max(allMonths.length, 1);
      const formatMonthYear = (yyyymm: string) => {
        if (!yyyymm || yyyymm.length < 7) return '';
        const [year, month] = yyyymm.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleString('default', { month: 'short', year: 'numeric' });
      };
      const dateRange = allMonths.length > 0 
        ? `${formatMonthYear(allMonths[0])} – ${formatMonthYear(allMonths[allMonths.length - 1])}` 
        : 'N/A';

      // 4. Construct prompt using the prompt builder
      const promptText = buildInsightsPrompt({
        financialData: context,
        userCity: userCity,
        months: activeMonthsCount,
        dateRange: dateRange,
        hasSalarySlip: data.salarySlips.length > 0,
        hasNetWorth: data.investments.length > 0,
        macro: macro
      });

      console.log('[Kosha] Constructed prompt for AI insights:\n', promptText);

      const runWithGemini = async (modelName: string) => {
        const body = {
          contents: [
            { role: 'user', parts: [{ text: promptText }] }
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 }
        };

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
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
        return await generateInsightsWithGroq(
          promptText,
          'Please generate the financial insights JSON now according to your system instructions and user context.',
          groqApiKey
        );
      };

      if (apiKey) {
        try {
          setLoadingText('Gemini 2.5 Flash is reading your financial data...');
          resultText = await runWithGemini('gemini-2.5-flash');
          activeModelLabel = 'Gemini 2.5 Flash';
          
          // Validate JSON block directly
          const match = resultText.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('Response does not contain a JSON block');
          JSON.parse(match[0]);
        } catch (geminiErr: any) {
          console.warn('Gemini 2.5 failed, trying Gemini 2.0:', geminiErr.message || geminiErr);
          try {
            setLoadingText('Gemini 2.5 failed — trying Gemini 2.0 Flash...');
            resultText = await runWithGemini('gemini-2.0-flash');
            activeModelLabel = 'Gemini 2.0 Flash';
            
            // Validate JSON block from Gemini 2.0
            const match = resultText.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('Response does not contain a JSON block');
            JSON.parse(match[0]);
          } catch (gemini2Err: any) {
            console.warn('Gemini 2.0 failed too:', gemini2Err.message || gemini2Err);
            if (groqApiKey) {
              setLoadingText('Gemini models failed — switching to Groq (Llama 3.3 70B)...');
              console.log('Switching to Groq fallback...');
              resultText = await runWithGroq();
              activeModelLabel = 'Groq · Llama 3.3';
            } else {
              throw new Error(`Gemini failed: ${geminiErr.message || geminiErr}. (Groq key not configured).`);
            }
          }
        }
      } else {
        setLoadingText('Groq is reading your financial data and crafting insights...');
        resultText = await runWithGroq();
        activeModelLabel = 'Groq · Llama 3.3';
      }

      console.log(`Insights generation success via ${activeModelLabel}`);
      console.log('Raw text returned by AI:', resultText);

      const match = resultText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse AI response');
      const parsed = JSON.parse(match[0]);
      const list: Insight[] = parsed.insights ?? [];
      const confidence = parsed.dataConfidence ?? '';
      const at = new Date().toLocaleString('en-IN');
      
      setInsights(list);
      setDataConfidence(confidence);
      setLastUpdated(at);
      setProviderUsed(activeModelLabel);
      await db.settings.put({
        key: 'cachedInsights',
        value: {
          insights: list,
          at,
          provider: activeModelLabel,
          dataConfidence: confidence,
          macro: macroContext
        }
      });
    } catch (e: any) {
      console.error('Insights generation failed:', e);
      console.log('Raw text returned by AI:', resultText);
      const isParseFail = e.message.includes('JSON') || e.message.includes('Could not parse');
      const errorMsg = isParseFail && resultText
        ? `Could not parse AI response. Raw Response: "${resultText.substring(0, 250)}${resultText.length > 250 ? '...' : ''}"`
        : (e.message ?? 'Unknown error');
      setError(errorMsg);
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
              via {providerUsed}
            </span>
          )}
          {dataConfidence && (
            <span className={`confidence-tag confidence-${dataConfidence.toLowerCase()}`}>
              Data Confidence: {dataConfidence.charAt(0).toUpperCase() + dataConfidence.slice(1)}
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
        <>
          <div className="macro-source-panel glass-card">
            <div className="macro-panel-header-row">
              <button 
                className="macro-panel-toggle-btn"
                onClick={() => setShowMacroPopup(true)}
              >
                <span>🌐 Live Indian Macroeconomic Context</span>
                <span className="macro-toggle-banner">Click for more details</span>
              </button>
              
              <button 
                className="btn btn-secondary btn-xs macro-refresh-btn"
                onClick={handleRefreshMacro}
                disabled={refreshingMacro}
                title="Fetch latest live search macroeconomic context"
              >
                {refreshingMacro ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                <span>{refreshingMacro ? 'Refreshing...' : 'Fetch Live Data'}</span>
              </button>
            </div>
          </div>

          <div className="insights-grid" style={{ marginTop: '16px' }}>
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
        </>
      )}

      {showMacroPopup && (
        <div className="macro-modal-overlay animate-fade-in" onClick={() => setShowMacroPopup(false)}>
          <div className="macro-modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="macro-modal-header">
              <div>
                <h2>🌐 Indian Macroeconomic Context</h2>
                <p>Live search-grounded tax and policy rates consultable for financial planning.</p>
              </div>
              <button className="macro-modal-close-btn" onClick={() => setShowMacroPopup(false)}>
                &times;
              </button>
            </header>

            <div className="macro-modal-body">
              <div className="macro-grid">
                {/* CPI Inflation */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.cpiInflation.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.cpiInflation.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">CPI Inflation Rate</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.cpiInflation.color, fontSize: getValFontSize(macroContext.cpiInflation) }}>{macroContext.cpiInflation}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.cpiInflation}</span>
                </div>

                {/* RBI Repo Rate */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.repoRate.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.repoRate.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">RBI Repo Rate</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.repoRate.color, fontSize: getValFontSize(macroContext.repoRate) }}>{macroContext.repoRate}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.repoRate}</span>
                </div>

                {/* Section 80C */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.section80CLimit.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.section80CLimit.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">Section 80C Limit</span>
                      <span className="macro-badge old-regime">Old Regime Only</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.section80CLimit.color, fontSize: getValFontSize(macroContext.section80CLimit) }}>{macroContext.section80CLimit}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.section80CLimit}</span>
                </div>

                {/* NPS 80CCD */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.nps80CCDLimit.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.nps80CCDLimit.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">NPS 80CCD(1B) Limit</span>
                      <span className="macro-badge old-regime">Old Regime Only</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.nps80CCDLimit.color, fontSize: getValFontSize(macroContext.nps80CCDLimit) }}>{macroContext.nps80CCDLimit}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.nps80CCDLimit}</span>
                </div>

                {/* Standard Deduction */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.standardDeductionNewRegime.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.standardDeductionNewRegime.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">Std. Deduction (New)</span>
                      <span className="macro-badge new-regime">New Regime</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.standardDeductionNewRegime.color, fontSize: getValFontSize(macroContext.standardDeductionNewRegime) }}>{macroContext.standardDeductionNewRegime}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.standardDeductionNewRegime}</span>
                </div>

                {/* Basic Exemption */}
                <div className="macro-item" style={{ borderColor: MACRO_THEMES.basicExemptionNewRegime.borderColor, background: `linear-gradient(135deg, ${MACRO_THEMES.basicExemptionNewRegime.bg} 0%, transparent 100%)` }}>
                  <div className="macro-header">
                    <div className="macro-title-row">
                      <span className="macro-label">Basic Exemption (New)</span>
                      <span className="macro-badge new-regime">New Regime</span>
                    </div>
                    <span className="macro-val" style={{ color: MACRO_THEMES.basicExemptionNewRegime.color, fontSize: getValFontSize(macroContext.basicExemptionNewRegime) }}>{macroContext.basicExemptionNewRegime}</span>
                  </div>
                  <span className="macro-desc">{MACRO_DEFINITIONS.basicExemptionNewRegime}</span>
                </div>
              </div>

              <div className="macro-meta-info">
                <span>Sources: {macroContext.sources}</span>
                <span>Fetched on: {new Date(macroContext.fetchedAt).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
