import Dexie, { type Table } from 'dexie';

export interface Setting {
  key: string;
  value: any;
}

export interface Transaction {
  id?: string; // UUID or timestamp string
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  source: 'manual' | 'bank_statement';
  pdfName?: string;
  notes?: string;
}

export interface SalarySlip {
  id?: string; // UUID or timestamp string
  month: number; // 1 = January, 12 = December
  year: number;
  basicPay: number;
  hra: number;
  allowances: number;
  providentFund: number;
  taxDeducted: number; // TDS / Income Tax
  otherDeductions: number;
  grossPay: number;
  netPay: number; // Take-home salary
  pdfName?: string;
}

export interface Investment {
  id?: string; // Symbol (e.g. RELIANCE)
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice?: number;
  lastUpdated: string;
}

class KoshaDB extends Dexie {
  settings!: Table<Setting, string>;
  transactions!: Table<Transaction, string>;
  salarySlips!: Table<SalarySlip, string>;
  investments!: Table<Investment, string>;

  constructor() {
    super('KoshaFinanceDB');
    this.version(1).stores({
      settings: 'key',
      transactions: 'id, date, category, type, source',
      salarySlips: 'id, [year+month], year, month',
      investments: 'id, symbol',
    });
  }
}

export const db = new KoshaDB();

// Helper functions for easy settings management
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}
