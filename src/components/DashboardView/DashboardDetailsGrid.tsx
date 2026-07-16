import React from 'react';
import { Target, RefreshCw, ArrowRight } from 'lucide-react';
import { formatAmount } from '../../utils/currency';
import type { Transaction, SalarySlip } from '../../db/database';

interface BudgetHealthItem {
  category: string;
  spent: number;
  monthlyLimit: number;
  pct: number;
}

interface RecurringSpendItem {
  description: string;
  category: string;
  lastDate: string;
  averageAmount: number;
  frequency: string;
}

interface DashboardDetailsGridProps {
  periodLabel: string;
  currency: string;
  budgetHealth: BudgetHealthItem[];
  recurringTxs: RecurringSpendItem[];
  totalMonthlyRecurring: number;
  recentTransactions: Transaction[];
  recentSalarySlips: SalarySlip[];
  onNavigate: (view: string) => void;
  onRecurringClick: (description: string) => void;
}

const MNF = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DashboardDetailsGrid: React.FC<DashboardDetailsGridProps> = ({
  periodLabel,
  currency,
  budgetHealth,
  recurringTxs,
  totalMonthlyRecurring,
  recentTransactions,
  recentSalarySlips,
  onNavigate,
  onRecurringClick,
}) => {
  return (
    <div className="dashboard-lists-row">
      {/* Budget Health */}
      {budgetHealth.length > 0 && (
        <div className="glass-card dashboard-list-card">
          <div className="list-card-header">
            <h3>
              <Target size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Budget Health · {periodLabel}
            </h3>
            <button className="btn-link" onClick={() => onNavigate('budgets')}>
              <span>Manage</span>
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="list-card-body">
            <div className="budget-health-list">
              {budgetHealth.map(b => (
                <div key={b.category} className="bh-item">
                  <div className="bh-meta">
                    <span className="bh-cat">{b.category}</span>
                    <span className={`bh-pct ${b.pct >= 100 ? 'over' : b.pct >= 80 ? 'warn' : 'ok'}`}>{b.pct}%</span>
                  </div>
                  <div className="bh-bar-track">
                    <div className="bh-bar-fill" style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct >= 100 ? '#ef4444' : b.pct >= 80 ? '#f97316' : '#22c55e' }} />
                  </div>
                  <div className="bh-amounts">
                    <span>{formatAmount(b.spent, currency)}</span>
                    <span className="text-muted">/ {formatAmount(b.monthlyLimit, currency)}</span>
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
            <h3>
              <RefreshCw size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Recurring Spend
            </h3>
            {totalMonthlyRecurring > 0 && (
              <span className="recurring-monthly-total">
                {formatAmount(totalMonthlyRecurring, currency)}/mo
              </span>
            )}
          </div>
          <div className="list-card-body">
            <div className="mini-ledger-list">
              {recurringTxs.map((r, i) => (
                <div key={i} className="mini-ledger-item recurring-clickable" onClick={() => onRecurringClick(r.description)}
                  title="Click to see full history">
                  <div className="item-details">
                    <span className="item-desc">{r.description}</span>
                    <span className="item-meta">{r.category} · last {r.lastDate}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span className="item-value debit">{formatAmount(r.averageAmount, currency)}</span>
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
          <button className="btn-link" onClick={() => onNavigate('ledger')}>
            <span>View All</span>
            <ArrowRight size={14} />
          </button>
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
                  <span className={`item-value ${tx.type}`}>{tx.type === 'credit' ? '+' : '-'} {formatAmount(tx.amount, currency)}</span>
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
          <button className="btn-link" onClick={() => onNavigate('uploads')}>
            <span>Analyze New</span>
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="list-card-body">
          {recentSalarySlips.length === 0 ? (
            <div className="empty-list-state"><p>Upload salary slip PDFs to compile your income profile.</p></div>
          ) : (
            <div className="salary-history-list">
              {recentSalarySlips.map(slip => (
                <div key={slip.id} className="salary-history-item">
                  <div className="item-details">
                    <span className="item-desc">{MNF[slip.month - 1]} {slip.year}</span>
                    <span className="item-meta">Basic: {formatAmount(slip.basicPay, currency)} · Deductions: {formatAmount(slip.providentFund + slip.taxDeducted + slip.otherDeductions, currency)}</span>
                  </div>
                  <div className="salary-takehome">
                    <span className="salary-takehome-val">{formatAmount(slip.netPay, currency)}</span>
                    <span className="salary-takehome-lbl">Net Credit</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
