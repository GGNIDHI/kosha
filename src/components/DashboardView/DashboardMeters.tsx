import React from 'react';
import { MeterGauge } from './MeterGauge';

interface DashboardMetersProps {
  periodLabel: string;
  expenseRate: number;
  savingsRateClamped: number;
  investmentRate: number;
  taxRate: number;
  budgetCompliancePct: number;
  dtiRate: number;
  budgetsLength: number;
  debtsLength: number;
  onMeterClick: (type: 'expense' | 'savings' | 'investment' | 'budget' | 'debt' | 'tax') => void;
}

export const DashboardMeters: React.FC<DashboardMetersProps> = ({
  periodLabel,
  expenseRate,
  savingsRateClamped,
  investmentRate,
  taxRate,
  budgetCompliancePct,
  dtiRate,
  budgetsLength,
  debtsLength,
  onMeterClick,
}) => {
  return (
    <div className="meters-section">
      <div className="meters-header">
        <span className="meters-title">Financial Meters · {periodLabel}</span>
      </div>
      <div className="meters-row">
        <MeterGauge
          label="Expense Rate"
          subtitle="of income spent"
          value={expenseRate}
          displayValue={`${Math.round(expenseRate)}%`}
          thresholds={{ ok: 60, warn: 80 }}
          lowIsGood
          helpText={expenseRate > 80 ? 'High! Reduce discretionary spending.' : expenseRate > 60 ? 'Moderate. Watch spending.' : 'Healthy spending level.'}
          onClick={() => onMeterClick('expense')}
        />
        <MeterGauge
          label="Savings Rate"
          subtitle="of income saved"
          value={savingsRateClamped}
          displayValue={`${Math.round(savingsRateClamped)}%`}
          thresholds={{ ok: 20, warn: 10 }}
          lowIsGood={false}
          helpText={savingsRateClamped >= 20 ? 'Excellent! Keep it up.' : savingsRateClamped >= 10 ? 'Good. Push past 20%.' : 'Low. Try to save 10%+'}
          onClick={() => onMeterClick('savings')}
        />
        <MeterGauge
          label="Investment Rate"
          subtitle="of income invested"
          value={investmentRate}
          displayValue={`${Math.round(investmentRate)}%`}
          thresholds={{ ok: 15, warn: 5 }}
          lowIsGood={false}
          helpText={investmentRate >= 15 ? 'Strong! Wealth is growing.' : investmentRate >= 5 ? 'Decent. Push to 15%.' : 'Low. Start a SIP.'}
          onClick={() => onMeterClick('investment')}
        />
        <MeterGauge
          label="Tax Rate"
          subtitle="of gross income"
          value={taxRate}
          displayValue={`${Math.round(taxRate)}%`}
          thresholds={{ ok: 20, warn: 30 }}
          lowIsGood
          helpText={taxRate > 30 ? 'High tax burden. Look for exemptions.' : taxRate > 20 ? 'Moderate tax bracket.' : 'Low tax rate.'}
          onClick={() => onMeterClick('tax')}
        />
        <MeterGauge
          label="Budget Compliance"
          subtitle="categories in limit"
          value={budgetCompliancePct}
          displayValue={`${budgetCompliancePct}%`}
          thresholds={{ ok: 80, warn: 50 }}
          lowIsGood={false}
          helpText={budgetsLength === 0 ? 'Set budgets to track.' : budgetCompliancePct === 100 ? 'Perfect! All budgets on track.' : budgetCompliancePct >= 80 ? 'A few categories over.' : 'Several budgets exceeded.'}
          onClick={() => onMeterClick('budget')}
        />
        <MeterGauge
          label="Debt-to-Income"
          subtitle="of income on EMIs"
          value={dtiRate}
          displayValue={`${Math.round(dtiRate)}%`}
          thresholds={{ ok: 30, warn: 50 }}
          lowIsGood
          helpText={debtsLength === 0 ? 'No active debts. Great!' : dtiRate <= 30 ? 'Healthy DTI.' : dtiRate <= 50 ? 'Moderate. Avoid new loans.' : 'High DTI. Prioritise payoff.'}
          onClick={() => onMeterClick('debt')}
        />
      </div>
    </div>
  );
};
