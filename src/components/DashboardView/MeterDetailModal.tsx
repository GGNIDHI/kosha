import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { formatAmount } from '../../utils/currency';
import type { Transaction, SalarySlip, Debt, Budget, SalarySlipMapping, Category } from '../../db/database';

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
  categories?: Category[];
}

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MeterDetailModal: React.FC<MeterDetailModalProps> = ({
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
  categories = [],
}) => {
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
        const allCredits = periodTxs.filter(tx => tx.type === 'credit' && !tx.id?.startsWith('sal-') && !neutralCategories.has(tx.category));
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
        const debitTxs = periodTxs.filter(tx => tx.type === 'debit' && !neutralCategories.has(tx.category));
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
        const allCredits = periodTxs.filter(tx => tx.type === 'credit' && !tx.id?.startsWith('sal-') && !neutralCategories.has(tx.category));
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
        const investTxs = periodTxs.filter(tx => tx.type === 'debit' && investmentCategories.has(tx.category));
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
          investmentCategories.has(tx.category) &&
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
    net_worth: 'All Time Net Worth Detail Analysis',
  };

  const subtitles = {
    expense: 'Itemized details of outflows and expenditures against total income',
    savings: 'Inflows and net savings profile for the selected period',
    investment: 'Summary of ledger investments and EPF deductions',
    budget: 'Breakdown of set limits vs actual category expenditures',
    debt: 'EMIs and monthly financial obligations compared to inflows',
    tax: 'Aggregate details of salary TDS and general tax transactions against income',
    income: 'Breakdown of unique bank credits and salary slip take-home pay',
    net_worth: 'Comprehensive breakdown of liquid cash, portfolio holdings, and salary-deducted assets',
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
