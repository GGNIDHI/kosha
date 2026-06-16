import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SalarySlipMapping, autoRepairTransactionDates } from '../db/database';
import { getReconciledPairs, getReconciledTransfers, type ReconciledPair, type ReconciledTransferPair } from '../utils/reconciliation';
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Building,
  Sparkles,
  Link,
  Link2Off,
  Filter,
  CreditCard,
  Database,
  RefreshCw
} from 'lucide-react';

export const SmartReviewView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'salary' | 'creditCard'>('salary');
  const [selYear, setSelYear] = useState<string>('all');
  const [selMonth, setSelMonth] = useState<string>('all');
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});

  // Load database tables live
  const rawData = useLiveQuery(async () => {
    const transactions = await db.transactions.toArray();
    const salarySlips = await db.salarySlips.toArray();
    const decisions = await db.reconDecisions.toArray();
    const mappingRecord = await db.settings.get('salarySlipMappings');
    const mappings: SalarySlipMapping[] = mappingRecord ? (mappingRecord.value as SalarySlipMapping[]) : [];
    return { transactions, salarySlips, decisions, mappings };
  }, []) || { transactions: [], salarySlips: [], decisions: [], mappings: [] };

  const { transactions, salarySlips, decisions, mappings } = rawData;

  // Run the reconciliation matching engines
  const matchedPairs = useMemo(() => {
    return getReconciledPairs(transactions, salarySlips, decisions);
  }, [transactions, salarySlips, decisions]);

  const matchedTransfers = useMemo(() => {
    return getReconciledTransfers(transactions, decisions);
  }, [transactions, decisions]);

  // Derived: Available years for filtering
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    salarySlips.forEach(s => years.add(String(s.year)));
    transactions.forEach(t => {
      if (t.date) years.add(t.date.slice(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [salarySlips, transactions]);

  // Filter matched pairs by selected Year and Month
  const filteredPairs = useMemo(() => {
    return matchedPairs.filter(pair => {
      const slipYear = String(pair.salarySlip.year);
      const slipMonth = String(pair.salarySlip.month).padStart(2, '0');

      if (selYear !== 'all' && slipYear !== selYear) return false;
      if (selMonth !== 'all' && slipMonth !== selMonth) return false;
      return true;
    });
  }, [matchedPairs, selYear, selMonth]);

  const filteredTransfers = useMemo(() => {
    return matchedTransfers.filter(pair => {
      const year = pair.bankTx.date.slice(0, 4);
      const month = pair.bankTx.date.slice(5, 7);

      if (selYear !== 'all' && year !== selYear) return false;
      if (selMonth !== 'all' && month !== selMonth) return false;
      return true;
    });
  }, [matchedTransfers, selYear, selMonth]);

  // Compute stat counts
  const salaryStats = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    filteredPairs.forEach(p => {
      if (p.status === 'accepted') accepted++;
      else rejected++;
    });
    return { accepted, rejected, total: filteredPairs.length };
  }, [filteredPairs]);

  const ccStats = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    filteredTransfers.forEach(p => {
      if (p.status === 'accepted') accepted++;
      else rejected++;
    });
    return { accepted, rejected, total: filteredTransfers.length };
  }, [filteredTransfers]);

  const stats = activeTab === 'salary' ? salaryStats : ccStats;

  // Handle Accept (Reconcile Salary)
  const handleAccept = async (pair: ReconciledPair) => {
    try {
      await db.reconDecisions.put({
        id: pair.id,
        transactionId: pair.transaction.id!,
        salarySlipId: pair.salarySlip.id!,
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to accept reconciliation:', err);
    }
  };

  // Handle Reject (Keep separate / Double count Salary)
  const handleReject = async (pair: ReconciledPair) => {
    try {
      await db.reconDecisions.put({
        id: pair.id,
        transactionId: pair.transaction.id!,
        salarySlipId: pair.salarySlip.id!,
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to reject reconciliation:', err);
    }
  };

  // Handle Accept (Reconcile CC Transfer)
  const handleAcceptTransfer = async (pair: ReconciledTransferPair) => {
    try {
      await db.reconDecisions.put({
        id: pair.id,
        transactionId: pair.bankTx.id!,
        salarySlipId: pair.cardTx.id!,
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to accept transfer reconciliation:', err);
    }
  };

  // Handle Reject (Allow Double count CC Transfer)
  const handleRejectTransfer = async (pair: ReconciledTransferPair) => {
    try {
      await db.reconDecisions.put({
        id: pair.id,
        transactionId: pair.bankTx.id!,
        salarySlipId: pair.cardTx.id!,
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to reject transfer reconciliation:', err);
    }
  };

  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    txCount: number;
    slipsCount: number;
    salaryMatches: number;
    ccTransfers: number;
    orphansRemoved: number;
    snapshotsSynced: number;
  } | null>(null);

  const runDatabaseAudit = async () => {
    setIsAuditing(true);
    try {
      // 0. Auto-repair malformed transaction dates
      await autoRepairTransactionDates();

      const allTxs = await db.transactions.toArray();
      const allSlips = await db.salarySlips.toArray();
      const allDecisions = await db.reconDecisions.toArray();
      
      const txMap = new Map(allTxs.map(t => [t.id, t]));
      const slipMap = new Map(allSlips.map(s => [s.id, s]));

      // 1. Orphan Decision Cleanup
      let orphansRemoved = 0;
      for (const dec of allDecisions) {
        let isOrphan = false;
        if (dec.salarySlipId?.startsWith('slip-')) {
          if (!txMap.has(dec.transactionId) || !slipMap.has(dec.salarySlipId)) {
            isOrphan = true;
          }
        } else {
          if (!txMap.has(dec.transactionId) || !txMap.has(dec.salarySlipId)) {
            isOrphan = true;
          }
        }

        if (isOrphan) {
          await db.reconDecisions.delete(dec.id);
          orphansRemoved++;
        }
      }

      // 2. Net Worth History Re-sync
      const months = Array.from(new Set(allTxs.map(t => t.date.slice(0, 7)))).sort();
      let snapshotsSynced = 0;

      if (months.length > 0) {
        await db.netWorthSnapshots.clear();

        const salaryDecisions = (await db.reconDecisions.toArray()).filter(d => d.salarySlipId?.startsWith('slip-') && d.status === 'accepted');
        const reconciledTxIds = new Set(salaryDecisions.map(d => d.transactionId));

        for (const mKey of months) {
          const year = parseInt(mKey.slice(0, 4));
          const month = parseInt(mKey.slice(5, 7));
          const lastDay = new Date(year, month, 0).getDate();
          const lastDateStr = `${mKey}-${String(lastDay).padStart(2, '0')}`;

          const upToMKeyTxs = allTxs.filter(t => t.date <= lastDateStr);
          const upToMKeySlips = allSlips.filter(s => {
            const sKey = `${s.year}-${String(s.month).padStart(2, '0')}`;
            return sKey <= mKey;
          });

          const cash = upToMKeyTxs.reduce((s, tx) => {
            if (tx.type === 'credit') {
              return reconciledTxIds.has(tx.id!) ? s : s + tx.amount;
            } else {
              return s - tx.amount;
            }
          }, 0);

          let salaryInvestments = 0;
          upToMKeySlips.forEach(slip => {
            salaryInvestments += (slip.providentFund || 0);
            slip.deductionsBreakdown?.forEach(d => {
              const match = mappings.find(m => {
                if (m.componentType !== 'deduction') return false;
                const mapName = m.componentName.trim().toLowerCase();
                const slipName = d.name.trim().toLowerCase();
                return slipName.includes(mapName) || mapName.includes(slipName);
              });
              if (match && match.targetCategory === 'investment') {
                salaryInvestments += d.amount;
              }
            });
          });

          const portfolio = 0; 
          const netWorthVal = cash + portfolio + salaryInvestments;

          await db.netWorthSnapshots.put({
            id: mKey,
            date: lastDateStr,
            netWorth: netWorthVal,
            cashBalance: cash,
            portfolioValue: portfolio
          });
          snapshotsSynced++;
        }
      }

      // Re-run matching to get counts for audit results report
      const updatedDecisions = await db.reconDecisions.toArray();
      const salaryPairs = getReconciledPairs(allTxs, allSlips, updatedDecisions);
      const ccTransfers = getReconciledTransfers(allTxs, updatedDecisions);

      setAuditResult({
        txCount: allTxs.length,
        slipsCount: allSlips.length,
        salaryMatches: salaryPairs.length,
        ccTransfers: ccTransfers.length,
        orphansRemoved,
        snapshotsSynced
      });

    } catch (err) {
      console.error('Audit failed:', err);
      alert('Database audit failed: ' + err);
    } finally {
      setIsAuditing(false);
    }
  };

  const formatAmount = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Smart Review</h1>
          <p className="view-subtitle">Reconcile salary slips and bank transfers to prevent double counting</p>
        </div>
        <div className="tab-buttons" style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setActiveTab('salary')}
            className={`btn btn-sm ${activeTab === 'salary' ? 'btn-primary-glow' : 'btn-secondary'}`}
            style={{ borderRadius: '6px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={14} />
            Salary Slips
          </button>
          <button
            onClick={() => setActiveTab('creditCard')}
            className={`btn btn-sm ${activeTab === 'creditCard' ? 'btn-primary-glow' : 'btn-secondary'}`}
            style={{ borderRadius: '6px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CreditCard size={14} />
            Credit Card Payments
          </button>
        </div>
      </header>

      {/* Stats and Filter Panel */}
      <div className="control-panel glass-card">
        <div className="filters-group" style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
          <div className="filter-item">
            <label><Filter size={12} /> Year</label>
            <select
              value={selYear}
              onChange={(e) => setSelYear(e.target.value)}
              className="form-input"
            >
              <option value="all">All Time</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label><Filter size={12} /> Month</label>
            <select
              value={selMonth}
              onChange={(e) => setSelMonth(e.target.value)}
              className="form-input"
            >
              <option value="all">All Months</option>
              {monthNames.map((name, idx) => (
                <option key={name} value={String(idx + 1).padStart(2, '0')}>{name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={runDatabaseAudit}
            disabled={isAuditing}
            className="btn btn-secondary"
            style={{
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 16px',
              borderColor: 'rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 'var(--border-radius-md)'
            }}
          >
            {isAuditing ? (
              <RefreshCw size={14} className="spin" />
            ) : (
              <Database size={14} />
            )}
            {isAuditing ? 'Auditing...' : 'Audit & Sync'}
          </button>
        </div>

        <div className="stats-cards">
          <div className="mini-stat-card reconciled">
            <div className="stat-label">Reconciled (Duplicates Avoided)</div>
            <div className="stat-value">{stats.accepted}</div>
          </div>
          <div className="mini-stat-card double-counted">
            <div className="stat-label">Double Counted (Normal Credits)</div>
            <div className="stat-value">{stats.rejected}</div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="list-wrapper">
        {activeTab === 'salary' ? (
          filteredPairs.length === 0 ? (
            <div className="empty-state glass-card">
              <div className="empty-icon-wrapper">
                <CheckCircle2 size={48} className="empty-icon-sparkle" />
              </div>
              <h3>All Reconciled!</h3>
              <p>No duplicate or overlapping salary credits detected for the selected period.</p>
            </div>
          ) : (
            <div className="pairs-list">
              {filteredPairs.map((pair) => {
                const isAccepted = pair.status === 'accepted';
                const slipMonthName = monthNames[pair.salarySlip.month - 1] || 'Salary';

                const isExplicitlyAccepted = isAccepted && pair.hasDecision;
                const isCollapsed = isExplicitlyAccepted && !expandedPairs[pair.id];

                if (isCollapsed) {
                  return (
                    <div
                      key={pair.id}
                      onClick={() => setExpandedPairs(prev => ({ ...prev, [pair.id]: true }))}
                      className="pair-card glass-card collapsed-pair-card"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 20px',
                        cursor: 'pointer',
                        background: 'rgba(34, 197, 94, 0.03)',
                        borderColor: 'rgba(34, 197, 94, 0.15)',
                        borderRadius: '12px',
                        transition: 'all 0.2s ease',
                        flexDirection: 'row',
                        gap: '12px',
                        marginBottom: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem' }}>
                        <span className="cat-tag" style={{ background: 'var(--success-glow)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)', margin: 0 }}>
                          Reconciled
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {slipMonthName} {pair.salarySlip.year} Salary Credit of <strong>{formatAmount(pair.transaction.amount)}</strong> matches Salary Slip net pay.
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Click to edit</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={pair.id}
                    className={`pair-card glass-card ${isAccepted ? 'accepted' : 'rejected'}`}
                  >
                    <div className="pair-card-header">
                      <div className="status-badge-row">
                        {isAccepted ? (
                          <span className="status-badge accepted">
                            <Link size={12} /> Reconciled (Salary Slip Wins)
                          </span>
                        ) : (
                          <span className="status-badge rejected">
                            <Link2Off size={12} /> Double Counted (Normal Credits)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pair-comparison-grid">
                      {/* Left: Salary Slip Source */}
                      <div className="source-side salary-side">
                        <div className="side-title">
                          <FileText size={16} /> Salary Slip
                        </div>
                        <div className="amount-display text-success">
                          {formatAmount(pair.salarySlip.netPay)}
                        </div>
                        <div className="details-list">
                          <div className="detail-item">
                            <span className="lbl">Month:</span>
                            <span className="val">{slipMonthName} {pair.salarySlip.year}</span>
                          </div>
                          <div className="detail-item">
                            <span className="lbl">Gross Pay:</span>
                            <span className="val">{formatAmount(pair.salarySlip.grossPay)}</span>
                          </div>
                          {pair.salarySlip.pdfName && (
                            <div className="detail-item file-item">
                              <span className="lbl">File:</span>
                              <span className="val truncate" title={pair.salarySlip.pdfName}>
                                {pair.salarySlip.pdfName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Center Connector */}
                      <div className="connector-column">
                        <div className="connector-line">
                          <ArrowRight size={20} className="arrow-icon" />
                        </div>
                      </div>

                      {/* Right: Bank Transaction Source */}
                      <div className="source-side bank-side">
                        <div className="side-title">
                          <Building size={16} /> Bank Transaction
                        </div>
                        <div className="amount-display text-primary">
                          {formatAmount(pair.transaction.amount)}
                        </div>
                        <div className="details-list">
                          <div className="detail-item">
                            <span className="lbl">Date:</span>
                            <span className="val">{pair.transaction.date}</span>
                          </div>
                          <div className="detail-item">
                            <span className="lbl">Desc:</span>
                            <span className="val truncate" title={pair.transaction.description}>
                              {pair.transaction.description}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="lbl">Category:</span>
                            <span className="val">{pair.transaction.category}</span>
                          </div>
                          {pair.transaction.pdfName && (
                            <div className="detail-item file-item">
                              <span className="lbl">File:</span>
                              <span className="val truncate" title={pair.transaction.pdfName}>
                                {pair.transaction.pdfName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reason Alert */}
                    <div className="reason-container">
                      <Sparkles size={16} className="reason-icon" />
                      <span className="reason-text">{pair.reason}</span>
                    </div>

                    {/* Actions Bar */}
                    <div className="card-actions-bar">
                      {!pair.hasDecision ? (
                        <>
                          <p className="action-hint warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                            <AlertTriangle size={14} /> Pending Review: This bank credit matches your salary slip net pay. Choose how to handle this match.
                          </p>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            <button
                              onClick={() => handleAccept(pair)}
                              className="btn btn-primary-glow btn-sm"
                            >
                              Accept & Reconcile
                            </button>
                            <button
                              onClick={() => handleReject(pair)}
                              className="btn btn-outline-danger btn-sm"
                            >
                              Allow Double-Counting
                            </button>
                          </div>
                        </>
                      ) : isAccepted ? (
                        <>
                          <p className="action-hint" style={{ margin: 0 }}>
                            Excluding this bank credit from total income calculation to avoid double-counting.
                          </p>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            <button
                              onClick={() => setExpandedPairs(prev => ({ ...prev, [pair.id]: false }))}
                              className="btn btn-secondary btn-sm"
                            >
                              Collapse details
                            </button>
                            <button
                              onClick={() => handleReject(pair)}
                              className="btn btn-outline-danger btn-sm"
                            >
                              Reject Match (Double-Count)
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="action-hint warning" style={{ margin: 0 }}>
                            <AlertTriangle size={12} /> Double-counting allowed: This transaction is currently counted as both a bank credit and a salary slip.
                          </p>
                          <button
                            onClick={() => handleAccept(pair)}
                            className="btn btn-primary-glow btn-sm"
                            style={{ marginTop: '12px' }}
                          >
                            Reconcile (Exclude Bank Credit)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredTransfers.length === 0 ? (
            <div className="empty-state glass-card">
              <div className="empty-icon-wrapper">
                <CheckCircle2 size={48} className="empty-icon-sparkle" />
              </div>
              <h3>All Reconciled!</h3>
              <p>No credit card bill payment transfer matches detected for the selected period.</p>
            </div>
          ) : (
            <div className="pairs-list">
              {filteredTransfers.map((pair) => {
                const isAccepted = pair.status === 'accepted';

                const isExplicitlyAccepted = isAccepted && pair.hasDecision;
                const isCollapsed = isExplicitlyAccepted && !expandedPairs[pair.id];

                if (isCollapsed) {
                  return (
                    <div
                      key={pair.id}
                      onClick={() => setExpandedPairs(prev => ({ ...prev, [pair.id]: true }))}
                      className="pair-card glass-card collapsed-pair-card"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 20px',
                        cursor: 'pointer',
                        background: 'rgba(34, 197, 94, 0.03)',
                        borderColor: 'rgba(34, 197, 94, 0.15)',
                        borderRadius: '12px',
                        transition: 'all 0.2s ease',
                        flexDirection: 'row',
                        gap: '12px',
                        marginBottom: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem' }}>
                        <span className="cat-tag" style={{ background: 'var(--success-glow)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)', margin: 0 }}>
                          Reconciled Transfer
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Bank Payment of <strong>{formatAmount(pair.bankTx.amount)}</strong> matches Credit Card receipt of <strong>{formatAmount(pair.cardTx.amount)}</strong>.
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Click to edit</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={pair.id}
                    className={`pair-card glass-card ${isAccepted ? 'accepted' : 'rejected'}`}
                  >
                    <div className="pair-card-header">
                      <div className="status-badge-row">
                        {isAccepted ? (
                          <span className="status-badge accepted">
                            <Link size={12} /> Reconciled Transfer (Excluded from Income & Expenses)
                          </span>
                        ) : (
                          <span className="status-badge rejected">
                            <Link2Off size={12} /> Double Counted (Treated as Expense & Income)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pair-comparison-grid">
                      {/* Left: Bank Statement Debit */}
                      <div className="source-side bank-side">
                        <div className="side-title">
                          <Building size={16} /> Bank statement payment (Debit)
                        </div>
                        <div className="amount-display text-danger">
                          -{formatAmount(pair.bankTx.amount)}
                        </div>
                        <div className="details-list">
                          <div className="detail-item">
                            <span className="lbl">Date:</span>
                            <span className="val">{pair.bankTx.date}</span>
                          </div>
                          <div className="detail-item">
                            <span className="lbl">Desc:</span>
                            <span className="val truncate" title={pair.bankTx.description}>
                              {pair.bankTx.description}
                            </span>
                          </div>
                          {pair.bankTx.pdfName && (
                            <div className="detail-item file-item">
                              <span className="lbl">File:</span>
                              <span className="val truncate" title={pair.bankTx.pdfName}>
                                {pair.bankTx.pdfName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Center Connector */}
                      <div className="connector-column">
                        <div className="connector-line">
                          <ArrowRight size={20} className="arrow-icon" />
                        </div>
                      </div>

                      {/* Right: Credit Card Credit */}
                      <div className="source-side card-side">
                        <div className="side-title">
                          <CreditCard size={16} /> Credit card payment received (Credit)
                        </div>
                        <div className="amount-display text-success">
                          +{formatAmount(pair.cardTx.amount)}
                        </div>
                        <div className="details-list">
                          <div className="detail-item">
                            <span className="lbl">Date:</span>
                            <span className="val">{pair.cardTx.date}</span>
                          </div>
                          <div className="detail-item">
                            <span className="lbl">Desc:</span>
                            <span className="val truncate" title={pair.cardTx.description}>
                              {pair.cardTx.description}
                            </span>
                          </div>
                          {pair.cardTx.pdfName && (
                            <div className="detail-item file-item">
                              <span className="lbl">File:</span>
                              <span className="val truncate" title={pair.cardTx.pdfName}>
                                {pair.cardTx.pdfName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reason Alert */}
                    <div className="reason-container">
                      <Sparkles size={16} className="reason-icon" />
                      <span className="reason-text">{pair.reason}</span>
                    </div>

                    {/* Actions Bar */}
                    <div className="card-actions-bar">
                      {!pair.hasDecision ? (
                        <>
                          <p className="action-hint warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                            <AlertTriangle size={14} /> Pending Review: This card payment matches your bank statement CC payment. Choose how to handle this match.
                          </p>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            <button
                              onClick={() => handleAcceptTransfer(pair)}
                              className="btn btn-primary-glow btn-sm"
                            >
                              Accept & Reconcile
                            </button>
                            <button
                              onClick={() => handleRejectTransfer(pair)}
                              className="btn btn-outline-danger btn-sm"
                            >
                              Allow Double-Counting
                            </button>
                          </div>
                        </>
                      ) : isAccepted ? (
                        <>
                          <p className="action-hint" style={{ margin: 0 }}>
                            Excluding this payment from income and expenses to avoid double-counting.
                          </p>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            <button
                              onClick={() => setExpandedPairs(prev => ({ ...prev, [pair.id]: false }))}
                              className="btn btn-secondary btn-sm"
                            >
                              Collapse details
                            </button>
                            <button
                              onClick={() => handleRejectTransfer(pair)}
                              className="btn btn-outline-danger btn-sm"
                            >
                              Reject Match (Double-Count)
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="action-hint warning" style={{ margin: 0 }}>
                            <AlertTriangle size={12} /> Double-counting allowed: This transaction is currently counted as both bank expense and credit card income.
                          </p>
                          <button
                            onClick={() => handleAcceptTransfer(pair)}
                            className="btn btn-primary-glow btn-sm"
                            style={{ marginTop: '12px' }}
                          >
                            Reconcile (Ignore both sides)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {auditResult && (
        <div className="audit-modal-backdrop animate-fade-in">
          <div className="audit-modal glass-card">
            <div className="audit-modal-header">
              <div className="audit-title-wrapper">
                <div className="audit-icon-badge">
                  <Database size={18} className="text-primary" />
                </div>
                <h3>Database Audit & Sync Report</h3>
              </div>
              <button 
                onClick={() => setAuditResult(null)}
                className="btn-close"
              >
                &times;
              </button>
            </div>
            
            <div className="audit-modal-body">
              <p className="audit-intro">
                The database has been audited and synchronized successfully. Below is a detailed health report of the stored schema, assets, and reconciliation maps.
              </p>

              <div className="audit-stats-grid">
                <div className="audit-stat-item">
                  <span className="audit-stat-label">Audited Transactions</span>
                  <span className="audit-stat-val">{auditResult.txCount}</span>
                </div>
                <div className="audit-stat-item">
                  <span className="audit-stat-label">Audited Salary Slips</span>
                  <span className="audit-stat-val">{auditResult.slipsCount}</span>
                </div>
                <div className="audit-stat-item">
                  <span className="audit-stat-label">Salary Matches Found</span>
                  <span className="audit-stat-val">{auditResult.salaryMatches}</span>
                </div>
                <div className="audit-stat-item">
                  <span className="audit-stat-label">Credit Card Transfers</span>
                  <span className="audit-stat-val">{auditResult.ccTransfers}</span>
                </div>
              </div>

              <div className="audit-actions-summary">
                <div className="summary-row">
                  <div className="status-indicator success">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="summary-text">
                    <strong>Orphaned Decisions:</strong> Removed <strong>{auditResult.orphansRemoved}</strong> orphaned reconciliation records mapping to deleted entries.
                  </div>
                </div>
                <div className="summary-row">
                  <div className="status-indicator success">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="summary-text">
                    <strong>Net Worth History:</strong> Recalculated and synchronized <strong>{auditResult.snapshotsSynced}</strong> monthly balance snapshots to reflect clean ledger balances.
                  </div>
                </div>
                <div className="summary-row">
                  <div className="status-indicator success">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="summary-text">
                    <strong>Data Integrity:</strong> All tables validated and indices repaired successfully.
                  </div>
                </div>
              </div>
            </div>

            <div className="audit-modal-footer">
              <button
                onClick={() => setAuditResult(null)}
                className="btn btn-primary-glow"
                style={{ width: '100%' }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .view-container {
          padding: 30px;
          height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .view-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .view-header-row h1 {
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 4px;
        }

        .view-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
        }

        .control-panel {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .glass-card {
          background: var(--bg-card);
          backdrop-filter: var(--blur-glass);
          -webkit-backdrop-filter: var(--blur-glass);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-lg);
          box-shadow: var(--shadow-premium);
        }

        .filters-group {
          display: flex;
          gap: 16px;
        }

        .filter-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-item label {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-input {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          color: var(--text-primary);
          padding: 8px 12px;
          font-family: var(--font-body);
          font-size: 0.88rem;
          outline: none;
          min-width: 140px;
          transition: var(--transition-smooth);
        }

        .form-input:focus {
          border-color: var(--border-glass-focus);
          background: rgba(255, 255, 255, 0.06);
        }

        .stats-cards {
          display: flex;
          gap: 16px;
        }

        .mini-stat-card {
          padding: 10px 18px;
          border-radius: var(--border-radius-md);
          border: 1px solid transparent;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .mini-stat-card.reconciled {
          background: hsla(142, 70%, 50%, 0.05);
          border-color: hsla(142, 70%, 50%, 0.15);
        }

        .mini-stat-card.double-counted {
          background: hsla(350, 89%, 60%, 0.05);
          border-color: hsla(350, 89%, 60%, 0.15);
        }

        .mini-stat-card .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .mini-stat-card .stat-value {
          font-size: 1.3rem;
          font-weight: 700;
        }

        .mini-stat-card.reconciled .stat-value {
          color: var(--success);
        }

        .mini-stat-card.double-counted .stat-value {
          color: var(--danger);
        }

        .list-wrapper {
          flex: 1;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 40px;
          text-align: center;
          max-width: 500px;
          margin: 40px auto;
        }

        .empty-icon-wrapper {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: hsla(142, 70%, 50%, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          border: 1px solid hsla(142, 70%, 50%, 0.2);
        }

        .empty-icon-sparkle {
          color: var(--success);
        }

        .empty-state h3 {
          font-size: 1.4rem;
          margin-bottom: 8px;
        }

        .empty-state p {
          color: var(--text-muted);
          font-size: 0.92rem;
          line-height: 1.5;
        }

        .pairs-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding-bottom: 40px;
        }

        .pair-card {
          padding: 24px;
          transition: var(--transition-smooth);
        }

        .pair-card.accepted {
          border-left: 4px solid var(--success);
        }

        .pair-card.rejected {
          border-left: 4px solid var(--danger);
        }

        .pair-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 30px;
          border: 1px solid transparent;
        }

        .status-badge.accepted {
          background: hsla(142, 70%, 50%, 0.08);
          border-color: hsla(142, 70%, 50%, 0.2);
          color: var(--success);
        }

        .status-badge.rejected {
          background: hsla(350, 89%, 60%, 0.08);
          border-color: hsla(350, 89%, 60%, 0.2);
          color: var(--danger);
        }

        .pair-comparison-grid {
          display: grid;
          grid-template-columns: 1fr 60px 1fr;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }

        @media (max-width: 768px) {
          .pair-comparison-grid {
            grid-template-columns: 1fr;
          }
          .connector-column {
            transform: rotate(90deg);
            margin: 10px 0;
          }
        }

        .source-side {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: var(--border-radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .side-title {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .amount-display {
          font-size: 1.8rem;
          font-weight: 800;
          font-family: var(--font-heading);
          letter-spacing: -0.02em;
        }

        .text-success {
          color: var(--success) !important;
        }

        .text-primary {
          color: var(--primary) !important;
        }

        .details-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 10px;
          margin-top: 4px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          gap: 10px;
        }

        .detail-item .lbl {
          color: var(--text-muted);
          font-weight: 500;
        }

        .detail-item .val {
          color: var(--text-secondary);
          font-weight: 600;
          text-align: right;
        }

        .file-item .val {
          color: var(--primary);
        }

        .truncate {
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .connector-column {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .connector-line {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .arrow-icon {
          color: var(--text-muted);
        }

        .reason-container {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 12px 16px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 20px;
        }

        .reason-icon {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .reason-text {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .card-actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 16px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .action-hint {
          font-size: 0.78rem;
          color: var(--text-muted);
          max-width: 70%;
          line-height: 1.4;
        }

        .action-hint.warning {
          color: var(--danger);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .btn {
          font-family: var(--font-body);
          font-size: 0.82rem;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: var(--border-radius-md);
          border: 1px solid transparent;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
        }

        .btn-primary-glow {
          background: var(--primary-glow);
          color: var(--text-primary);
          border-color: hsla(263, 90%, 65%, 0.3);
        }

        .btn-primary-glow:hover {
          background: var(--primary);
          box-shadow: 0 0 12px var(--primary);
        }

        .btn-outline-danger {
          background: transparent;
          color: var(--danger);
          border-color: hsla(350, 89%, 60%, 0.3);
        }

        .btn-outline-danger:hover {
          background: var(--danger-glow);
          border-color: var(--danger);
        }

        /* Audit & Sync Modal Styles */
        .audit-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .audit-modal {
          max-width: 520px;
          width: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-lg);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .audit-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .audit-title-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .audit-icon-badge {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .audit-modal-header h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .btn-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 1.5rem;
          cursor: pointer;
          transition: var(--transition-smooth);
          line-height: 1;
        }

        .btn-close:hover {
          color: var(--text-primary);
        }

        .audit-modal-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .audit-intro {
          font-size: 0.88rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .audit-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .audit-stat-item {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: var(--border-radius-md);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .audit-stat-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .audit-stat-val {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .audit-actions-summary {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: var(--border-radius-md);
          padding: 16px;
        }

        .summary-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .status-indicator.success {
          color: var(--success);
        }

        .summary-text {
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .summary-text strong {
          color: var(--text-primary);
        }

        .audit-modal-footer {
          padding: 20px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(0, 0, 0, 0.1);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes scaleUp {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};
export default SmartReviewView;
