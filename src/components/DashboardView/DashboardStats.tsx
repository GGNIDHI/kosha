import React from 'react';
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react';
import { formatAmount } from '../../utils/currency';

interface DashboardStatsProps {
  periodLabel: string;
  periodIncome: number;
  periodExpenses: number;
  savingsRate: number;
  periodSavings: number;
  currency: string;
  onStatClick: (type: 'income' | 'expense' | 'savings') => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  periodLabel,
  periodIncome,
  periodExpenses,
  savingsRate,
  periodSavings,
  currency,
  onStatClick,
}) => {
  return (
    <div className="stats-row">
      <div className="glass-card stat-card" onClick={() => onStatClick('income')}>
        <div className="stat-card-header">
          <span className="stat-label">Income · {periodLabel}</span>
          <div className="stat-icon-wrapper success-bg">
            <ArrowDownLeft size={16} className="success-color" />
          </div>
        </div>
        <span className="stat-value">{formatAmount(periodIncome, currency)}</span>
      </div>

      <div className="glass-card stat-card" onClick={() => onStatClick('expense')}>
        <div className="stat-card-header">
          <span className="stat-label">Expenses · {periodLabel}</span>
          <div className="stat-icon-wrapper danger-bg">
            <ArrowUpRight size={16} className="danger-color" />
          </div>
        </div>
        <span className="stat-value">{formatAmount(periodExpenses, currency)}</span>
      </div>

      <div className="glass-card stat-card" onClick={() => onStatClick('savings')}>
        <div className="stat-card-header">
          <span className="stat-label">Savings Rate · {periodLabel}</span>
          <div className="stat-icon-wrapper primary-bg">
            <PiggyBank size={16} className="primary-color" />
          </div>
        </div>
        <div className="stat-value-group">
          <span className="stat-value">{savingsRate.toFixed(1)}%</span>
          <span className="pnl-percent badge badge-category">
            {formatAmount(periodSavings, currency)} saved
          </span>
        </div>
      </div>
    </div>
  );
};
