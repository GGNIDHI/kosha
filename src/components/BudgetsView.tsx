import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Budget } from '../db/database';
import { getSetting } from '../db/database';
import { formatAmount } from '../utils/currency';
import { CheckCircle2, AlertTriangle, AlertCircle, Pencil, Save } from 'lucide-react';

const CATEGORIES = [
  { name: 'Food', emoji: '🍜', color: '#f97316' },
  { name: 'Shopping', emoji: '🛍️', color: '#a855f7' },
  { name: 'Utilities', emoji: '💡', color: '#06b6d4' },
  { name: 'Travel', emoji: '✈️', color: '#eab308' },
  { name: 'Health', emoji: '❤️‍🩹', color: '#ef4444' },
  { name: 'Entertainment', emoji: '🎬', color: '#ec4899' },
  { name: 'Investment', emoji: '📈', color: '#3b82f6' },
  { name: 'Others', emoji: '📦', color: '#6b7280' },
];

export const BudgetsView: React.FC = () => {
  const [currency, setCurrency] = useState('INR');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    getSetting('currency', 'INR').then(setCurrency);
  }, []);

  // Live data: budgets + current month's spending per category
  const liveData = useLiveQuery(async () => {
    const budgets = await db.budgets.toArray();
    const today = new Date();
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const txs = await db.transactions
      .where('date').startsWith(monthStr)
      .toArray();

    const spentByCategory: Record<string, number> = {};
    txs.filter(t => t.type === 'debit').forEach(t => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
    });

    return { budgets, spentByCategory };
  }, []) ?? { budgets: [], spentByCategory: {} };

  const { budgets, spentByCategory } = liveData;

  const budgetMap: Record<string, Budget> = {};
  budgets.forEach(b => { budgetMap[b.category] = b; });

  const totalBudget = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
  const overBudgetCount = CATEGORIES.filter(c => {
    const b = budgetMap[c.name];
    return b && (spentByCategory[c.name] || 0) > b.monthlyLimit;
  }).length;

  const handleEdit = (category: string) => {
    const existing = budgetMap[category];
    setEditingId(category);
    setEditValue(existing ? String(existing.monthlyLimit) : '');
  };

  const handleSave = async (category: string) => {
    const limit = parseFloat(editValue);
    if (isNaN(limit) || limit < 0) { setEditingId(null); return; }
    try {
      await db.budgets.put({ id: category, category, monthlyLimit: limit });
      setSaveMsg(`${category} budget saved!`);
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      console.error(e);
    }
    setEditingId(null);
  };

  const handleRemove = async (category: string) => {
    await db.budgets.delete(category);
  };

  const getStatus = (spent: number, limit: number) => {
    const pct = (spent / limit) * 100;
    if (pct >= 100) return { label: 'Over Budget', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: 'over' };
    if (pct >= 80) return { label: 'Warning', color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: 'warn' };
    return { label: 'On Track', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: 'ok' };
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Budget Goals</h1>
          <p>Set monthly spending limits per category and track your progress.</p>
        </div>
        {overBudgetCount > 0 && (
          <div className="budget-alert-badge">
            <AlertCircle size={16} />
            <span>{overBudgetCount} categor{overBudgetCount > 1 ? 'ies' : 'y'} over limit</span>
          </div>
        )}
      </header>

      {saveMsg && <div className="budget-save-toast"><CheckCircle2 size={16} />{saveMsg}</div>}

      {/* Summary banner */}
      {totalBudget > 0 && (
        <div className="glass-card budget-summary-banner">
          <div className="bsb-item">
            <span className="bsb-label">Total Budget Set</span>
            <strong>{formatAmount(totalBudget, currency)}</strong>
          </div>
          <div className="bsb-divider" />
          <div className="bsb-item">
            <span className="bsb-label">Spent This Month</span>
            <strong className={totalSpent > totalBudget ? 'text-danger' : ''}>{formatAmount(totalSpent, currency)}</strong>
          </div>
          <div className="bsb-divider" />
          <div className="bsb-item">
            <span className="bsb-label">Remaining</span>
            <strong className={(totalBudget - totalSpent) < 0 ? 'text-danger' : 'text-success'}>
              {formatAmount(Math.abs(totalBudget - totalSpent), currency)}
              {(totalBudget - totalSpent) < 0 ? ' over' : ''}
            </strong>
          </div>
          <div className="bsb-divider" />
          <div className="bsb-item">
            <span className="bsb-label">Overall Usage</span>
            <div className="bsb-progress-wrap">
              <div className="bsb-progress-bar">
                <div
                  className="bsb-progress-fill"
                  style={{
                    width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%`,
                    background: totalSpent > totalBudget ? '#ef4444' : 'var(--primary)'
                  }}
                />
              </div>
              <span>{Math.round((totalSpent / totalBudget) * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Category grid */}
      <div className="budgets-grid">
        {CATEGORIES.map(cat => {
          const budget = budgetMap[cat.name];
          const spent = spentByCategory[cat.name] || 0;
          const hasLimit = !!budget;
          const pct = hasLimit ? Math.min(100, (spent / budget.monthlyLimit) * 100) : 0;
          const remaining = hasLimit ? budget.monthlyLimit - spent : null;
          const status = hasLimit ? getStatus(spent, budget.monthlyLimit) : null;
          const isEditing = editingId === cat.name;

          return (
            <div
              key={cat.name}
              className="glass-card budget-card"
              style={{ borderColor: hasLimit && status ? status.color + '33' : undefined }}
            >
              {/* Header */}
              <div className="budget-card-header">
                <div className="budget-cat-label">
                  <span className="budget-cat-emoji">{cat.emoji}</span>
                  <span className="budget-cat-name" style={{ color: cat.color }}>{cat.name}</span>
                </div>
                {status && (
                  <div className="budget-status-chip" style={{ background: status.bg, color: status.color }}>
                    {status.icon === 'over' && <AlertCircle size={11} />}
                    {status.icon === 'warn' && <AlertTriangle size={11} />}
                    {status.icon === 'ok' && <CheckCircle2 size={11} />}
                    <span>{status.label}</span>
                  </div>
                )}
              </div>

              {/* Spent */}
              <div className="budget-spent-row">
                <span className="budget-spent-amount">{formatAmount(spent, currency)}</span>
                {hasLimit && (
                  <span className="budget-limit-text">of {formatAmount(budget.monthlyLimit, currency)}</span>
                )}
              </div>

              {/* Progress bar */}
              {hasLimit && (
                <div className="budget-progress-track">
                  <div
                    className="budget-progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : cat.color
                    }}
                  />
                </div>
              )}

              {/* Remaining */}
              {hasLimit && remaining !== null && (
                <div className="budget-remaining">
                  {remaining >= 0
                    ? <span className="text-muted">{formatAmount(remaining, currency)} remaining</span>
                    : <span className="text-danger">{formatAmount(Math.abs(remaining), currency)} over budget!</span>
                  }
                </div>
              )}

              {!hasLimit && (
                <p className="budget-no-limit">No limit set yet</p>
              )}

              {/* Edit area */}
              {isEditing ? (
                <div className="budget-edit-row">
                  <span className="budget-edit-symbol">{budget ? '' : ''}</span>
                  <input
                    type="number"
                    className="form-input budget-edit-input"
                    placeholder="Monthly limit"
                    value={editValue}
                    min="0"
                    autoFocus
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(cat.name); if (e.key === 'Escape') setEditingId(null); }}
                  />
                  <button className="btn btn-primary btn-xs" onClick={() => handleSave(cat.name)}>
                    <Save size={13} />
                  </button>
                  <button className="btn btn-secondary btn-xs" onClick={() => setEditingId(null)}>✕</button>
                </div>
              ) : (
                <div className="budget-actions-row">
                  <button className="btn btn-secondary btn-xs" onClick={() => handleEdit(cat.name)}>
                    <Pencil size={12} /> {hasLimit ? 'Edit Limit' : 'Set Limit'}
                  </button>
                  {hasLimit && (
                    <button className="btn btn-ghost-danger btn-xs" onClick={() => handleRemove(cat.name)}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .budget-alert-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 20px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          color: #ef4444;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .budget-save-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.2);
          border-radius: var(--border-radius-md);
          color: #22c55e;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .budget-summary-banner {
          display: flex;
          align-items: center;
          gap: 0;
          padding: 20px 28px;
          flex-wrap: wrap;
        }

        .bsb-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 24px;
          flex: 1;
          min-width: 140px;
        }

        .bsb-item:first-child { padding-left: 0; }

        .bsb-label {
          font-size: 0.78rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .bsb-item strong {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .bsb-item strong.text-danger { color: #ef4444; }
        .bsb-item strong.text-success { color: #22c55e; }

        .bsb-divider {
          width: 1px;
          height: 40px;
          background: var(--border-glass);
        }

        .bsb-progress-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .bsb-progress-bar {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 99px;
          overflow: hidden;
          min-width: 80px;
        }

        .bsb-progress-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.5s ease;
        }

        .budgets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
        }

        .budget-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border: 1px solid var(--border-glass);
          transition: border-color 0.3s ease;
        }

        .budget-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .budget-cat-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .budget-cat-emoji { font-size: 1.3rem; }

        .budget-cat-name {
          font-size: 0.95rem;
          font-weight: 700;
        }

        .budget-status-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 99px;
          font-size: 0.72rem;
          font-weight: 600;
        }

        .budget-spent-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .budget-spent-amount {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .budget-limit-text {
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        .budget-progress-track {
          height: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 99px;
          overflow: hidden;
        }

        .budget-progress-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
        }

        .budget-remaining {
          font-size: 0.82rem;
        }

        .budget-remaining .text-muted { color: var(--text-muted); }
        .budget-remaining .text-danger { color: #ef4444; font-weight: 600; }

        .budget-no-limit {
          font-size: 0.82rem;
          color: var(--text-muted);
          font-style: italic;
        }

        .budget-edit-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .budget-edit-input {
          flex: 1;
          padding: 6px 10px !important;
          font-size: 0.9rem !important;
        }

        .budget-actions-row {
          display: flex;
          gap: 8px;
        }

        .btn-xs {
          padding: 5px 10px !important;
          font-size: 0.78rem !important;
          gap: 4px !important;
        }

        .btn-ghost-danger {
          background: transparent;
          border: 1px solid transparent;
          color: #ef4444;
          padding: 5px 10px;
          border-radius: var(--border-radius-sm);
          cursor: pointer;
          font-size: 0.78rem;
          font-family: var(--font-body);
          transition: var(--transition-smooth);
        }

        .btn-ghost-danger:hover {
          background: rgba(239,68,68,0.08);
          border-color: rgba(239,68,68,0.2);
        }
      `}</style>
    </div>
  );
};
