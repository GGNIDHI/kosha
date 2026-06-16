import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, recordNetWorthSnapshot, autoRepairTransactionDates } from '../db/database';
import type { Transaction, SalarySlip, Debt, Budget, SalarySlipMapping } from '../db/database';
import { formatAmount } from '../utils/currency';
import { detectRecurring } from '../utils/recurringDetector';
import { computeHealthScore } from '../utils/healthScore';
import { buildCashForecast } from '../utils/cashForecast';
import { getReconciledPairs, getReconciledTransfers } from '../utils/reconciliation';
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

interface MeterDetailModalProps {
  type: 'expense' | 'savings' | 'investment' | 'budget' | 'debt' | 'tax' | 'income' | 'net_worth';
  onClose: () => void;
  periodTxs: Transaction[];
  transactions: Transaction[];
  periodSlips: SalarySlip[];
  reconciledTxIds: Set<string>;
  transferTxIds: Set<string>;
  currency: string;
  debts: Debt[];
  budgets: Budget[];
  periodIncome: number;
  periodExpenses: number;
  periodSavings: number;
  mappings: SalarySlipMapping[];
  cashBalance: number;
  portfolioValue: number;
  allTimeSalaryInvestments: number;
  salarySlips: SalarySlip[];
}

const MeterDetailModal: React.FC<MeterDetailModalProps> = ({
  type,
  onClose,
  periodTxs,
  transactions,
  periodSlips,
  reconciledTxIds,
  transferTxIds,
  currency,
  debts,
  budgets,
  periodIncome,
  periodExpenses,
  periodSavings,
  mappings,
  cashBalance,
  portfolioValue,
  allTimeSalaryInvestments,
  salarySlips,
}) => {

  const pfForPeriod = useMemo(() => {
    return periodSlips.reduce((sum, slip) => sum + (slip.providentFund || 0), 0);
  }, [periodSlips]);

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

  const renderContent = () => {
    switch (type) {
      case 'income': {
        const allCredits = periodTxs.filter(tx => tx.type === 'credit' && !tx.id?.startsWith('sal-'));
        const creditsSorted = [...allCredits].sort((a, b) => b.date.localeCompare(a.date));

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Income</span>
                <span className="popup-stat-value text-success">{formatAmount(periodIncome, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Bank Credits</span>
                <span className="popup-stat-value text-success">
                  {formatAmount(allCredits.filter(tx => !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s, tx) => s + tx.amount, 0), currency)}
                </span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Salary Slips ({periodSlips.length})</span>
                <span className="popup-stat-value text-success">
                  {formatAmount(periodSlips.reduce((s, slip) => s + slip.netPay, 0), currency)}
                </span>
              </div>
            </div>

            <div className="modal-section-title">Income Calculation Rules</div>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              💡 Total Income includes all unique bank credits (inflows) and net take-home salary from your salary slips. Reconciled bank credits matched to salary slips are struck out to prevent double-counting.
            </p>

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">Salary Slips Summary</div>
                <div className="breakdown-list">
                  {periodSlips.length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No salary slips parsed for this period.</span>
                  ) : (
                    periodSlips.map((slip, idx) => (
                      <div key={idx} className="breakdown-item" style={{ padding: '8px 12px' }}>
                        <span className="breakdown-name">
                          Slip for {MN[slip.month - 1]} {slip.year}
                        </span>
                        <span className="breakdown-value text-success">+{formatAmount(slip.netPay, currency)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">All Bank Credits</div>
                <div className="popup-table-wrap" style={{ maxHeight: '200px' }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {creditsSorted.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center' }}>No bank credits for this period.</td></tr>
                      ) : (
                        creditsSorted.map((tx, idx) => {
                          const isReconciled = reconciledTxIds.has(tx.id!) || transferTxIds.has(tx.id!);
                          return (
                            <tr key={idx} style={isReconciled ? { opacity: 0.4 } : undefined}>
                              <td style={isReconciled ? { textDecoration: 'line-through' } : undefined}>{tx.date}</td>
                              <td style={isReconciled ? { textDecoration: 'line-through' } : undefined} className="truncate" title={tx.description}>
                                {tx.description}
                              </td>
                              <td className="amt-cell text-success" style={isReconciled ? { textDecoration: 'line-through' } : undefined}>
                                +{formatAmount(tx.amount, currency)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        );
      }

      case 'expense': {
        const categoriesMap: Record<string, number> = {};
        const debitTxs = periodTxs.filter(tx => tx.type === 'debit');
        debitTxs.forEach(tx => {
          categoriesMap[tx.category] = (categoriesMap[tx.category] || 0) + tx.amount;
        });
        const categoriesBreakdown = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1]);
        const topExpenses = [...debitTxs].sort((a, b) => b.amount - a.amount).slice(0, 10);

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Expenses</span>
                <span className="popup-stat-value text-danger">{formatAmount(periodExpenses, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Total Income</span>
                <span className="popup-stat-value text-success">{formatAmount(periodIncome, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Expense Rate</span>
                <span className="popup-stat-value">{periodIncome > 0 ? Math.round((periodExpenses / periodIncome) * 100) : 0}%</span>
              </div>
            </div>

            <div className="modal-section-title">Equation Formula</div>
            <div className="formula-card">
              <span className="formula-text">
                (Total Expenses / Total Income) × 100 = Expense Rate
              </span>
              <span className="formula-values">
                ({formatAmount(periodExpenses, currency)} / {formatAmount(periodIncome, currency)}) × 100 = {periodIncome > 0 ? Math.round((periodExpenses / periodIncome) * 100) : 0}%
              </span>
            </div>

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">Spend by Category</div>
                <div className="breakdown-list">
                  {categoriesBreakdown.length === 0 ? (
                    <p className="no-data-text">No expenses recorded for this period.</p>
                  ) : (
                    categoriesBreakdown.map(([cat, amt]) => (
                      <div key={cat} className="breakdown-item">
                        <span className="breakdown-name">{cat}</span>
                        <span className="breakdown-value">{formatAmount(amt, currency)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">Top Expenses</div>
                <div className="popup-table-wrap" style={{ maxHeight: '200px' }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Date</th><th>Category</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {topExpenses.map((tx, idx) => (
                        <tr key={idx}>
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
          </>
        );
      }

      case 'savings': {
        const allCredits = periodTxs.filter(tx => tx.type === 'credit' && !tx.id?.startsWith('sal-'));
        const creditsSorted = [...allCredits].sort((a, b) => b.date.localeCompare(a.date));

        const totalSavingsSum = periodSavings + mappedSavings;

        // Find individual mapped savings items to list them
        const mappedSavingsItems: { name: string; amount: number; type: 'earning' | 'deduction' }[] = [];
        periodSlips.forEach(slip => {
          slip.earningsBreakdown?.forEach(e => {
            const match = mappings.find(m => {
              if (m.componentType !== 'earning') return false;
              const mapName = m.componentName.trim().toLowerCase();
              const slipName = e.name.trim().toLowerCase();
              return slipName.includes(mapName) || mapName.includes(slipName);
            });
            if (match && match.targetCategory === 'savings') {
              mappedSavingsItems.push({ name: e.name, amount: e.amount, type: 'earning' });
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
              mappedSavingsItems.push({ name: d.name, amount: d.amount, type: 'deduction' });
            }
          });
        });

        // Check if there are slips parsed under older schema
        const hasOldSlips = periodSlips.length > 0 && periodSlips.some(s => !s.deductionsBreakdown || !s.earningsBreakdown);

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Income</span>
                <span className="popup-stat-value text-success">{formatAmount(periodIncome, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Total Expenses</span>
                <span className="popup-stat-value text-danger">{formatAmount(periodExpenses, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Total Savings</span>
                <span className="popup-stat-value" style={{ color: totalSavingsSum >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatAmount(totalSavingsSum, currency)}
                </span>
              </div>
            </div>

            <div className="modal-section-title">Equation Formula</div>
            <div className="formula-card">
              <span className="formula-text">
                ((Net Savings + Mapped Savings) / Total Income) × 100 = Savings Rate
              </span>
              <span className="formula-values">
                (({formatAmount(periodSavings, currency)} + {formatAmount(mappedSavings, currency)}) / {formatAmount(periodIncome, currency)}) × 100 = {periodIncome > 0 ? Math.round((totalSavingsSum / periodIncome) * 100) : 0}%
              </span>
            </div>

            {hasOldSlips && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#f97316', background: 'rgba(249,115,22,0.06)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.15)' }}>
                💡 Note: Some salary slips in this period were parsed under an older version. Delete and re-upload them in the PDF Analyzer page to apply component mappings.
              </p>
            )}

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">Mapped Salary Savings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {mappedSavingsItems.length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No salary slip components mapped to Savings. Configure mappings in Categories.</span>
                  ) : (
                    <div className="breakdown-list">
                      {mappedSavingsItems.map((item, idx) => (
                        <div key={idx} className="breakdown-item" style={{ padding: '8px 12px' }}>
                          <span className="breakdown-name">
                            {item.name}{' '}
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              ({item.type === 'earning' ? 'Earning' : 'Deduction'} mapped)
                            </span>
                          </span>
                          <span className="breakdown-value text-success">+{formatAmount(item.amount, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">Income Credits Breakdown</div>
                <p className="no-data-text" style={{ marginBottom: '8px', fontSize: '0.74rem', padding: 0, textAlign: 'left', color: 'var(--text-muted)' }}>
                  💡 Struck-out entries represent duplicate bank credits reconciled and excluded to avoid double-counting.
                </p>
                <div className="popup-table-wrap" style={{ maxHeight: '200px', marginTop: 0 }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {creditsSorted.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center' }}>No bank credits for this period.</td></tr>
                      ) : (
                        creditsSorted.map((tx, idx) => {
                          const isReconciled = reconciledTxIds.has(tx.id!) || transferTxIds.has(tx.id!);
                          return (
                            <tr key={idx} style={isReconciled ? { opacity: 0.4 } : undefined}>
                              <td style={isReconciled ? { textDecoration: 'line-through' } : undefined}>{tx.date}</td>
                              <td style={isReconciled ? { textDecoration: 'line-through' } : undefined} className="truncate" title={tx.description}>
                                {tx.description}
                              </td>
                              <td className="amt-cell text-success" style={isReconciled ? { textDecoration: 'line-through' } : undefined}>
                                +{formatAmount(tx.amount, currency)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        );
      }

      case 'investment': {
        const investTxs = periodTxs.filter(tx => tx.type === 'debit' && tx.category === 'Investment');
        const totalInvestedTxs = investTxs.reduce((s, tx) => s + tx.amount, 0);
        const totalInvestedSum = totalInvestedTxs + pfForPeriod + mappedInvestments;

        // Find individual mapped deductions to list them
        const mappedDeductionItems: { name: string; amount: number }[] = [];
        periodSlips.forEach(slip => {
          slip.deductionsBreakdown?.forEach(d => {
            const match = mappings.find(m => {
              if (m.componentType !== 'deduction') return false;
              const mapName = m.componentName.trim().toLowerCase();
              const slipName = d.name.trim().toLowerCase();
              return slipName.includes(mapName) || mapName.includes(slipName);
            });
            if (match && match.targetCategory === 'investment') {
              mappedDeductionItems.push({ name: d.name, amount: d.amount });
            }
          });
        });

        // Check if there are slips parsed under older schema
        const hasOldSlips = periodSlips.length > 0 && periodSlips.some(s => !s.deductionsBreakdown || !s.earningsBreakdown);

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Ledger Investments</span>
                <span className="popup-stat-value text-primary">{formatAmount(totalInvestedTxs, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">EPF & Mapped Deductions</span>
                <span className="popup-stat-value" style={{ color: 'var(--secondary)' }}>{formatAmount(pfForPeriod + mappedInvestments, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Total Invested</span>
                <span className="popup-stat-value text-success">{formatAmount(totalInvestedSum, currency)}</span>
              </div>
            </div>

            <div className="modal-section-title">Equation Formula</div>
            <div className="formula-card">
              <span className="formula-text">
                ((Ledger Investments + EPF + Mapped Deductions) / Total Income) × 100 = Investment Rate
              </span>
              <span className="formula-values">
                (({formatAmount(totalInvestedTxs, currency)} + {formatAmount(pfForPeriod + mappedInvestments, currency)}) / {formatAmount(periodIncome, currency)}) × 100 = {periodIncome > 0 ? Math.round((totalInvestedSum / periodIncome) * 100) : 0}%
              </span>
            </div>

            {hasOldSlips && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#f97316', background: 'rgba(249,115,22,0.06)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.15)' }}>
                💡 Note: Some salary slips in this period were parsed under an older version. Delete and re-upload them in the PDF Analyzer page to apply component mappings.
              </p>
            )}

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">EPF & Mapped Deductions (from Slips)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="formula-card" style={{ padding: '12px 16px', background: 'rgba(6,182,212,0.04)', borderColor: 'rgba(6,182,212,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>EPF Contribution</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--secondary)' }}>{formatAmount(pfForPeriod, currency)}</span>
                    </div>
                  </div>

                  {mappedDeductionItems.length > 0 && (
                    <div className="breakdown-list">
                      {mappedDeductionItems.map((item, idx) => (
                        <div key={idx} className="breakdown-item" style={{ padding: '8px 12px' }}>
                          <span className="breakdown-name">{item.name} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>(Mapped)</span></span>
                          <span className="breakdown-value text-success">+{formatAmount(item.amount, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {periodSlips.length === 0 && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No salary slips uploaded for this period.</span>
                  )}
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">Ledger Investment Transactions</div>
                <div className="popup-table-wrap" style={{ maxHeight: '200px', marginTop: 0 }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {investTxs.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center' }}>No investment debits in ledger.</td></tr>
                      ) : (
                        investTxs.map((tx, idx) => (
                          <tr key={idx}>
                            <td>{tx.date}</td>
                            <td className="truncate" title={tx.description}>{tx.description}</td>
                            <td className="amt-cell text-primary">{formatAmount(tx.amount, currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        );
      }

      case 'budget': {
        const budgetData = budgets.map(b => {
          const spent = periodTxs.filter(tx => tx.type === 'debit' && tx.category === b.category).reduce((s, tx) => s + tx.amount, 0);
          const percent = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
          return { ...b, spent, percent };
        });

        const activeBudgetsCount = budgets.length;
        const metBudgetsCount = budgetData.filter(b => b.spent <= b.monthlyLimit).length;

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Budgets</span>
                <span className="popup-stat-value">{activeBudgetsCount}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Budgets Met</span>
                <span className="popup-stat-value text-success">{metBudgetsCount}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Compliance Rate</span>
                <span className="popup-stat-value text-primary">
                  {activeBudgetsCount > 0 ? Math.round((metBudgetsCount / activeBudgetsCount) * 100) : 100}%
                </span>
              </div>
            </div>

            <div className="modal-section-title">Category Budgets Overview</div>
            <div className="popup-table-wrap" style={{ maxHeight: '280px' }}>
              <table className="popup-table">
                <thead>
                  <tr><th>Category</th><th>Spend Progress</th><th>Limit</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {budgetData.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center' }}>No budgets set. Navigate to Budgets to configure limits.</td></tr>
                  ) : (
                    budgetData.map((b, idx) => {
                      const isOver = b.spent > b.monthlyLimit;
                      return (
                        <tr key={idx}>
                          <td><strong>{b.category}</strong></td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                {formatAmount(b.spent, currency)} spent
                              </span>
                              <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(100, b.percent)}%`,
                                  background: isOver ? 'var(--danger)' : 'var(--success)',
                                  height: '100%'
                                }} />
                              </div>
                            </div>
                          </td>
                          <td>{formatAmount(b.monthlyLimit, currency)}</td>
                          <td>
                            {isOver ? (
                              <span className="cat-tag" style={{ background: 'var(--danger-glow)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>Over Budget</span>
                            ) : (
                              <span className="cat-tag" style={{ background: 'var(--success-glow)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)' }}>On Track</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        );
      }

      case 'debt': {
        const totalEmiSum = debts.reduce((s, d) => s + d.emiAmount, 0);

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Monthly EMIs</span>
                <span className="popup-stat-value text-danger">{formatAmount(totalEmiSum, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Monthly Income</span>
                <span className="popup-stat-value text-success">{formatAmount(periodIncome, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Debt-to-Income (DTI)</span>
                <span className="popup-stat-value text-primary">
                  {periodIncome > 0 ? Math.round((totalEmiSum / periodIncome) * 100) : 0}%
                </span>
              </div>
            </div>

            <div className="modal-section-title">Equation Formula</div>
            <div className="formula-card">
              <span className="formula-text">
                (Total Monthly EMIs / Total Income) × 100 = Debt-to-Income Ratio
              </span>
              <span className="formula-values">
                ({formatAmount(totalEmiSum, currency)} / {formatAmount(periodIncome, currency)}) × 100 = {periodIncome > 0 ? Math.round((totalEmiSum / periodIncome) * 100) : 0}%
              </span>
            </div>

            <div className="modal-section-title">EMI & Debt Breakdown</div>
            <div className="popup-table-wrap" style={{ maxHeight: '240px' }}>
              <table className="popup-table">
                <thead>
                  <tr><th>EMI Name</th><th>Loan Type</th><th>Interest Rate</th><th>EMI Amount</th></tr>
                </thead>
                <tbody>
                  {debts.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center' }}>No active debts or EMIs found.</td></tr>
                  ) : (
                    debts.map((d, idx) => (
                      <tr key={idx}>
                        <td><strong>{d.name}</strong></td>
                        <td><span className="cat-tag">{d.type.replace('_', ' ')}</span></td>
                        <td>{d.interestRate}%</td>
                        <td className="amt-cell text-danger">{formatAmount(d.emiAmount, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        );
      }
      case 'tax': {
        const periodTaxDeducted = periodSlips.reduce((sum, slip) => sum + (slip.taxDeducted || 0), 0);
        let mappedTaxes = 0;
        periodSlips.forEach(slip => {
          slip.deductionsBreakdown?.forEach(d => {
            const match = mappings.find(m => {
              if (m.componentType !== 'deduction') return false;
              const mapName = m.componentName.trim().toLowerCase();
              const slipName = d.name.trim().toLowerCase();
              return slipName.includes(mapName) || mapName.includes(slipName);
            });
            if (match && match.targetCategory === 'tax') {
              mappedTaxes += d.amount;
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
              mappedTaxes += e.amount;
            }
          });
        });

        const periodLedgerTaxes = periodTxs
          .filter(tx => tx.type === 'debit' && tx.category.toLowerCase() === 'tax')
          .reduce((sum, tx) => sum + tx.amount, 0);

        const totalTaxPaid = periodTaxDeducted + mappedTaxes + periodLedgerTaxes;
        const taxRate = periodIncome > 0 ? (totalTaxPaid / periodIncome) * 100 : 0;

        // Group ledger taxes by description
        const taxLedgerBreakdown: Record<string, number> = {};
        const taxLedgerTxs = periodTxs.filter(tx => tx.type === 'debit' && tx.category.toLowerCase() === 'tax');
        taxLedgerTxs.forEach(tx => {
          taxLedgerBreakdown[tx.description] = (taxLedgerBreakdown[tx.description] || 0) + tx.amount;
        });
        const groupedTaxLedger = Object.entries(taxLedgerBreakdown).sort((a, b) => b[1] - a[1]);

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Total Tax Paid</span>
                <span className="popup-stat-value text-danger">{formatAmount(totalTaxPaid, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Total Income</span>
                <span className="popup-stat-value text-success">{formatAmount(periodIncome, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Tax Rate</span>
                <span className="popup-stat-value">{Math.round(taxRate)}%</span>
              </div>
            </div>

            <div className="modal-section-title">Equation Formula</div>
            <div className="formula-card">
              <span className="formula-text">
                (Salary TDS + Mapped Deductions + Ledger Taxes) / Total Income × 100 = Tax Rate
              </span>
              <span className="formula-values">
                ({formatAmount(periodTaxDeducted, currency)} + {formatAmount(mappedTaxes, currency)} + {formatAmount(periodLedgerTaxes, currency)}) / {formatAmount(periodIncome, currency)} × 100 = {taxRate.toFixed(1)}%
              </span>
            </div>

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">Tax Breakdown</div>
                <div className="breakdown-list">
                  <div className="breakdown-item">
                    <span className="breakdown-name">Salary Slip TDS (Income Tax)</span>
                    <span className="breakdown-value">{formatAmount(periodTaxDeducted, currency)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-name">Mapped Deductions (e.g. Professional Tax)</span>
                    <span className="breakdown-value">{formatAmount(mappedTaxes, currency)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-name">Ledger Payments (Advance Tax, GST, etc.)</span>
                    <span className="breakdown-value">{formatAmount(periodLedgerTaxes, currency)}</span>
                  </div>
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">Ledger Tax Payments</div>
                <div className="breakdown-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {groupedTaxLedger.length === 0 ? (
                    <p className="no-data-text">No ledger tax transactions in this period.</p>
                  ) : (
                    groupedTaxLedger.map(([desc, amt]) => (
                      <div key={desc} className="breakdown-item">
                        <span className="breakdown-name" style={{ fontSize: '0.82rem' }}>{desc}</span>
                        <span className="breakdown-value">{formatAmount(amt, currency)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        );
      }
      case 'net_worth': {
        const netWorth = cashBalance + portfolioValue + allTimeSalaryInvestments;
        
        // Find all-time ledger investments (debits of category Investment that are not transfers)
        const ledgerInvestments = transactions.filter(tx => 
          tx.type === 'debit' && 
          tx.category === 'Investment' && 
          !transferTxIds.has(tx.id!)
        );
        const totalLedgerInvestments = ledgerInvestments.reduce((s, tx) => s + tx.amount, 0);

        // Find individual mapped deductions/EPF items from all salary slips
        const salaryInvestmentItems: { name: string; amount: number; dateLabel: string }[] = [];
        salarySlips.forEach(slip => {
          const dateLabel = `${MN[slip.month - 1]} ${slip.year}`;
          if (slip.providentFund) {
            salaryInvestmentItems.push({
              name: 'Employee Provident Fund (EPF)',
              amount: slip.providentFund,
              dateLabel
            });
          }
          slip.deductionsBreakdown?.forEach(d => {
            const match = mappings.find(m => {
              if (m.componentType !== 'deduction') return false;
              const mapName = m.componentName.trim().toLowerCase();
              const slipName = d.name.trim().toLowerCase();
              return slipName.includes(mapName) || mapName.includes(slipName);
            });
            if (match && match.targetCategory === 'investment') {
              salaryInvestmentItems.push({
                name: d.name,
                amount: d.amount,
                dateLabel
              });
            }
          });
        });

        return (
          <>
            <div className="popup-stats-row">
              <div className="popup-stat">
                <span className="popup-stat-label">Liquid Cash</span>
                <span className="popup-stat-value text-primary">{formatAmount(cashBalance, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Portfolio Value</span>
                <span className="popup-stat-value text-info">{formatAmount(portfolioValue, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Ledger Investments</span>
                <span className="popup-stat-value" style={{ color: '#ec4899' }}>{formatAmount(totalLedgerInvestments, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Salary Assets</span>
                <span className="popup-stat-value text-warning">{formatAmount(allTimeSalaryInvestments, currency)}</span>
              </div>
              <div className="popup-stat">
                <span className="popup-stat-label">Net Worth</span>
                <span className="popup-stat-value text-success">{formatAmount(netWorth, currency)}</span>
              </div>
            </div>

            <div className="modal-section-title">Net Worth Equation</div>
            <div className="formula-card">
              <span className="formula-text">
                Liquid Cash + Portfolio Value + Salary Slip Assets = Total Net Worth
              </span>
              <span className="formula-values">
                {formatAmount(cashBalance, currency)} + {formatAmount(portfolioValue, currency)} + {formatAmount(allTimeSalaryInvestments, currency)} = {formatAmount(netWorth, currency)}
              </span>
            </div>

            <div className="modal-split-grid">
              <div className="split-col">
                <div className="modal-section-title">Salary Assets (EPF & ESPP)</div>
                <p className="no-data-text" style={{ marginBottom: '8px', fontSize: '0.74rem', padding: 0, textAlign: 'left', color: 'var(--text-muted)' }}>
                  💡 These contributions are deducted directly from your salary slips and represent non-cash savings.
                </p>
                <div className="popup-table-wrap" style={{ maxHeight: '180px' }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Period</th><th>Asset Component</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {salaryInvestmentItems.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center' }}>No salary investments recorded.</td></tr>
                      ) : (
                        salaryInvestmentItems.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.dateLabel}</td>
                            <td>{item.name}</td>
                            <td className="amt-cell text-success">+{formatAmount(item.amount, currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="split-col">
                <div className="modal-section-title">Unreconciled Ledger Investments</div>
                <p className="no-data-text" style={{ marginBottom: '8px', fontSize: '0.74rem', padding: 0, textAlign: 'left', color: 'var(--text-muted)' }}>
                  💡 These are investment outflows from your bank statement not yet linked to manual/Zerodha stock holdings.
                </p>
                <div className="popup-table-wrap" style={{ maxHeight: '180px' }}>
                  <table className="popup-table">
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {ledgerInvestments.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center' }}>No bank investment transactions found.</td></tr>
                      ) : (
                        ledgerInvestments.map((tx, idx) => (
                          <tr key={idx}>
                            <td>{tx.date}</td>
                            <td className="truncate" title={tx.description}>{tx.description}</td>
                            <td className="amt-cell text-danger">−{formatAmount(tx.amount, currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {ledgerInvestments.length > 0 && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Total bank investment outflows: <strong>{formatAmount(totalLedgerInvestments, currency)}</strong>
                  </p>
                )}
              </div>
            </div>
          </>
        );
      }
      default:
        return null;
    }
  };

  const titles = {
    expense: 'Expense Rate Detail Analysis',
    savings: 'Savings Rate Detail Analysis',
    investment: 'Investment Rate Detail Analysis',
    budget: 'Budget Compliance Detail Analysis',
    debt: 'Debt-to-Income Detail Analysis',
    tax: 'Tax Rate Detail Analysis',
    income: 'Income Detail Analysis',
    net_worth: 'All Time Net Worth Detail Analysis'
  };

  const subtitles = {
    expense: 'Itemized details of outflows and expenditures against total income',
    savings: 'Inflows and net savings profile for the selected period',
    investment: 'Summary of ledger investments and EPF deductions',
    budget: 'Breakdown of set limits vs actual category expenditures',
    debt: 'EMIs and monthly financial obligations compared to inflows',
    tax: 'Aggregate details of salary TDS and general tax transactions against income',
    income: 'Breakdown of unique bank credits and salary slip take-home pay',
    net_worth: 'Comprehensive breakdown of liquid cash, portfolio holdings, and salary-deducted assets'
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <div>
            <h3 className="popup-title">{titles[type]}</h3>
            <p className="popup-subtitle">{subtitles[type]}</p>
          </div>
          <button className="popup-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// ── Main Dashboard ──────────────────────────────────────────────────────────
export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [currency, setCurrency] = useState('INR');
  const [recurringPopup, setRecurringPopup] = useState<string | null>(null);
  const [activeMeterDetail, setActiveMeterDetail] = useState<'expense' | 'savings' | 'investment' | 'budget' | 'debt' | 'tax' | 'income' | 'net_worth' | null>(null);
  const [mappings, setMappings] = useState<SalarySlipMapping[]>([]);

  // ── Period Selector State ─────────────────────────────────────────────────
  const [selYear,  setSelYear]  = useState<string>('all');   // 'all' | '2025' | '2026'
  const [selMonth, setSelMonth] = useState<string>('all');   // 'all' | '01'..'12'
  const [selWeek,  setSelWeek]  = useState<string>('all');   // 'all' | 'Wk1 (1–7)' label
  const hasAutoSelected = React.useRef(false);

  useEffect(() => {
    autoRepairTransactionDates().then(repairedCount => {
      if (repairedCount > 0) {
        console.warn(`Auto-repaired ${repairedCount} transaction dates on dashboard mount.`);
      }
    }).catch(err => console.error("Auto date repair failed:", err));
    getSetting('currency', 'INR').then(setCurrency);
    getSetting<SalarySlipMapping[]>('salarySlipMappings', []).then(setMappings);
  }, []);

  const raw = useLiveQuery(async () => {
    const transactions    = await db.transactions.toArray();
    const investments     = await db.investments.toArray();
    const salarySlips     = await db.salarySlips.toArray();
    const budgets         = await db.budgets.toArray();
    const debts           = await db.debts.toArray();
    const netWorthHistory = await db.netWorthSnapshots.orderBy('date').toArray();
    const decisions       = await db.reconDecisions.toArray();
    return { transactions, investments, salarySlips, budgets, debts, netWorthHistory, decisions };
  }, []) || { transactions: [], investments: [], salarySlips: [], budgets: [], debts: [], netWorthHistory: [], decisions: [] };

  const { transactions, investments, salarySlips, budgets, debts, netWorthHistory, decisions } = raw;

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

  const netWorth       = cashBalance + portfolioValue + allTimeSalaryInvestments;

  // ── Period metrics ────────────────────────────────────────────────────────
  const periodIncome   = periodTxs.filter(tx => tx.type === 'credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s,tx) => s+tx.amount, 0);
  const periodExpenses = periodTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!)).reduce((s,tx) => s+tx.amount, 0);
  const periodSavings  = periodIncome - periodExpenses;

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

  const periodInvestmentDebits = periodTxs.filter(tx => tx.type==='debit' && tx.category==='Investment').reduce((s,tx)=>s+tx.amount,0);
  const rawInvestmentRate = periodIncome > 0 ? ((periodInvestmentDebits + pfForPeriod + mappedInvestments) / periodIncome) * 100 : 0;
  const investmentRate = isNaN(rawInvestmentRate) ? 0 : Math.min(100, Math.max(0, rawInvestmentRate));

  const budgetCompliancePct = budgets.length > 0
    ? Math.round((budgets.filter(b => {
        const spent = periodTxs.filter(tx => tx.type==='debit' && tx.category===b.category).reduce((s,tx)=>s+tx.amount,0);
        return spent <= b.monthlyLimit;
      }).length / budgets.length) * 100)
    : 100;

  const totalMonthlyEmi = debts.reduce((s,d) => s+d.emiAmount, 0);
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
    const totals: Record<string, number> = {};
    periodTxs.filter(tx => tx.type === 'debit' && !transferTxIds.has(tx.id!)).forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a,b) => b.value-a.value);
  }, [periodTxs, transferTxIds]);

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
        if (tx.type==='credit') {
          if (!reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)) {
            days[tx.date].income += tx.amount;
          }
        }
        else {
          if (!transferTxIds.has(tx.id!)) {
            days[tx.date].expenses += tx.amount;
            if(tx.category==='Investment') days[tx.date].investments += tx.amount;
          }
        }
      });
      return Object.values(days).map(d => ({ ...d, savings: d.income - d.expenses }));
    }

    // Month view: by week bucket
    if (selYear !== 'all' && selMonth !== 'all') {
      return weekBuckets.map(b => {
        const bTxs = transactions.filter(tx => tx.date >= b.start && tx.date <= b.end);
        const inc = bTxs.filter(tx=>tx.type==='credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        const exp = bTxs.filter(tx=>tx.type==='debit' && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        const inv = bTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment'&&!transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        return { label: b.label, income:inc, expenses:exp, savings:inc-exp, investments:inv };
      });
    }

    // Year view: all 12 months
    if (selYear !== 'all') {
      return Array.from({length:12},(_,i)=>i+1).map(m => {
        const key = `${selYear}-${pad(m)}`;
        const mTxs = transactions.filter(tx => tx.date.startsWith(key));
        const inc = mTxs.filter(tx=>tx.type==='credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        const exp = mTxs.filter(tx=>tx.type==='debit' && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        const inv = mTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment'&&!transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
        return { label:MN[m-1], income:inc, expenses:exp, savings:inc-exp, investments:inv };
      });
    }

    // All time: by month (all months we have data for)
    const allKeys = [...new Set(transactions.map(tx=>tx.date.slice(0,7)))].sort();
    return allKeys.map(key => {
      const mTxs = transactions.filter(tx=>tx.date.startsWith(key));
      const inc = mTxs.filter(tx=>tx.type==='credit' && !reconciledTxIds.has(tx.id!) && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
      const exp = mTxs.filter(tx=>tx.type==='debit' && !transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
      const inv = mTxs.filter(tx=>tx.type==='debit'&&tx.category==='Investment'&&!transferTxIds.has(tx.id!)).reduce((s,tx)=>s+tx.amount,0);
      return { label:`${MN[parseInt(key.slice(5,7))-1]} ${key.slice(2,4)}`, income:inc, expenses:exp, savings:inc-exp, investments:inv };
    });
  }, [transactions, periodTxs, selYear, selMonth, selWeek, weekBuckets, reconciledTxIds, transferTxIds]);

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
          <MeterGauge label="Expense Rate" subtitle="of income spent" value={expenseRate} displayValue={`${Math.round(expenseRate)}%`} thresholds={{ ok: 60, warn: 80 }} lowIsGood helpText={expenseRate > 80 ? 'High! Reduce discretionary spending.' : expenseRate > 60 ? 'Moderate. Watch spending.' : 'Healthy spending level.'} onClick={() => setActiveMeterDetail('expense')} />
          <MeterGauge label="Savings Rate" subtitle="of income saved" value={savingsRateClamped} displayValue={`${Math.round(savingsRateClamped)}%`} thresholds={{ ok: 20, warn: 10 }} lowIsGood={false} helpText={savingsRateClamped >= 20 ? 'Excellent! Keep it up.' : savingsRateClamped >= 10 ? 'Good. Push past 20%.' : 'Low. Try to save 10%+'} onClick={() => setActiveMeterDetail('savings')} />
          <MeterGauge label="Investment Rate" subtitle="of income invested" value={investmentRate} displayValue={`${Math.round(investmentRate)}%`} thresholds={{ ok: 15, warn: 5 }} lowIsGood={false} helpText={investmentRate >= 15 ? 'Strong! Wealth is growing.' : investmentRate >= 5 ? 'Decent. Push to 15%.' : 'Low. Start a SIP.'} onClick={() => setActiveMeterDetail('investment')} />
          <MeterGauge label="Tax Rate" subtitle="of gross income" value={taxRate} displayValue={`${Math.round(taxRate)}%`} thresholds={{ ok: 20, warn: 30 }} lowIsGood helpText={taxRate > 30 ? 'High tax burden. Look for exemptions.' : taxRate > 20 ? 'Moderate tax bracket.' : 'Low tax rate.'} onClick={() => setActiveMeterDetail('tax')} />
          <MeterGauge label="Budget Compliance" subtitle="categories in limit" value={budgetCompliancePct} displayValue={`${budgetCompliancePct}%`} thresholds={{ ok: 80, warn: 50 }} lowIsGood={false} helpText={budgets.length === 0 ? 'Set budgets to track.' : budgetCompliancePct === 100 ? 'Perfect! All budgets on track.' : budgetCompliancePct >= 80 ? 'A few categories over.' : 'Several budgets exceeded.'} onClick={() => setActiveMeterDetail('budget')} />
          <MeterGauge label="Debt-to-Income" subtitle="of income on EMIs" value={dtiRate} displayValue={`${Math.round(dtiRate)}%`} thresholds={{ ok: 30, warn: 50 }} lowIsGood helpText={debts.length === 0 ? 'No active debts. Great!' : dtiRate <= 30 ? 'Healthy DTI.' : dtiRate <= 50 ? 'Moderate. Avoid new loans.' : 'High DTI. Prioritise payoff.'} onClick={() => setActiveMeterDetail('debt')} />
        </div>
      </div>

      {/* ── Period Summary Cards ─────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="glass-card stat-card" onClick={() => setActiveMeterDetail('income')}>
          <div className="stat-card-header">
            <span className="stat-label">Income · {periodLabel}</span>
            <div className="stat-icon-wrapper success-bg"><ArrowDownLeft size={16} className="success-color" /></div>
          </div>
          <span className="stat-value">{formatAmount(periodIncome, currency)}</span>
        </div>
        <div className="glass-card stat-card" onClick={() => setActiveMeterDetail('expense')}>
          <div className="stat-card-header">
            <span className="stat-label">Expenses · {periodLabel}</span>
            <div className="stat-icon-wrapper danger-bg"><ArrowUpRight size={16} className="danger-color" /></div>
          </div>
          <span className="stat-value">{formatAmount(periodExpenses, currency)}</span>
        </div>
        <div className="glass-card stat-card" onClick={() => setActiveMeterDetail('savings')}>
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
                  if(monthsData[k]){
                    if(tx.type==='credit') {
                      if (!reconciledTxIds.has(tx.id!)) {
                        monthsData[k].income+=tx.amount;
                      }
                    } else {
                      monthsData[k].expenses+=tx.amount;
                    }
                  }
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

        .meters-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
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
          cursor: pointer; transition: var(--transition-smooth);
        }
        .net-worth-banner:hover { transform: translateY(-2px); border-color: rgba(139,92,246,0.3); box-shadow: 0 8px 16px rgba(0,0,0,0.25); }
        .banner-details { display: flex; flex-direction: column; gap: 6px; }
        .details-header { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; }
        .banner-alltime-tag {
          font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
          padding: 2px 8px; border-radius: 99px;
          background: rgba(139,92,246,0.12); color: var(--primary);
          border: 1px solid rgba(139,92,246,0.25);
        }
        .banner-icon-piggy { color: var(--primary); }
        .banner-details h2 {
          font-family: var(--font-heading); font-size: 2.5rem; font-weight: 800;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--secondary) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          white-space: nowrap;
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

        .stat-card { padding: 20px; display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: var(--transition-smooth); }
        .stat-card:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 16px rgba(0,0,0,0.25); }
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
          flex: 1; padding: 14px 12px;
          border-right: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column; gap: 4px;
          min-width: 0;
        }
        .popup-stat:last-child { border-right: none; }
        .popup-stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .popup-stat-value { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); white-space: nowrap; }

        .popup-chart { padding: 16px 12px 0; }

        .popup-table-wrap {
          flex: 1; overflow-y: auto; padding: 0 24px 24px;
          margin-top: 12px;
        }
        .split-col .popup-table-wrap {
          padding: 0;
          margin-top: 4px;
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

        /* ── Meter Detail Modal Styles ── */
        .modal-section-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 4px;
          margin-bottom: 2px;
        }

        .formula-card {
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .formula-text {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .formula-values {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-family: monospace;
        }

        .modal-split-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        @media (max-width: 640px) {
          .modal-split-grid {
            grid-template-columns: 1fr;
          }
        }

        .split-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }

        .breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .breakdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
        }

        .breakdown-name {
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .breakdown-value {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .no-data-text {
          font-size: 0.85rem;
          color: var(--text-muted);
          text-align: center;
          padding: 16px;
        }
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
  onClick?: () => void;
}

const MeterGauge: React.FC<MeterGaugeProps> = ({ label, subtitle, value, displayValue, thresholds, lowIsGood, helpText, onClick }) => {
  const safeValue = isNaN(value) ? 0 : value;
  const getColour = () => {
    if (lowIsGood) {
      if (safeValue <= thresholds.ok)   return '#22c55e';
      if (safeValue <= thresholds.warn) return '#f97316';
      return '#ef4444';
    } else {
      if (safeValue >= thresholds.ok)   return '#22c55e';
      if (safeValue >= thresholds.warn) return '#f97316';
      return '#ef4444';
    }
  };
  const colour  = getColour();
  const r       = 46;
  const arcLen  = Math.PI * r;
  const filled  = (safeValue / 100) * arcLen;
  const gap     = arcLen - filled;

  return (
    <div
      className="glass-card meter-card"
      style={{
        borderColor: colour + '33',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition-smooth)'
      }}
      onClick={onClick}
    >
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
