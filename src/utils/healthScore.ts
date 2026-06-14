import type { Transaction, Budget, SalarySlip } from '../db/database';

export interface HealthScoreBreakdown {
  total: number; // 0-100
  savingsRate: { score: number; max: number; value: number; label: string };
  budgetAdherence: { score: number; max: number; value: number; label: string };
  emergencyFund: { score: number; max: number; value: number; label: string };
  investmentRate: { score: number; max: number; value: number; label: string };
  subscriptionBurden: { score: number; max: number; value: number; label: string };
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  colour: string;
}

function gradeFromScore(score: number): { grade: HealthScoreBreakdown['grade']; colour: string } {
  if (score >= 90) return { grade: 'A+', colour: '#22c55e' };
  if (score >= 75) return { grade: 'A',  colour: '#4ade80' };
  if (score >= 60) return { grade: 'B',  colour: '#84cc16' };
  if (score >= 45) return { grade: 'C',  colour: '#f97316' };
  if (score >= 30) return { grade: 'D',  colour: '#ef4444' };
  return              { grade: 'F',  colour: '#dc2626' };
}

export function computeHealthScore(
  transactions: Transaction[],
  budgets: Budget[],
  salarySlips: SalarySlip[],
  monthlyRecurringTotal: number,
  cashBalance: number,
): HealthScoreBreakdown {
  // Use the transactions as passed — caller is responsible for period filtering
  const periodTxs     = transactions;

  // No data at all → return empty score so UI shows nothing meaningful
  if (periodTxs.length === 0) {
    return {
      total: 0,
      savingsRate:        { score: 0, max: 25, value: 0, label: 'No data' },
      budgetAdherence:    { score: 0, max: 25, value: 0, label: 'No data' },
      emergencyFund:      { score: 0, max: 20, value: 0, label: 'No data' },
      investmentRate:     { score: 0, max: 20, value: 0, label: 'No data' },
      subscriptionBurden: { score: 0, max: 10, value: 0, label: 'No data' },
      grade: 'F',
      colour: '#6b7280',
    };
  }

  const monthlyIncome   = periodTxs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const monthlyExpenses = periodTxs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  // 1. Savings Rate (25 pts)
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
  let srScore = 0;
  if (savingsRate >= 30) srScore = 25;
  else if (savingsRate >= 20) srScore = 20;
  else if (savingsRate >= 10) srScore = 12;
  else if (savingsRate >= 5)  srScore = 6;

  // 2. Budget Adherence (25 pts)
  let baScore = 25;
  let inLimitCount = 0;
  if (budgets.length > 0) {
    budgets.forEach(b => {
      const spent = periodTxs
        .filter(t => t.type === 'debit' && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      if (spent <= b.monthlyLimit) inLimitCount++;
    });
    baScore = Math.round((inLimitCount / budgets.length) * 25);
  }
  const adherencePct = budgets.length > 0 ? Math.round((inLimitCount / budgets.length) * 100) : 100;

  // 3. Emergency Fund (20 pts) — months of expenses covered by cash balance
  const avgMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : 1;
  const monthsCovered = cashBalance / avgMonthlyExpenses;
  let efScore = 0;
  if (monthsCovered >= 6)      efScore = 20;
  else if (monthsCovered >= 3) efScore = 14;
  else if (monthsCovered >= 1) efScore = 7;

  // 4. Investment Rate (20 pts) — salary slips may have PF; also look for Investment category credits
  const investmentDebits = periodTxs.filter(t => t.category === 'Investment').reduce((s, t) => s + t.amount, 0);
  const latestSlip = [...salarySlips].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)[0];
  const totalPF = latestSlip?.providentFund ?? 0;
  const totalInvested = investmentDebits + totalPF;
  const investmentRate = monthlyIncome > 0 ? (totalInvested / monthlyIncome) * 100 : 0;
  let irScore = 0;
  if (investmentRate >= 20)     irScore = 20;
  else if (investmentRate >= 10) irScore = 14;
  else if (investmentRate >= 5)  irScore = 7;

  // 5. Subscription Burden (10 pts)
  const subRate = monthlyIncome > 0 ? (monthlyRecurringTotal / monthlyIncome) * 100 : 0;
  let sbScore = 10;
  if (subRate > 15)      sbScore = 0;
  else if (subRate > 10) sbScore = 3;
  else if (subRate > 5)  sbScore = 6;

  const total = Math.min(100, srScore + baScore + efScore + irScore + sbScore);
  const { grade, colour } = gradeFromScore(total);

  return {
    total,
    savingsRate: { score: srScore, max: 25, value: Math.round(savingsRate * 10) / 10, label: `${Math.round(savingsRate)}% savings rate` },
    budgetAdherence: { score: baScore, max: 25, value: adherencePct, label: `${inLimitCount}/${budgets.length} categories in limit` },
    emergencyFund: { score: efScore, max: 20, value: Math.round(monthsCovered * 10) / 10, label: `${Math.round(monthsCovered * 10) / 10} months covered` },
    investmentRate: { score: irScore, max: 20, value: Math.round(investmentRate * 10) / 10, label: `${Math.round(investmentRate)}% of income invested` },
    subscriptionBurden: { score: sbScore, max: 10, value: Math.round(subRate * 10) / 10, label: `${Math.round(subRate)}% of income on subscriptions` },
    grade,
    colour,
  };
}
