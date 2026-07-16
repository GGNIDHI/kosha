import React from 'react';
import { TrendingUp } from 'lucide-react';

interface HealthScoreComponent {
  score: number;
  max: number;
  value: number;
  label: string;
}

interface HealthScoreData {
  total: number;
  grade: string;
  colour: string;
  savingsRate: HealthScoreComponent;
  budgetAdherence: HealthScoreComponent;
  emergencyFund: HealthScoreComponent;
  investmentRate: HealthScoreComponent;
  subscriptionBurden: HealthScoreComponent;
}

interface DashboardHealthScoreProps {
  hasData: boolean;
  healthScore: HealthScoreData;
}

export const DashboardHealthScore: React.FC<DashboardHealthScoreProps> = ({
  hasData,
  healthScore,
}) => {
  if (!hasData) {
    return (
      <div className="glass-card health-score-card">
        <div className="hsc-empty">
          <TrendingUp size={32} style={{ color: '#6b7280', opacity: 0.4 }} />
          <p className="hsc-empty-title">No Data Yet</p>
          <p className="hsc-empty-sub">Parse or add transactions to calculate your financial health score.</p>
        </div>
      </div>
    );
  }

  const componentsList = [
    { compLabel: 'Savings Rate', ...healthScore.savingsRate },
    { compLabel: 'Budget Adherence', ...healthScore.budgetAdherence },
    { compLabel: 'Emergency Fund', ...healthScore.emergencyFund },
    { compLabel: 'Investment Rate', ...healthScore.investmentRate },
    { compLabel: 'Subscriptions', ...healthScore.subscriptionBurden },
  ];

  return (
    <div className="glass-card health-score-card">
      <div className="hsc-left">
        <div className="hsc-gauge-wrap">
          <svg viewBox="0 0 120 70" className="hsc-gauge-svg">
            <path d="M10,70 A60,60 0 0,1 110,70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
            <path d="M10,70 A60,60 0 0,1 110,70" fill="none" stroke={healthScore.colour} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(healthScore.total / 100) * 157} 157`}
              style={{ filter: `drop-shadow(0 0 6px ${healthScore.colour})` }} />
            <text x="60" y="68" textAnchor="middle" fontSize="22" fontWeight="800" fill={healthScore.colour}>{healthScore.total}</text>
          </svg>
        </div>
        <div className="hsc-grade" style={{ color: healthScore.colour }}>{healthScore.grade}</div>
        <p className="hsc-title">Financial Health</p>
      </div>
      <div className="hsc-components">
        {componentsList.map(c => (
          <div key={c.compLabel} className="hsc-component-row">
            <div className="hsc-comp-meta">
              <span className="hsc-comp-label">{c.compLabel}</span>
              <span className="hsc-comp-score">{c.score}/{c.max}</span>
            </div>
            <div className="hsc-comp-bar">
              <div className="hsc-comp-fill" style={{ width: `${(c.score / c.max) * 100}%`, background: healthScore.colour }} />
            </div>
          </div>
        ))}
      </div>
      <div className="hsc-tip">
        <TrendingUp size={14} className="primary-color" />
        <span>{healthScore.savingsRate.label} • {healthScore.emergencyFund.label}</span>
      </div>
    </div>
  );
};
