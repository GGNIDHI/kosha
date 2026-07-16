import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, recordNetWorthSnapshot, autoRepairTransactionDates } from '../../db/database';
import type { SalarySlipMapping } from '../../db/database';
import { formatAmount } from '../../utils/currency';
import { detectRecurring } from '../../utils/recurringDetector';
import { computeHealthScore } from '../../utils/healthScore';
import { buildCashForecast } from '../../utils/cashForecast';
import { getReconciledPairs, getReconciledTransfers } from '../../utils/reconciliation';
import {
  PiggyBank,
  Wallet,
  CircleDollarSign,
  Sparkles,
  RefreshCw,
  CalendarDays,
  X,
} from 'lucide-react';

import { RecurringPopup } from './RecurringPopup';
import { MeterDetailModal } from './MeterDetailModal';
import { DashboardMeters } from './DashboardMeters';
import { DashboardStats } from './DashboardStats';
import { DashboardHealthScore } from './DashboardHealthScore';
import { DashboardCharts } from './DashboardCharts';
import { DashboardDetailsGrid } from './DashboardDetailsGrid';

import './DashboardView.css';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
      end: `${year}-${pad(month)}-${pad(endDay)}`,
    });
    day += 7;
    week++;
  }
  return buckets;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [currency, setCurrency] = useState('INR');
  const [recurringPopup, setRecurringPopup] = useState<string | null>(null);
  const [activeMeterDetail, setActiveMeterDetail] = useState<'expense' | 'savings' | 'investment' | 'budget' | 'debt' | 'tax' | 'income' | 'net_worth' | null>(null);
  const [mappings, setMappings] = useState<SalarySlipMapping[]>([]);

  // ── Period Selector State ─────────────────────────────────────────────────
  const [selYear, setSelYear] = useState<string>('all'); // 'all' | '2025' | '2026'
  const [selMonth, setSelMonth] = useState<string>('all'); // 'all' | '01'..'12'
  const [selWeek, setSelWeek] = useState<string>('all'); // 'all' | 'Wk1 (1–7)' label
  const hasAutoSelected = useRef(false);

  useEffect(() => {
    autoRepairTransactionDates()
      .then(repairedCount => {
        if (repairedCount > 0) {
          console.warn(`Auto-repaired ${repairedCount} transaction dates on dashboard mount.`);
        }
      })
      .catch(err => console.error('Auto date repair failed:', err));
    getSetting('currency', 'INR').then(setCurrency);
    getSetting<SalarySlipMapping[]>('salarySlipMappings', []).then(setMappings);
  }, []);

  const raw = useLiveQuery(async () => {
    const transactions = await db.transactions.toArray();
    const investments = await db.investments.toArray();
    const salarySlips = await db.salarySlips.toArray();
    const budgets = await db.budgets.toArray();
    const debts = await db.debts.toArray();
    const netWorthHistory = await db.netWorthSnapshots.orderBy('date').toArray();
    const decisions = await db.reconDecisions.toArray();
    const categories = await db.categories.toArray();
    return { transactions, investments, salarySlips, budgets, debts, netWorthHistory, decisions, categories };
  }, []) || { transactions: [], investments: [], salarySlips: [], budgets: [], debts: [], netWorthHistory: [], decisions: [], categories: [] };

  const { transactions, investments, salarySlips, budgets, debts, netWorthHistory, decisions, categories } = raw;

  const investmentCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach(cat => {
      if (cat.type === 'investment') {
        set.add(cat.label);
      }
    });
    return set;
  }, [categories]);

  const neutralCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach(cat => {
      if (cat.type === 'neutral') {
        set.add(cat.label);
      }
    });
    return set;
  }, [categories]);

  const reconciledPairs = useMemo(() => {
    return getReconciledPairs(transactions, salarySlips, decisions || []);
  }, [transactions, salarySlips, decisions]);

  const reconciledTxIds = useMemo(() => {
    const ids = new Set<string>();
    reconciledPairs.forEach(p => {
      if (p.status === 'accepted') {
        ids.add(p.transaction.id!);
      }
    });
    return ids;
  }, [reconciledPairs]);

  const reconciledTransfers = useMemo(() => {
    return getReconciledTransfers(transactions, decisions || []);
  }, [transactions, decisions]);

  const transferTxIds = useMemo(() => {
    const ids = new Set<string>();
    reconciledTransfers.forEach(p => {
      if (p.status === 'accepted') {
        ids.add(p.bankTx.id!);
        ids.add(p.cardTx.id!);
      }
    });
    return ids;
  }, [reconciledTransfers]);

  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    const bannerFlag = localStorage.getItem('kosha_show_smart_review_banner') === 'true';
    if (bannerFlag && (reconciledPairs.length > 0 || reconciledTransfers.length > 0)) {
      setShowBanner(true);
    } else {
      setShowBanner(false);
    }
  }, [reconciledPairs, reconciledTransfers]);

  // ── Auto-select most recent month with data on first load ─────────────────
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (transactions.length === 0) return;
    // Filter out invalid/malformed months
    const allMonths = [...new Set(transactions.map(tx => {
      const dStr = tx.date;
      if (typeof dStr === 'string' && dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3 && parts[0].length === 4 && parts[1].length === 2) {
          return `${parts[0]}-${parts[1]}`;
        }
      }
      return '';
    }).filter(m => m !== ''))].sort().reverse();

    if (allMonths.length === 0) return;
    const [year, month] = allMonths[0].split('-');
    if (year && month && !isNaN(parseInt(year)) && !isNaN(parseInt(month))) {
      setSelYear(year);
      setSelMonth(month);
      hasAutoSelected.current = true;
    }
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
    const idx = parseInt(selMonth) - 1;
    const mName = (!isNaN(idx) && MN[idx]) ? MN[idx] : 'Unknown';
    if (selWeek === 'all') return `${mName} ${selYear}`;
    return `${selWeek} · ${mName} ${selYear}`;
  }, [selYear, selMonth, selWeek]);

  // ── Aggregates (all-time for net worth) ───────────────────────────────────
  const cashBalance = transactions.reduce((s, tx) => {
    if (tx.type === 'credit') {
      return reconciledTxIds.has(tx.id!) ? s : s + tx.amount;
    } else {
      return s - tx.amount;
    }
  }, 0);
  const portfolioValue = investments.reduce((s, inv) => s + inv.quantity * (inv.currentPrice || inv.avgCost), 0);

  const allTimeSalaryInvestments = useMemo(() => {
    let total = 0;
    salarySlips.forEach(slip => {
      total += (slip.providentFund || 0);
      slip.deductionsBreakdown?.forEach(d => {
        const match = mappings.find(m => {
          if (m.componentType !== 'deduction') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = d.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'investment') {
          total += d.amount;
        }
      });
    });
    return total;
  }, [salarySlips, mappings]);

  const netWorth = cashBalance + portfolioValue + allTimeSalaryInvestments;

  // ── Period metrics ────────────────────────────────────────────────────────
  const periodIncome = periodTxs.filter(tx => tx.type === 'credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!) && !neutralCategories.has(tx.category)).reduce((s, tx) => s + tx.amount, 0);
  const periodExpenses = periodTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!) && !neutralCategories.has(tx.category)).reduce((s, tx) => s + tx.amount, 0);
  const periodSavings = periodIncome - periodExpenses;

  // Filter salary slips for the selected period
  const periodSlips = useMemo(() => {
    return salarySlips.filter(slip => {
      if (selYear !== 'all' && String(slip.year) !== selYear) return false;
      if (selMonth !== 'all' && String(slip.month).padStart(2, '0') !== selMonth) return false;
      return true;
    });
  }, [salarySlips, selYear, selMonth]);

  // Sum PF over the period slips
  const pfForPeriod = useMemo(() => {
    return periodSlips.reduce((sum, slip) => sum + (slip.providentFund || 0), 0);
  }, [periodSlips]);

  // Custom salary mappings sums
  const mappedInvestments = useMemo(() => {
    let total = 0;
    periodSlips.forEach(slip => {
      slip.deductionsBreakdown?.forEach(d => {
        const match = mappings.find(m => {
          if (m.componentType !== 'deduction') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = d.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'investment') {
          total += d.amount;
        }
      });
    });
    return total;
  }, [periodSlips, mappings]);

  const mappedSavings = useMemo(() => {
    let total = 0;
    periodSlips.forEach(slip => {
      slip.earningsBreakdown?.forEach(e => {
        const match = mappings.find(m => {
          if (m.componentType !== 'earning') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = e.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'savings') {
          total += e.amount;
        }
      });
      slip.deductionsBreakdown?.forEach(d => {
        const match = mappings.find(m => {
          if (m.componentType !== 'deduction') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = d.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'savings') {
          total += d.amount;
        }
      });
    });
    return total;
  }, [periodSlips, mappings]);

  // ── Meter computations ────────────────────────────────────────────────────
  const rawSavingsRate = periodIncome > 0 ? ((periodSavings + mappedSavings) / periodIncome) * 100 : 0;
  const savingsRate = isNaN(rawSavingsRate) ? 0 : rawSavingsRate;
  const savingsRateClamped = Math.min(100, Math.max(0, savingsRate));

  const rawExpenseRate = periodIncome > 0 ? (periodExpenses / periodIncome) * 100 : 0;
  const expenseRate = isNaN(rawExpenseRate) ? 0 : Math.min(100, Math.max(0, rawExpenseRate));

  const periodInvestmentDebits = periodTxs.filter(tx => tx.type === 'debit' && investmentCategories.has(tx.category)).reduce((s, tx) => s + tx.amount, 0);
  const rawInvestmentRate = periodIncome > 0 ? ((periodInvestmentDebits + pfForPeriod + mappedInvestments) / periodIncome) * 100 : 0;
  const investmentRate = isNaN(rawInvestmentRate) ? 0 : Math.min(100, Math.max(0, rawInvestmentRate));

  const budgetCompliancePct = budgets.length > 0
    ? Math.round((budgets.filter(b => {
      const spent = periodTxs.filter(tx => tx.type === 'debit' && tx.category === b.category).reduce((s, tx) => s + tx.amount, 0);
      return spent <= b.monthlyLimit;
    }).length / budgets.length) * 100)
    : 100;

  const totalMonthlyEmi = debts.reduce((s, d) => s + d.emiAmount, 0);
  const rawDtiRate = periodIncome > 0 ? (totalMonthlyEmi / periodIncome) * 100 : 0;
  const dtiRate = isNaN(rawDtiRate) ? 0 : Math.min(100, Math.max(0, rawDtiRate));

  // Tax calculations
  const periodTaxDeducted = useMemo(() => {
    return periodSlips.reduce((sum, slip) => sum + (slip.taxDeducted || 0), 0);
  }, [periodSlips]);

  const mappedTaxes = useMemo(() => {
    let total = 0;
    periodSlips.forEach(slip => {
      slip.deductionsBreakdown?.forEach(d => {
        const match = mappings.find(m => {
          if (m.componentType !== 'deduction') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = d.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'tax') {
          total += d.amount;
        }
      });
      slip.earningsBreakdown?.forEach(e => {
        const match = mappings.find(m => {
          if (m.componentType !== 'earning') return false;
          const mapName = m.componentName.trim().toLowerCase();
          const slipName = e.name.trim().toLowerCase();
          return slipName.includes(mapName) || mapName.includes(slipName);
        });
        if (match && match.targetCategory === 'tax') {
          total += e.amount;
        }
      });
    });
    return total;
  }, [periodSlips, mappings]);

  const periodLedgerTaxes = useMemo(() => {
    return periodTxs
      .filter(tx => tx.type === 'debit' && tx.category.toLowerCase() === 'tax')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [periodTxs]);

  const totalTaxPaid = periodTaxDeducted + mappedTaxes + periodLedgerTaxes;
  const rawTaxRate = periodIncome > 0 ? (totalTaxPaid / periodIncome) * 100 : 0;
  const taxRate = isNaN(rawTaxRate) ? 0 : Math.min(100, Math.max(0, rawTaxRate));

  // ── Category Chart ────────────────────────────────────────────────────────
  const categoryChartData = useMemo(() => {
    const totals: Record<string, { amount: number; count: number; maxDesc: string; maxVal: number }> = {};
    let totalSpent = 0;

    const filteredDebits = periodTxs.filter(
      tx => tx.type === 'debit' && !transferTxIds.has(tx.id!) && !neutralCategories.has(tx.category)
    );

    filteredDebits.forEach(tx => {
      totalSpent += tx.amount;
      if (!totals[tx.category]) {
        totals[tx.category] = { amount: 0, count: 0, maxDesc: '', maxVal: 0 };
      }
      totals[tx.category].amount += tx.amount;
      totals[tx.category].count += 1;
      if (tx.amount > totals[tx.category].maxVal) {
        totals[tx.category].maxVal = tx.amount;
        totals[tx.category].maxDesc = tx.description;
      }
    });

    const categoryColorMap: Record<string, string> = {};
    const categoryEmojiMap: Record<string, string> = {};
    categories.forEach(c => {
      categoryColorMap[c.label] = c.color || '#6b7280';
      categoryEmojiMap[c.label] = c.emoji;
    });

    return Object.entries(totals)
      .map(([name, stat]) => {
        const val = Math.round(stat.amount);
        return {
          name,
          value: val,
          percentage: totalSpent > 0 ? (val / totalSpent) * 100 : 0,
          count: stat.count,
          emoji: categoryEmojiMap[name] || '📦',
          color: categoryColorMap[name] || '#6b7280',
          maxTxDesc: stat.maxDesc || 'N/A',
          maxTxValue: stat.maxVal,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [periodTxs, transferTxIds, neutralCategories, categories]);

  // ── Financial Trend Chart data ────────────────────────────────────────────
  const trendChartData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');

    // Week view: by day
    if (selYear !== 'all' && selMonth !== 'all' && selWeek !== 'all') {
      const bucket = weekBuckets.find(b => b.label === selWeek);
      if (!bucket) return [];
      const days: Record<string, { label: string; income: number; expenses: number; savings: number; investments: number }> = {};
      let cur = new Date(bucket.start);
      const end = new Date(bucket.end);
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        days[key] = { label: `${cur.getDate()}/${cur.getMonth() + 1}`, income: 0, expenses: 0, savings: 0, investments: 0 };
        cur.setDate(cur.getDate() + 1);
      }
      periodTxs.forEach(tx => {
        if (!days[tx.date]) return;
        if (neutralCategories.has(tx.category)) return;
        if (tx.type === 'credit') {
          if (!reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)) {
            days[tx.date].income += tx.amount;
          }
        }
        else {
          if (!transferTxIds.has(tx.id!)) {
            days[tx.date].expenses += tx.amount;
            if (investmentCategories.has(tx.category)) days[tx.date].investments += tx.amount;
          }
        }
      });
      return Object.values(days).map(d => ({ ...d, savings: d.income - d.expenses }));
    }

    // Month view: by week bucket
    if (selYear !== 'all' && selMonth !== 'all') {
      return weekBuckets.map(b => {
        const bTxs = transactions.filter(tx => tx.date >= b.start && tx.date <= b.end && !neutralCategories.has(tx.category));
        const inc = bTxs.filter(tx => tx.type === 'credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        const exp = bTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        const inv = bTxs.filter(tx => tx.type === 'debit' && investmentCategories.has(tx.category) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        return { label: b.label, income: inc, expenses: exp, savings: inc - exp, investments: inv };
      });
    }

    // Year view: all 12 months
    if (selYear !== 'all') {
      return Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
        const key = `${selYear}-${pad(m)}`;
        const mTxs = transactions.filter(tx => tx.date.startsWith(key) && !neutralCategories.has(tx.category));
        const inc = mTxs.filter(tx => tx.type === 'credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        const exp = mTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        const inv = mTxs.filter(tx => tx.type === 'debit' && investmentCategories.has(tx.category) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
        return { label: MN[m - 1], income: inc, expenses: exp, savings: inc - exp, investments: inv };
      });
    }

    // All time: by month (all months we have data for)
    const allKeys = [...new Set(transactions.map(tx => tx.date.slice(0, 7)))].sort();
    return allKeys.map(key => {
      const mTxs = transactions.filter(tx => tx.date.startsWith(key) && !neutralCategories.has(tx.category));
      const inc = mTxs.filter(tx => tx.type === 'credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
      const exp = mTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
      const inv = mTxs.filter(tx => tx.type === 'debit' && investmentCategories.has(tx.category) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0);
      return { label: `${MN[parseInt(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`, income: inc, expenses: exp, savings: inc - exp, investments: inv };
    });
  }, [transactions, periodTxs, selYear, selMonth, selWeek, weekBuckets, reconciledTxIds, transferTxIds, investmentCategories, neutralCategories]);

  // ── Existing 30-day forecast (always uses all-time data) ─────────────────
  const recurringAll = detectRecurring(transactions);
  const recurringTxs = recurringAll.slice(0, 5);
  const totalMonthlyRecurring = recurringTxs.filter(r => r.frequency === 'monthly').reduce((s, r) => s + r.averageAmount, 0);
  const forecastData = buildCashForecast(cashBalance, salarySlips, recurringTxs);
  const forecastMin = Math.min(...forecastData.map(d => d.projected));

  // ── Filtered lists ────────────────────────────────────────────────────────
  const recentTransactions = [...periodTxs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentSalarySlips = [...salarySlips].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month).slice(0, 3);

  const budgetHealth = budgets.map(b => {
    const spent = periodTxs.filter(tx => tx.type === 'debit' && tx.category === b.category).reduce((s, tx) => s + tx.amount, 0);
    return { ...b, spent, pct: Math.round((spent / b.monthlyLimit) * 100) };
  }).sort((a, b) => b.pct - a.pct);

  const healthScore = computeHealthScore(periodTxs, budgets, salarySlips, totalMonthlyRecurring, cashBalance, investmentCategories);

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
    <div className="view-container animate-fade-in-opacity">
      {/* Recurring popup */}
      {recurringPopup && (
        <RecurringPopup
          description={recurringPopup}
          allTransactions={transactions}
          currency={currency}
          onClose={() => setRecurringPopup(null)}
        />
      )}

      {/* Meter detail modal */}
      {activeMeterDetail && (
        <MeterDetailModal
          type={activeMeterDetail}
          onClose={() => setActiveMeterDetail(null)}
          periodTxs={periodTxs}
          transactions={transactions}
          periodSlips={periodSlips}
          reconciledTxIds={reconciledTxIds}
          transferTxIds={transferTxIds}
          currency={currency}
          debts={debts}
          budgets={budgets}
          periodIncome={periodIncome}
          periodExpenses={periodExpenses}
          periodSavings={periodSavings}
          mappings={mappings}
          cashBalance={cashBalance}
          portfolioValue={portfolioValue}
          allTimeSalaryInvestments={allTimeSalaryInvestments}
          salarySlips={salarySlips}
          categories={categories}
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

      {showBanner && (
        <div className="glass-card smart-review-toast" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          background: 'rgba(139, 92, 246, 0.08)',
          borderColor: 'hsla(263, 90%, 65%, 0.3)',
          marginBottom: '16px',
          borderRadius: 'var(--border-radius-lg)',
          boxShadow: '0 0 15px rgba(139, 92, 246, 0.1)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={18} style={{ color: 'var(--primary)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Smart Review Pending
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                We detected {reconciledPairs.length + reconciledTransfers.length} potential duplicate transactions/transfers from your recent upload/entry.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => {
                localStorage.removeItem('kosha_show_smart_review_banner');
                onNavigate('smart_review');
              }}
              style={{
                background: 'var(--primary)',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Review Now
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('kosha_show_smart_review_banner');
                setShowBanner(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.25rem',
                padding: '4px',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── All Time Worth Banner (always all-time, not period-filtered) ──── */}
      <div className="glass-card net-worth-banner" onClick={() => setActiveMeterDetail('net_worth')} style={{ cursor: 'pointer' }}>
        <div className="banner-details">
          <div className="details-header">
            <PiggyBank size={24} className="banner-icon-piggy" />
            <span>All Time Worth</span>
            <span className="banner-alltime-tag">All Time</span>
          </div>
          <h2>{formatAmount(netWorth, currency)}</h2>
          <p>Running total of all cash in &amp; out + current investment portfolio value</p>
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
            {MN.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
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
      <DashboardMeters
        periodLabel={periodLabel}
        expenseRate={expenseRate}
        savingsRateClamped={savingsRateClamped}
        investmentRate={investmentRate}
        taxRate={taxRate}
        budgetCompliancePct={budgetCompliancePct}
        dtiRate={dtiRate}
        budgetsLength={budgets.length}
        debtsLength={debts.length}
        onMeterClick={setActiveMeterDetail}
      />

      {/* ── Period Summary Cards ─────────────────────────────────────────── */}
      <DashboardStats
        periodLabel={periodLabel}
        periodIncome={periodIncome}
        periodExpenses={periodExpenses}
        savingsRate={savingsRate}
        periodSavings={periodSavings}
        currency={currency}
        onStatClick={setActiveMeterDetail}
      />

      {/* ── Financial Health Score ────────────────────────────────────────── */}
      <DashboardHealthScore
        hasData={periodTxs.length > 0}
        healthScore={healthScore}
      />

      {/* ── Charts Grid ───────────────────────────────────────────────────── */}
      <DashboardCharts
        periodLabel={periodLabel}
        currency={currency}
        categoryChartData={categoryChartData}
        trendChartData={trendChartData}
        forecastData={forecastData}
        forecastMin={forecastMin}
        netWorthChartData={netWorthChartData}
        transactions={transactions}
        reconciledTxIds={reconciledTxIds}
      />

      {/* ── Lists Row ─────────────────────────────────────────────────────── */}
      <DashboardDetailsGrid
        periodLabel={periodLabel}
        currency={currency}
        budgetHealth={budgetHealth}
        recurringTxs={recurringTxs}
        totalMonthlyRecurring={totalMonthlyRecurring}
        recentTransactions={recentTransactions}
        recentSalarySlips={recentSalarySlips}
        onNavigate={onNavigate}
        onRecurringClick={setRecurringPopup}
      />
    </div>
  );
};
