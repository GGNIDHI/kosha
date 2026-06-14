import type { SalarySlip } from '../db/database';
import type { RecurringTransaction } from './recurringDetector';

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  label: string; // "Jun 15"
  projected: number;
  isToday: boolean;
  events: string[]; // e.g. "Netflix ₹199", "Salary credit"
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Projects the account balance for the next 30 days using:
 * - Current cash balance as starting point
 * - Latest salary slip net pay (credited on 1st of each month assumed)
 * - Recurring transactions (monthly debits)
 */
export function buildCashForecast(
  currentBalance: number,
  salarySlips: SalarySlip[],
  recurring: RecurringTransaction[],
): ForecastDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Latest salary net pay for expected credit
  const latestSlip = [...salarySlips].sort(
    (a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month
  )[0];
  const expectedSalary = latestSlip?.netPay ?? 0;

  const days: ForecastDay[] = [];
  let running = currentBalance;

  for (let i = 0; i <= 30; i++) {
    const d = addDays(today, i);
    const ds = formatDate(d);
    const events: string[] = [];

    // Salary credit on 1st
    if (d.getDate() === 1 && expectedSalary > 0) {
      running += expectedSalary;
      events.push(`💰 Salary ₹${Math.round(expectedSalary).toLocaleString()}`);
    }

    // Monthly recurring debits — use last known day-of-month from lastDate
    recurring
      .filter(r => r.frequency === 'monthly')
      .forEach(r => {
        const lastD = new Date(r.lastDate);
        if (d.getDate() === lastD.getDate()) {
          running -= r.averageAmount;
          events.push(`🔁 ${r.description} -₹${Math.round(r.averageAmount).toLocaleString()}`);
        }
      });

    days.push({
      date: ds,
      label: shortLabel(d),
      projected: Math.round(running),
      isToday: i === 0,
      events,
    });
  }

  return days;
}
