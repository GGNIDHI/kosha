import Dexie, { type Table } from 'dexie';

export interface Setting {
  key: string;
  value: any;
}

export interface Transaction {
  id?: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  source: 'manual' | 'bank_statement' | 'csv';
  pdfName?: string;
  notes?: string;
}

export interface SalarySlip {
  id?: string;
  month: number;
  year: number;
  basicPay: number;
  hra: number;
  allowances: number;
  providentFund: number;
  taxDeducted: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  pdfName?: string;
}

export interface Investment {
  id?: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice?: number;
  lastUpdated: string;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
}

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string; // YYYY-MM-DD
  colour: string;
  notes?: string;
  createdAt: string;
}

export interface Debt {
  id: string;
  name: string;
  type: 'home_loan' | 'personal_loan' | 'car_loan' | 'credit_card' | 'other';
  principalAmount: number;
  outstandingAmount: number;
  interestRate: number; // annual %
  emiAmount: number;
  startDate: string;
  endDate: string;
  nextDueDate: string;
  notes?: string;
}

export interface NetWorthSnapshot {
  id: string; // YYYY-MM
  date: string;
  netWorth: number;
  cashBalance: number;
  portfolioValue: number;
}

class KoshaDB extends Dexie {
  settings!: Table<Setting, string>;
  transactions!: Table<Transaction, string>;
  salarySlips!: Table<SalarySlip, string>;
  investments!: Table<Investment, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  debts!: Table<Debt, string>;
  netWorthSnapshots!: Table<NetWorthSnapshot, string>;

  constructor() {
    super('KoshaFinanceDB');
    this.version(1).stores({
      settings: 'key',
      transactions: 'id, date, category, type, source',
      salarySlips: 'id, [year+month], year, month',
      investments: 'id, symbol',
    });
    this.version(2).stores({
      budgets: 'id, category'
    });
    this.version(3).stores({
      goals: 'id, targetDate, createdAt',
      debts: 'id, type, nextDueDate',
      netWorthSnapshots: 'id, date',
    });
  }
}

export const db = new KoshaDB();

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

/** Record monthly net worth snapshot (upserts by YYYY-MM key) */
export async function recordNetWorthSnapshot(
  netWorth: number,
  cashBalance: number,
  portfolioValue: number
): Promise<void> {
  const today = new Date();
  const id = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await db.netWorthSnapshots.put({
    id,
    date: today.toISOString().split('T')[0],
    netWorth,
    cashBalance,
    portfolioValue,
  });
}
