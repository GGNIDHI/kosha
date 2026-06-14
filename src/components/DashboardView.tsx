import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, recordNetWorthSnapshot } from '../db/database';
import type { Transaction } from '../db/database';
import { formatAmount } from '../utils/currency';
import { detectRecurring } from '../utils/recurringDetector';
import { computeHealthScore } from '../utils/healthScore';
import { buildCashForecast } from '../utils/cashForecast';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import {
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  CircleDollarSign,
  ArrowRight,
  Sparkles,
  Target,
  RefreshCw,
  TrendingUp,
  CalendarDays,
  X,
  BarChart2,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MNF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COLORS: Record<string, string> = {
  Food:'#f97316', Shopping:'#a855f7', Utilities:'#06b6d4',
  Travel:'#eab308', Salary:'#22c55e', Investment:'#3b82f6',
  Health:'#ef4444', Entertainment:'#ec4899', Others:'#6b7280',
};

// ── Helper: get week buckets for a YYYY-MM ──────────────────────────────────
function getWeekBuckets(year: number, month: number): { label: string; start: string; end: string }[] {
  const buckets: { label: string; start: string; end: string }[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  let day = 1;
  let week = 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  while (day <= daysInMonth) {
    const endDay = Math.min(day + 6, daysInMonth);
    buckets.push({
      label: `Wk${week} (${day}–${endDay})`,
      start: `${year}-${pad(month)}-${pad(day)}`,
      end:   `${year}-${pad(month)}-${pad(endDay)}`,
    });
    day += 7;
    week++;
  }
  return buckets;
}

// ── Recurring Spend Popup ───────────────────────────────────────────────────
interface RecurringPopupProps {
  description: string;
  allTransactions: Transaction[];
  currency: string;
  onClose: () => void;
}

const RecurringPopup: React.FC<RecurringPopupProps> = ({ description, allTransactions, currency, onClose }) => {
  const history = allTransactions
    .filter(tx => tx.description === description)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Monthly totals for chart
  const monthlyMap: Record<string, number> = {};
  history.forEach(tx => {
    const key = tx.date.slice(0, 7);
    monthlyMap[key] = (monthlyMap[key] || 0) + tx.amount;
  });
  const chartData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amt]) => ({
      label: `${MN[parseInt(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
      amount: amt,
    }));

  const total = history.reduce((s, t) => s + t.amount, 0);
  const avg = history.length > 0 ? total / history.length : 0;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <div>
            <h3 className="popup-title">{description}</h3>
            <p className="popup-subtitle">Full transaction history across all time</p>
          </div>
          <button className="popup-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="popup-stats-row">
          <div className="popup-stat">
            <span className="popup-stat-label">Total Spent</span>
            <span className="popup-stat-value">{formatAmount(total, currency)}</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-label">Avg per Transaction</span>
            <span className="popup-stat-value">{formatAmount(avg, currency)}</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-label">Occurrences</span>
            <span className="popup-stat-value">{history.length}</span>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="popup-chart">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  formatter={(v: any) => [formatAmount(Number(v), currency), 'Spent']}
                />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {history.map((tx, i) => (
                <tr key={i}>
                  <td>{tx.date}</td>
                  <td><span className="cat-tag">{tx.category}</span></td>
                  <td className="amt-cell debit-color">−{formatAmount(tx.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Main Dashboard ──────────────────────────────────────────────────────────
export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [currency, setCurrency] = useState('INR');
  const [recurringPopup, setRecurringPopup] = useState<string | null>(null);

  // ── Period Selector State ─────────────────────────────────────────────────
  const [selYear,  setSelYear]  = useState<string>('all');   // 'all' | '2025' | '2026'
  const [selMonth, setSelMonth] = useState<string>('all');   // 'all' | '01'..'12'
  const [selWeek,  setSelWeek]  = useState<string>('all');   // 'all' | 'Wk1 (1–7)' label
  const hasAutoSelected = React.useRef(false);

  useEffect(() => {
    getSetting('currency', 'INR').then(setCurrency);
  }, []);

  const raw = useLiveQuery(async () => {
    const transactions    = await db.transactions.toArray();
    const investments     = await db.investments.toArray();
    const salarySlips     = await db.salarySlips.toArray();
    const budgets         = await db.budgets.toArray();
    const debts           = await db.debts.toArray();
    const netWorthHistory = await db.netWorthSnapshots.orderBy('date').toArray();
    return { transactions, investments, salarySlips, budgets, debts, netWorthHistory };
  }, []) || { transactions: [], investments: [], salarySlips: [], budgets: [], debts: [], netWorthHistory: [] };

  const { transactions, investments, salarySlips, budgets, debts, netWorthHistory } = raw;

  // ── Auto-select most recent month with data on first load ─────────────────
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (transactions.length === 0) return;
    const allMonths = [...new Set(transactions.map(tx => tx.date.slice(0, 7)))].sort().reverse();
    if (allMonths.length === 0) return;
    const [year, month] = allMonths[0].split('-');
    setSelYear(year);
    setSelMonth(month);
    hasAutoSelected.current = true;
  }, [transactions]);

  // ── Derived: available years ──────────────────────────────────────────────
  const availableYears = useMemo(() =>
    [...new Set(transactions.map(tx => tx.date.slice(0, 4)))].sort().reverse(),
  [transactions]);

  // ── Week buckets for selected year+month ─────────────────────────────────
  const weekBuckets = useMemo(() => {
    if (selYear === 'all' || selMonth === 'all') return [];
    return getWeekBuckets(parseInt(selYear), parseInt(selMonth));
  }, [selYear, selMonth]);

  // ── Filter transactions to selected period ────────────────────────────────
  const periodTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (selYear !== 'all' && !tx.date.startsWith(selYear)) return false;
      if (selMonth !== 'all') {
        const monthStr = `${selYear}-${selMonth}`;
        if (!tx.date.startsWith(monthStr)) return false;
      }
      if (selWeek !== 'all') {
        const bucket = weekBuckets.find(b => b.label === selWeek);
        if (bucket && (tx.date < bucket.start || tx.date > bucket.end)) return false;
      }
      return true;
    });
  }, [transactions, selYear, selMonth, selWeek, weekBuckets]);

  // ── Period label for display ──────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (selYear === 'all') return 'All Time';
    if (selMonth === 'all') return selYear;
    if (selWeek === 'all') return `${MN[parseInt(selMonth)-1]} ${selYear}`;
    return `${selWeek} · ${MN[parseInt(selMonth)-1]} ${selYear}`;
  }, [selYear, selMonth, selWeek]);

  // ── Aggregates (all-time for net worth) ───────────────────────────────────
  const cashBalance    = transactions.reduce((s, tx) => tx.type === 'credit' ? s + tx.amount : s - tx.amount, 0);
  const portfolioValue = investments.reduce((s, inv) => s + inv.quantity * (inv.currentPrice || inv.avgCost), 0);
  const netWorth       = cashBalance + portfolioValue;

  // ── Period metrics ────────────────────────────────────────────────────────
  const periodIncome   = periodTxs.filter(tx => tx.type === 'credit').reduce((s,tx) => s+tx.amount, 0);
  const periodExpenses = periodTxs.filter(tx => tx.type === 'debit').reduce((s,tx) => s+tx.amount, 0);
  const periodSavings  = periodIncome - periodExpenses;
  const savingsRate    = periodIncome > 0 ? (periodSavings / periodIncome) * 100 : 0;

  // ── Meter computations ────────────────────────────────────────────────────
  const expenseRate = periodIncome > 0 ? Math.min(100, (periodExpenses / periodIncome) * 100) : 0;
  const savingsRateClamped = Math.min(100, Math.max(0, savingsRate));

  const latestSlip = [...salarySlips].sort((a,b) => b.year !== a.year ? b.year-a.year : b.month-a.month)[0];
  const pfForPeriod = latestSlip?.providentFund ?? 0;
  const periodInvestmentDebits = periodTxs.filter(tx => tx.type==='debit' && tx.category==='Investment').reduce((s,tx)=>s+tx.amount,0);
  const investmentRate = periodIncome > 0 ? Math.min(100, ((periodInvestmentDebits + pfForPeriod) / periodIncome) * 100) : 0;

  const budgetCompliancePct = budgets.length > 0
    ? Math.round((budgets.filter(b => {
        const spent = periodTxs.filter(tx => tx.type==='debit' && tx.category===b.category).reduce((s,tx)=>s+tx.amount,0);
        return spent <= b.monthlyLimit;
      }).length / budgets.length) * 100)
    : 100;

  const totalMonthlyEmi = debts.reduce((s,d) => s+d.emiAmount, 0);
  const dtiRate = periodIncome > 0 ? Math.min(100, (totalMonthlyEmi / periodIncome) * 100) : 0;

  // ── Category Chart ────────────────────────────────────────────────────────
  const categoryChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    periodTxs.filter(tx => tx.type === 'debit').forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a,b) => b.value-a.value);
  }, [periodTxs]);

  // ── Financial Trend Chart data ────────────────────────────────────────────
  const trendChartData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2,'0');

    // Week view: by day
    if (selYear !== 'all' && selMonth !== 'all' && selWeek !== 'all') {
      const bucket = weekBuckets.find(b => b.label === selWeek);
      if (!bucket) return [];
      const days: Record<string, { label:string; income:number; expenses:number; savings:number; investments:number }> = {};
      let cur = new Date(bucket.start);
      const end = new Date(bucket.end);
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        days[key] = { label: `${cur.getDate()}/${cur.getMonth()+1}`, income:0, expenses:0, savings:0, investments:0 };
        cur.setDate(cur.getDate()+1);
      }
      periodTxs.forEach(tx => {
        if (!days[tx.date]) return;
        if (tx.type==='credit') days[tx.date].income += tx.amount;
        else { days[tx.date].expenses += tx.amount; if(tx.category==='Investment') days[tx.date].investments += tx.amount; }
      });
      return Object.values(days).map(d => ({ ...d, savings: d.income - d.expenses }));
    }

    // Month view: by week bucket
    if (selYear !== 'all' && selMonth !== 'all') {
      return weekBuckets.map(b => {
        const bTxs = transactions.filter(tx => tx.date >= b.start && tx.date <= b.end);
        const inc = bTxs.filter(tx=>tx.type==='credit').reduce((s,tx)=>s+tx.amount,0);
        const exp = bTxs.filter(tx=>tx.type==='debit').reduce((s,tx)=>s+tx.amount,0);
        const inv = bTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment').reduce((s,tx)=>s+tx.amount,0);
        return { label: b.label, income:inc, expenses:exp, savings:inc-exp, investments:inv };
      });
    }

    // Year view: all 12 months
    if (selYear !== 'all') {
      return Array.from({length:12},(_,i)=>i+1).map(m => {
        const key = `${selYear}-${pad(m)}`;
        const mTxs = transactions.filter(tx => tx.date.startsWith(key));
        const inc = mTxs.filter(tx=>tx.type==='credit').reduce((s,tx)=>s+tx.amount,0);
        const exp = mTxs.filter(tx=>tx.type==='debit').reduce((s,tx)=>s+tx.amount,0);
        const inv = mTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment').reduce((s,tx)=>s+tx.amount,0);
        return { label:MN[m-1], income:inc, expenses:exp, savings:inc-exp, investments:inv };
      });
    }

    // All time: by month (all months we have data for)
    const allKeys = [...new Set(transactions.map(tx=>tx.date.slice(0,7)))].sort();
    return allKeys.map(key => {
      const mTxs = transactions.filter(tx=>tx.date.startsWith(key));
      const inc = mTxs.filter(tx=>tx.type==='credit').reduce((s,tx)=>s+tx.amount,0);
      const exp = mTxs.filter(tx=>tx.type==='debit').reduce((s,tx)=>s+tx.amount,0);
      const inv = mTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment').reduce((s,tx)=>s+tx.amount,0);
      return { label:`${MN[parseInt(key.slice(5,7))-1]} ${key.slice(2,4)}`, income:inc, expenses:exp, savings:inc-exp, investments:inv };
    });
  }, [transactions, periodTxs, selYear, selMonth, selWeek, weekBuckets]);

  // ── Existing 30-day forecast (always uses all-time data) ─────────────────
  const recurringAll  = detectRecurring(transactions);
  const recurringTxs  = recurringAll.slice(0, 5);
  const totalMonthlyRecurring = recurringTxs.filter(r=>r.frequency==='monthly').reduce((s,r)=>s+r.averageAmount,0);
  const forecastData  = buildCashForecast(cashBalance, salarySlips, recurringTxs);
  const forecastMin   = Math.min(...forecastData.map(d=>d.projected));

  // ── Filtered lists ────────────────────────────────────────────────────────
  const recentTransactions = [...periodTxs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const recentSalarySlips  = [...salarySlips].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month).slice(0,3);

  const budgetHealth = budgets.map(b => {
    const spent = periodTxs.filter(tx=>tx.type==='debit'&&tx.category===b.category).reduce((s,tx)=>s+tx.amount,0);
    return { ...b, spent, pct: Math.round((spent/b.monthlyLimit)*100) };
  }).sort((a,b)=>b.pct-a.pct);

  const healthScore = computeHealthScore(periodTxs, budgets, salarySlips, totalMonthlyRecurring, cashBalance);

  const netWorthChartData = netWorthHistory.slice(-12).map(s => ({
    label: s.id, netWorth: s.netWorth, cash: s.cashBalance, portfolio: s.portfolioValue,
  }));

  useEffect(() => {
    if (transactions.length > 0) recordNetWorthSnapshot(netWorth, cashBalance, portfolioValue);
  }, [netWorth, cashBalance, portfolioValue, transactions.length]);

  // Reset downstream selectors when parent changes
  const handleYearChange = (y: string) => { setSelYear(y); setSelMonth('all'); setSelWeek('all'); };
  const handleMonthChange = (m: string) => { setSelMonth(m); setSelWeek('all'); };

  return (
    <div className="view-container animate-fade-in">
      {/* Recurring popup */}
      {recurringPopup && (
        <RecurringPopup
          description={recurringPopup}
          allTransactions={transactions}
          currency={currency}
          onClose={() => setRecurringPopup(null)}
        />
      )}

      <header className="view-header-row">
        <div>
          <h1>Dashboard</h1>
          <p>Your comprehensive financial overview — all data, any period.</p>
        </div>
        <div className="badge-ai-status glow-active">
          <Sparkles size={14} className="primary-color" />
          <span>AI Parsing Active</span>
        </div>
      </header>

      {/* ── Period Selector ──────────────────────────────────────────────── */}
      <div className="glass-card period-selector-card">
        <CalendarDays size={16} className="period-icon" />
        <span className="period-label-text">View Period:</span>

        <select className="form-select period-select" value={selYear} onChange={e => handleYearChange(e.target.value)}>
          <option value="all">All Time</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {selYear !== 'all' && (
          <select className="form-select period-select" value={selMonth} onChange={e => handleMonthChange(e.target.value)}>
            <option value="all">All Months</option>
            {MN.map((m,i) => <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
        )}

        {selYear !== 'all' && selMonth !== 'all' && weekBuckets.length > 0 && (
          <select className="form-select period-select" value={selWeek} onChange={e => setSelWeek(e.target.value)}>
            <option value="all">All Weeks</option>
            {weekBuckets.map(b => <option key={b.label} value={b.label}>{b.label}</option>)}
          </select>
        )}

        <span className="period-active-badge">{periodLabel}</span>

        {(selYear !== 'all') && (
          <button className="period-reset-btn" onClick={() => {
            const allMonths = [...new Set(transactions.map(tx => tx.date.slice(0, 7)))].sort().reverse();
            if (allMonths.length > 0) {
              const [y, m] = allMonths[0].split('-');
              setSelYear(y); setSelMonth(m); setSelWeek('all');
            } else {
              setSelYear('all'); setSelMonth('all'); setSelWeek('all');
            }
          }}>
            <X size={13} /> Reset
          </button>
        )}
      </div>

      {/* ── Financial Meters ─────────────────────────────────────────────── */}
      <div className="meters-section">
        <div className="meters-header">
          <span className="meters-title">Financial Meters · {periodLabel}</span>
        </div>
        <div className="meters-row">
          <MeterGauge label="Expense Rate" subtitle="of income spent" value={expenseRate} displayValue={`${Math.round(expenseRate)}%`} thresholds={{ ok: 60, warn: 80 }} lowIsGood helpText={expenseRate > 80 ? 'High! Reduce discretionary spending.' : expenseRate > 60 ? 'Moderate. Watch spending.' : 'Healthy spending level.'} />
          <MeterGauge label="Savings Rate" subtitle="of income saved" value={savingsRateClamped} displayValue={`${Math.round(savingsRateClamped)}%`} thresholds={{ ok: 20, warn: 10 }} lowIsGood={false} helpText={savingsRateClamped >= 20 ? 'Excellent! Keep it up.' : savingsRateClamped >= 10 ? 'Good. Push past 20%.' : 'Low. Try to save 10%+'} />
          <MeterGauge label="Investment Rate" subtitle="of income invested" value={investmentRate} displayValue={`${Math.round(investmentRate)}%`} thresholds={{ ok: 15, warn: 5 }} lowIsGood={false} helpText={investmentRate >= 15 ? 'Strong! Wealth is growing.' : investmentRate >= 5 ? 'Decent. Push to 15%.' : 'Low. Start a SIP.'} />
          <MeterGauge label="Budget Compliance" subtitle="categories in limit" value={budgetCompliancePct} displayValue={`${budgetCompliancePct}%`} thresholds={{ ok: 80, warn: 50 }} lowIsGood={false} helpText={budgets.length === 0 ? 'Set budgets to track.' : budgetCompliancePct === 100 ? 'Perfect! All budgets on track.' : budgetCompliancePct >= 80 ? 'A few categories over.' : 'Several budgets exceeded.'} />
          <MeterGauge label="Debt-to-Income" subtitle="of income on EMIs" value={dtiRate} displayValue={`${Math.round(dtiRate)}%`} thresholds={{ ok: 30, warn: 50 }} lowIsGood helpText={debts.length === 0 ? 'No active debts. Great!' : dtiRate <= 30 ? 'Healthy DTI.' : dtiRate <= 50 ? 'Moderate. Avoid new loans.' : 'High DTI. Prioritise payoff.'} />
        </div>
      </div>

      {/* ── Net Worth Banner ─────────────────────────────────────────────── */}
      <div className="glass-card net-worth-banner">
        <div className="banner-details">
          <div className="details-header">
            <PiggyBank size={24} className="banner-icon-piggy" />
            <span>Total Consolidated Net Worth</span>
          </div>
          <h2>{formatAmount(netWorth, currency)}</h2>
          <p>Combined liquid cash balances and stock market investments (all-time)</p>
        </div>
        <div className="banner-sub-stats">
          <div className="sub-stat-item border-right-glass">
            <div className="sub-label"><Wallet size={16} className="secondary-color" /><span>Liquid Cash</span></div>
            <h4>{formatAmount(cashBalance, currency)}</h4>
          </div>
          <div className="sub-stat-item">
            <div className="sub-label"><CircleDollarSign size={16} className="primary-color" /><span>Portfolio</span></div>
            <h4>{formatAmount(portfolioValue, currency)}</h4>
          </div>
        </div>
      </div>

      {/* ── Period Summary Cards ─────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Income · {periodLabel}</span>
            <div className="stat-icon-wrapper success-bg"><ArrowDownLeft size={16} className="success-color" /></div>
          </div>
          <span className="stat-value">{formatAmount(periodIncome, currency)}</span>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Expenses · {periodLabel}</span>
            <div className="stat-icon-wrapper danger-bg"><ArrowUpRight size={16} className="danger-color" /></div>
          </div>
          <span className="stat-value">{formatAmount(periodExpenses, currency)}</span>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Savings Rate · {periodLabel}</span>
            <div className="stat-icon-wrapper primary-bg"><PiggyBank size={16} className="primary-color" /></div>
          </div>
          <div className="stat-value-group">
            <span className="stat-value">{savingsRate.toFixed(1)}%</span>
            <span className="pnl-percent badge badge-category">{formatAmount(periodSavings, currency)} saved</span>
          </div>
        </div>
      </div>

      {/* ── Financial Health Score ────────────────────────────────────────── */}
      <div className="glass-card health-score-card">
        {periodTxs.length === 0 ? (
          <div className="hsc-empty">
            <TrendingUp size={32} style={{ color: '#6b7280', opacity: 0.4 }} />
            <p className="hsc-empty-title">No Data Yet</p>
            <p className="hsc-empty-sub">Parse or add transactions to calculate your financial health score.</p>
          </div>
        ) : (
          <>
            <div className="hsc-left">
              <div className="hsc-gauge-wrap">
                <svg viewBox="0 0 120 70" className="hsc-gauge-svg">
                  <path d="M10,70 A60,60 0 0,1 110,70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round"/>
                  <path d="M10,70 A60,60 0 0,1 110,70" fill="none" stroke={healthScore.colour} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(healthScore.total/100)*157} 157`}
                    style={{ filter:`drop-shadow(0 0 6px ${healthScore.colour})` }} />
                  <text x="60" y="68" textAnchor="middle" fontSize="22" fontWeight="800" fill={healthScore.colour}>{healthScore.total}</text>
                </svg>
              </div>
              <div className="hsc-grade" style={{ color: healthScore.colour }}>{healthScore.grade}</div>
              <p className="hsc-title">Financial Health</p>
            </div>
            <div className="hsc-components">
              {([
                { compLabel:'Savings Rate',     ...healthScore.savingsRate },
                { compLabel:'Budget Adherence', ...healthScore.budgetAdherence },
                { compLabel:'Emergency Fund',   ...healthScore.emergencyFund },
                { compLabel:'Investment Rate',  ...healthScore.investmentRate },
                { compLabel:'Subscriptions',    ...healthScore.subscriptionBurden },
              ] as {compLabel:string;score:number;max:number;value:number;label:string}[]).map(c => (
                <div key={c.compLabel} className="hsc-component-row">
                  <div className="hsc-comp-meta">
                    <span className="hsc-comp-label">{c.compLabel}</span>
                    <span className="hsc-comp-score">{c.score}/{c.max}</span>
                  </div>
                  <div className="hsc-comp-bar">
                    <div className="hsc-comp-fill" style={{ width:`${(c.score/c.max)*100}%`, background:healthScore.colour }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="hsc-tip"><TrendingUp size={14} className="primary-color" /><span>{healthScore.savingsRate.label} • {healthScore.emergencyFund.label}</span></div>
          </>
        )}
      </div>

      {/* ── Charts Grid ───────────────────────────────────────────────────── */}
      <div className="charts-dashboard-grid">
        {/* Category Bar Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Expenses by Category <span className="chart-subtitle">· {periodLabel}</span></h3>
          </div>
          <div className="chart-wrapper-body">
            {categoryChartData.length === 0 ? (
              <div className="empty-chart-state"><p>No expenses for this period yet.</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChartData}>
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background:'#0c111d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#fff' }}
                    formatter={(v:any)=>[formatAmount(Number(v),currency),'Spent']} />
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {categoryChartData.map((entry,i) => <Cell key={i} fill={COLORS[entry.name]||'#6b7280'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Income vs Expenses Area Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Cash Flow <span className="chart-subtitle">· Last 6 months</span></h3>
          </div>
          <div className="chart-wrapper-body">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={(() => {
                const monthsData: Record<string,{monthName:string;income:number;expenses:number}> = {};
                for (let i=5;i>=0;i--) {
                  const d=new Date(); d.setMonth(d.getMonth()-i);
                  const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                  monthsData[key]={monthName:`${MN[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,income:0,expenses:0};
                }
                transactions.forEach(tx=>{
                  const k=tx.date.slice(0,7);
                  if(monthsData[k]){if(tx.type==='credit')monthsData[k].income+=tx.amount;else monthsData[k].expenses+=tx.amount;}
                });
                return Object.values(monthsData);
              })()}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="monthName" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background:'#0c111d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#fff' }}
                  formatter={(v:any)=>[formatAmount(Number(v),currency)]} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" name="Income" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" name="Expenses" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Financial Trend Chart (period-aware, 4 lines) ─────────────────── */}
      <div className="glass-card dashboard-chart-card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <BarChart2 size={18} className="primary-color" />
            <h3>Financial Trend <span className="chart-subtitle">· {periodLabel}</span></h3>
          </div>
        </div>
        <div className="chart-wrapper-body">
          {trendChartData.length === 0 ? (
            <div className="empty-chart-state"><p>No data for selected period.</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChartData} margin={{ top:5, right:10, left:10, bottom:0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v:number) => `₹${v>=1000?`${(v/1000).toFixed(0)}k`:v}`} />
                <Tooltip contentStyle={{ background:'#0c111d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#fff' }}
                  formatter={(v:any,name:any)=>[formatAmount(Number(v),currency), name.charAt(0).toUpperCase()+name.slice(1)]} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Line type="monotone" dataKey="income"      name="income"      stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{r:4}} />
                <Line type="monotone" dataKey="expenses"    name="expenses"    stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{r:4}} />
                <Line type="monotone" dataKey="savings"     name="savings"     stroke="#8b5cf6" strokeWidth={2}   dot={false} activeDot={{r:4}} strokeDasharray="6 2" />
                <Line type="monotone" dataKey="investments" name="investments" stroke="#3b82f6" strokeWidth={2}   dot={false} activeDot={{r:4}} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 30-day Forecast ───────────────────────────────────────────────── */}
      <div className="glass-card dashboard-chart-card">
        <div className="card-header">
          <h3>30-Day Cash Flow Forecast</h3>
          <span className="chart-subtitle">Projected balance based on salary &amp; recurring debits</span>
        </div>
        <div className="chart-wrapper-body">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={forecastData} margin={{ top:5, right:5, left:10, bottom:0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} interval={4} />
              <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v:number) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background:'#0c111d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#fff' }}
                formatter={(v:any)=>[formatAmount(Number(v),currency),'Projected Balance']}
                labelFormatter={(l)=>`Date: ${l}`} />
              {forecastMin < 0 && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />}
              <Area type="monotone" dataKey="projected" stroke="#06b6d4" strokeWidth={2} fill="url(#forecastGrad)" dot={false} activeDot={{r:4}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Net Worth History ─────────────────────────────────────────────── */}
      {netWorthChartData.length > 1 && (
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Net Worth History</h3>
            <span className="chart-subtitle">Monthly snapshot — cash + portfolio</span>
          </div>
          <div className="chart-wrapper-body">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={netWorthChartData} margin={{ top:5, right:5, left:10, bottom:0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v:number) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background:'#0c111d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'8px', color:'#fff' }}
                  formatter={(v:any,name:any) => [formatAmount(Number(v),currency), name==='netWorth'?'Net Worth':name==='cash'?'Cash':'Portfolio']} />
                <Legend wrapperStyle={{fontSize:'11px',color:'#9ca3af'}} />
                <Line type="monotone" dataKey="netWorth"  name="netWorth"  stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="cash"      name="cash"      stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="portfolio" name="portfolio" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Lists Row ─────────────────────────────────────────────────────── */}
      <div className="dashboard-lists-row">

        {/* Budget Health */}
        {budgetHealth.length > 0 && (
          <div className="glass-card dashboard-list-card">
            <div className="list-card-header">
              <h3><Target size={16} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />Budget Health · {periodLabel}</h3>
              <button className="btn-link" onClick={() => onNavigate('budgets')}><span>Manage</span><ArrowRight size={14} /></button>
            </div>
            <div className="list-card-body">
              <div className="budget-health-list">
                {budgetHealth.map(b => (
                  <div key={b.category} className="bh-item">
                    <div className="bh-meta">
                      <span className="bh-cat">{b.category}</span>
                      <span className={`bh-pct ${b.pct>=100?'over':b.pct>=80?'warn':'ok'}`}>{b.pct}%</span>
                    </div>
                    <div className="bh-bar-track">
                      <div className="bh-bar-fill" style={{ width:`${Math.min(100,b.pct)}%`, background:b.pct>=100?'#ef4444':b.pct>=80?'#f97316':'#22c55e' }} />
                    </div>
                    <div className="bh-amounts">
                      <span>{formatAmount(b.spent,currency)}</span>
                      <span className="text-muted">/ {formatAmount(b.monthlyLimit,currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recurring Spend — clickable for popup */}
        {recurringTxs.length > 0 && (
          <div className="glass-card dashboard-list-card">
            <div className="list-card-header">
              <h3><RefreshCw size={15} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />Recurring Spend</h3>
              {totalMonthlyRecurring > 0 && <span className="recurring-monthly-total">{formatAmount(totalMonthlyRecurring,currency)}/mo</span>}
            </div>
            <div className="list-card-body">
              <div className="mini-ledger-list">
                {recurringTxs.map((r,i) => (
                  <div key={i} className="mini-ledger-item recurring-clickable" onClick={() => setRecurringPopup(r.description)}
                    title="Click to see full history">
                    <div className="item-details">
                      <span className="item-desc">{r.description}</span>
                      <span className="item-meta">{r.category} · last {r.lastDate}</span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                      <span className="item-value debit">{formatAmount(r.averageAmount,currency)}</span>
                      <span className={`recurring-freq-badge freq-${r.frequency}`}>{r.frequency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="glass-card dashboard-list-card">
          <div className="list-card-header">
            <h3>Recent Ledger · {periodLabel}</h3>
            <button className="btn-link" onClick={() => onNavigate('ledger')}><span>View All</span><ArrowRight size={14} /></button>
          </div>
          <div className="list-card-body">
            {recentTransactions.length === 0 ? (
              <div className="empty-list-state"><p>No transactions for this period.</p></div>
            ) : (
              <div className="mini-ledger-list">
                {recentTransactions.map(tx => (
                  <div key={tx.id} className="mini-ledger-item">
                    <div className="item-details">
                      <span className="item-desc">{tx.description}</span>
                      <span className="item-meta">{tx.date} · {tx.category}</span>
                    </div>
                    <span className={`item-value ${tx.type}`}>{tx.type==='credit'?'+':'-'} {formatAmount(tx.amount,currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Salary History */}
        <div className="glass-card dashboard-list-card">
          <div className="list-card-header">
            <h3>AI Parsed Salary History</h3>
            <button className="btn-link" onClick={() => onNavigate('uploads')}><span>Analyze New</span><ArrowRight size={14} /></button>
          </div>
          <div className="list-card-body">
            {recentSalarySlips.length === 0 ? (
              <div className="empty-list-state"><p>Upload salary slip PDFs to compile your income profile.</p></div>
            ) : (
              <div className="salary-history-list">
                {recentSalarySlips.map(slip => (
                  <div key={slip.id} className="salary-history-item">
                    <div className="item-details">
                      <span className="item-desc">{MNF[slip.month-1]} {slip.year}</span>
                      <span className="item-meta">Basic: {formatAmount(slip.basicPay,currency)} · Deductions: {formatAmount(slip.providentFund+slip.taxDeducted+slip.otherDeductions,currency)}</span>
                    </div>
                    <div className="salary-takehome">
                      <span className="salary-takehome-val">{formatAmount(slip.netPay,currency)}</span>
                      <span className="salary-takehome-lbl">Net Credit</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        /* ── Layout ── */
        .view-container {
          flex: 1; padding: 32px 40px; height: 100vh;
          overflow-y: auto; overflow-x: hidden;
          display: flex; flex-direction: column; gap: 24px;
        }

        .view-header-row {
          display: flex; align-items: flex-start;
          justify-content: space-between; flex-wrap: wrap; gap: 12px;
        }

        .view-header-row h1 { font-size: 2.2rem; font-weight: 800; margin-bottom: 4px; }
        .view-header-row p  { color: var(--text-secondary); font-size: 1rem; }

        /* ── Period Selector ── */
        .period-selector-card {
          display: flex; align-items: center; gap: 12px; padding: 14px 20px; flex-wrap: wrap;
        }

        .period-icon { color: var(--primary); flex-shrink: 0; }
        .period-label-text { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }

        .period-select {
          min-width: 120px; max-width: 160px;
          padding: 7px 12px; font-size: 0.85rem;
        }

        .period-active-badge {
          margin-left: auto; font-size: 0.78rem; font-weight: 700;
          padding: 4px 12px; border-radius: 20px;
          background: var(--primary-glow); color: var(--primary);
          border: 1px solid var(--primary); white-space: nowrap;
        }

        .period-reset-btn {
          display: flex; align-items: center; gap: 5px;
          background: transparent; border: 1px solid var(--border-glass);
          color: var(--text-muted); font-size: 0.78rem; font-weight: 600;
          padding: 5px 10px; border-radius: var(--border-radius-md);
          cursor: pointer; transition: var(--transition-smooth);
        }

        .period-reset-btn:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-glow); }

        /* ── Badge ── */
        .badge-ai-status {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.8rem; font-weight: 600;
          background: var(--primary-glow); border: 1px solid rgba(139,92,246,0.2);
          padding: 6px 12px; border-radius: 20px; color: var(--text-primary);
        }

        /* ── Meters Section ── */
        .meters-section { display: flex; flex-direction: column; gap: 10px; }
        .meters-header { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
        .meters-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }

        .meters-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        @media (max-width: 900px) { .meters-row { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .meters-row { grid-template-columns: repeat(2, 1fr); } }

        .meter-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 18px 12px 14px; text-align: center;
          position: relative; border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-lg); transition: border-color .25s, transform .2s;
        }
        .meter-card:hover { transform: translateY(-2px); }
        .meter-svg { overflow: visible; }
        .meter-label { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
        .meter-subtitle { font-size: 0.7rem; color: var(--text-muted); margin-top: -4px; }
        .meter-helptext { font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; max-width: 130px; }

        /* ── Net Worth Banner ── */
        .net-worth-banner {
          background: linear-gradient(135deg, hsla(263,60%,8%,0.7) 0%, hsla(190,60%,8%,0.7) 100%), var(--bg-card);
          padding: 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;
        }
        .banner-details { display: flex; flex-direction: column; gap: 6px; }
        .details-header { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; }
        .banner-icon-piggy { color: var(--primary); }
        .banner-details h2 {
          font-family: var(--font-heading); font-size: 2.5rem; font-weight: 800;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--secondary) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .banner-details p { font-size: 0.85rem; color: var(--text-muted); }
        .banner-sub-stats { display: flex; gap: 24px; background: rgba(0,0,0,0.2); border-radius: var(--border-radius-md); padding: 16px 24px; }
        .sub-stat-item { display: flex; flex-direction: column; gap: 6px; }
        .border-right-glass { border-right: 1px solid var(--border-glass); padding-right: 24px; }
        .sub-label { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted); }
        .sub-stat-item h4 { font-size: 1.3rem; font-weight: 700; }
        .secondary-color { color: var(--secondary); }

        /* ── Stat Cards ── */
        .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 700px) { .stats-row { grid-template-columns: 1fr; } }

        .stat-card { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .stat-card-header { display: flex; justify-content: space-between; align-items: center; }
        .stat-label { font-size: 0.82rem; font-weight: 600; color: var(--text-muted); }
        .stat-icon-wrapper { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
        .success-bg { background: var(--success-glow); }
        .danger-bg  { background: var(--danger-glow); }
        .primary-bg { background: var(--primary-glow); }
        .success-color { color: var(--success); }
        .danger-color  { color: var(--danger); }
        .primary-color { color: var(--primary); }
        .stat-value { font-size: 1.6rem; font-weight: 800; font-family: var(--font-heading); }
        .stat-value-group { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .pnl-percent { font-size: 0.82rem; }
        .badge { padding: 3px 8px; border-radius: 8px; font-weight: 600; }
        .badge-category { background: rgba(139,92,246,0.1); color: var(--primary); border: 1px solid rgba(139,92,246,0.2); }

        /* ── Health Score ── */
        .health-score-card { display: flex; align-items: center; gap: 32px; padding: 24px 32px; flex-wrap: wrap; }
        .hsc-left { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 140px; }
        .hsc-gauge-svg { width: 130px; overflow: visible; }
        .hsc-grade { font-size: 2rem; font-weight: 900; line-height: 1; }
        .hsc-title { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; text-align: center; }
        .hsc-components { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 240px; }
        .hsc-component-row { display: flex; flex-direction: column; gap: 3px; }
        .hsc-comp-meta { display: flex; justify-content: space-between; }
        .hsc-comp-label { font-size: 0.78rem; color: var(--text-secondary); font-weight: 500; }
        .hsc-comp-score { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
        .hsc-comp-bar { height: 5px; background: rgba(255,255,255,.05); border-radius: 99px; overflow: hidden; }
        .hsc-comp-fill { height: 100%; border-radius: 99px; transition: width .6s cubic-bezier(.4,0,.2,1); }
        .hsc-tip { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-muted); padding-top: 12px; border-top: 1px solid var(--border-glass); width: 100%; }
        .hsc-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 24px 0; }
        .hsc-empty-title { font-size: 1rem; font-weight: 700; color: var(--text-muted); }
        .hsc-empty-sub   { font-size: 0.8rem; color: var(--text-muted); opacity: 0.6; text-align: center; max-width: 280px; line-height: 1.5; }

        /* ── Charts Grid ── */
        .charts-dashboard-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        @media (max-width: 900px) { .charts-dashboard-grid { grid-template-columns: 1fr; } }

        .dashboard-chart-card { padding: 0; overflow: hidden; }
        .card-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; flex-wrap: wrap; gap: 8px; }
        .card-header h3 { font-size: 1rem; font-weight: 600; }
        .chart-subtitle { font-size: 0.75rem; color: var(--text-muted); font-weight: 400; margin-left: 4px; }
        .chart-wrapper-body { padding: 16px 12px 20px; }
        .empty-chart-state { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-muted); font-size: 0.9rem; }

        /* ── Lists Row ── */
        .dashboard-lists-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        @media (max-width: 900px) { .dashboard-lists-row { grid-template-columns: 1fr; } }

        .dashboard-list-card { padding: 0; overflow: hidden; }
        .list-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-glass); }
        .list-card-header h3 { font-size: 0.95rem; font-weight: 600; }
        .list-card-body { padding: 12px 20px 16px; }

        .btn-link { display: flex; align-items: center; gap: 4px; background: transparent; border: none; color: var(--primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: var(--transition-smooth); font-family: var(--font-body); }
        .btn-link:hover { color: hsl(263, 90%, 75%); }

        .mini-ledger-list { display: flex; flex-direction: column; gap: 2px; }
        .mini-ledger-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 8px; border-radius: var(--border-radius-md); transition: var(--transition-smooth); }
        .mini-ledger-item:hover { background: rgba(255,255,255,0.03); }

        .recurring-clickable { cursor: pointer; }
        .recurring-clickable:hover { background: rgba(139,92,246,0.06) !important; border-radius: var(--border-radius-md); }

        .item-details { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .item-desc { font-size: 0.88rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-meta { font-size: 0.75rem; color: var(--text-muted); }
        .item-value { font-size: 0.9rem; font-weight: 700; white-space: nowrap; }
        .item-value.credit { color: var(--success); }
        .item-value.debit  { color: var(--danger); }

        .recurring-monthly-total { font-size: 0.82rem; font-weight: 700; color: var(--danger); background: rgba(239,68,68,0.08); padding: 3px 9px; border-radius: 99px; border: 1px solid rgba(239,68,68,0.15); }
        .recurring-freq-badge { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; background: rgba(99,102,241,0.12); color: var(--primary); }

        /* ── Budget Health ── */
        .budget-health-list { display: flex; flex-direction: column; gap: 10px; }
        .bh-item { display: flex; flex-direction: column; gap: 4px; }
        .bh-meta { display: flex; justify-content: space-between; }
        .bh-cat { font-size: 0.85rem; font-weight: 500; }
        .bh-pct { font-size: 0.82rem; font-weight: 700; }
        .bh-pct.ok   { color: var(--success); }
        .bh-pct.warn { color: #f97316; }
        .bh-pct.over { color: var(--danger); }
        .bh-bar-track { height: 5px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; }
        .bh-bar-fill  { height: 100%; border-radius: 99px; transition: width .6s ease; }
        .bh-amounts { display: flex; gap: 4px; font-size: 0.78rem; color: var(--text-muted); }
        .text-muted { color: var(--text-muted); }

        /* ── Salary History ── */
        .salary-history-list { display: flex; flex-direction: column; gap: 4px; }
        .salary-history-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 8px; border-radius: var(--border-radius-md); transition: var(--transition-smooth); }
        .salary-history-item:hover { background: rgba(255,255,255,0.03); }
        .salary-takehome { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .salary-takehome-val { font-size: 1rem; font-weight: 700; color: var(--success); }
        .salary-takehome-lbl { font-size: 0.7rem; color: var(--text-muted); }

        /* ── Empty States ── */
        .empty-list-state { padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; }

        /* ── Recurring Popup ── */
        .popup-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: fadeIn 0.2s ease;
        }

        .popup-modal {
          background: hsl(224, 60%, 7%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6);
          width: 100%; max-width: 560px; max-height: 80vh;
          display: flex; flex-direction: column;
          animation: fadeIn 0.25s cubic-bezier(.16,1,.3,1);
          overflow: hidden;
        }

        .popup-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 22px 24px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .popup-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 3px; }
        .popup-subtitle { font-size: 0.8rem; color: var(--text-muted); }

        .popup-close {
          background: transparent; border: none; color: var(--text-muted);
          cursor: pointer; padding: 4px; border-radius: 8px;
          display: flex; align-items: center; transition: var(--transition-smooth);
        }
        .popup-close:hover { color: var(--danger); background: var(--danger-glow); }

        .popup-stats-row {
          display: flex; gap: 0;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .popup-stat {
          flex: 1; padding: 14px 20px;
          border-right: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column; gap: 4px;
        }
        .popup-stat:last-child { border-right: none; }
        .popup-stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .popup-stat-value { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }

        .popup-chart { padding: 16px 12px 0; }

        .popup-table-wrap {
          flex: 1; overflow-y: auto; padding: 0 24px 24px;
          margin-top: 12px;
        }

        .popup-table {
          width: 100%; border-collapse: collapse; font-size: 0.85rem;
        }
        .popup-table th {
          text-align: left; padding: 8px 10px;
          font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em;
          color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .popup-table td {
          padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.04);
          color: var(--text-secondary);
        }
        .popup-table tr:last-child td { border-bottom: none; }

        .cat-tag {
          font-size: 0.72rem; padding: 2px 7px; border-radius: 8px;
          background: rgba(139,92,246,0.1); color: var(--primary);
          border: 1px solid rgba(139,92,246,0.2); font-weight: 600;
        }

        .amt-cell { font-weight: 700; }
        .debit-color { color: var(--danger); }
      `}</style>
    </div>
  );
};

// ── MeterGauge ───────────────────────────────────────────────────────────────
interface MeterGaugeProps {
  label: string; subtitle: string;
  value: number; displayValue: string;
  thresholds: { ok: number; warn: number };
  lowIsGood: boolean; helpText: string;
}

const MeterGauge: React.FC<MeterGaugeProps> = ({ label, subtitle, value, displayValue, thresholds, lowIsGood, helpText }) => {
  const getColour = () => {
    if (lowIsGood) {
      if (value <= thresholds.ok)   return '#22c55e';
      if (value <= thresholds.warn) return '#f97316';
      return '#ef4444';
    } else {
      if (value >= thresholds.ok)   return '#22c55e';
      if (value >= thresholds.warn) return '#f97316';
      return '#ef4444';
    }
  };
  const colour  = getColour();
  const r       = 46;
  const arcLen  = Math.PI * r;
  const filled  = (value / 100) * arcLen;
  const gap     = arcLen - filled;

  return (
    <div className="glass-card meter-card" style={{ borderColor: colour + '33' }}>
      <svg width="120" height="68" viewBox="0 0 120 68" className="meter-svg">
        <path d="M7,63 A53,53 0 0,1 113,63" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
        <path d="M7,63 A53,53 0 0,1 113,63" fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          style={{ filter:`drop-shadow(0 0 5px ${colour}88)`, transition:'stroke-dasharray .7s cubic-bezier(.4,0,.2,1)' }} />
        <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="800" fill={colour}>{displayValue}</text>
      </svg>
      <span className="meter-label">{label}</span>
      <span className="meter-subtitle">{subtitle}</span>
      <span className="meter-helptext">{helpText}</span>
    </div>
  );
};
