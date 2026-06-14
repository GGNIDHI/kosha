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
  pdfSourceId?: string; // links to ParsedPdf.id
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
  pdfSourceId?: string;
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

/** Metadata record for each parsed PDF document */
export interface ParsedPdf {
  id?: string;
  filename: string;
  parsedAt: string; // ISO timestamp
  transactionCount: number;
  llmUsed: 'gemini' | 'groq';
  type: 'bank' | 'salary';
}

/** A spending/income category (default or user-created) */
export interface Category {
  id?: number;
  label: string;       // display name e.g. "Food"
  emoji: string;       // emoji icon e.g. "🍔"
  isDefault: boolean;  // true = built-in, cannot delete
  color?: string;      // optional accent hex
}

/** Seed data for default categories */
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { label: 'Food',          emoji: '🍔', isDefault: true, color: '#f59e0b' },
  { label: 'Shopping',      emoji: '🛍️', isDefault: true, color: '#8b5cf6' },
  { label: 'Utilities',     emoji: '💡', isDefault: true, color: '#06b6d4' },
  { label: 'Travel',        emoji: '✈️', isDefault: true, color: '#10b981' },
  { label: 'Salary',        emoji: '💰', isDefault: true, color: '#22c55e' },
  { label: 'Investment',    emoji: '📈', isDefault: true, color: '#3b82f6' },
  { label: 'Health',        emoji: '🏥', isDefault: true, color: '#ec4899' },
  { label: 'Entertainment', emoji: '🎬', isDefault: true, color: '#f97316' },
  { label: 'Others',        emoji: '📦', isDefault: true, color: '#6b7280' },
];

class KoshaDB extends Dexie {
  settings!: Table<Setting, string>;
  transactions!: Table<Transaction, string>;
  salarySlips!: Table<SalarySlip, string>;
  investments!: Table<Investment, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  debts!: Table<Debt, string>;
  netWorthSnapshots!: Table<NetWorthSnapshot, string>;
  parsedPdfs!: Table<ParsedPdf, string>;
  categories!: Table<Category, number>;

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
    this.version(4).stores({
      parsedPdfs: '++id, parsedAt, type',
      categories: '++id, &label, isDefault',
      // Re-index transactions with pdfSourceId
      transactions: 'id, date, category, type, source, pdfSourceId',
      salarySlips: 'id, [year+month], year, month, pdfSourceId',
    }).upgrade(async tx => {
      // Seed default categories if the table is empty
      const count = await tx.table('categories').count();
      if (count === 0) {
        await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES);
      }
    });
  }
}

export const db = new KoshaDB();

// Seed default categories on first run and import environment defaults if present
db.on('ready', async () => {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
  }

  const hasBeenInitialized = await getSetting('hasBeenInitialized', false);
  if (!hasBeenInitialized) {
    const env = (import.meta as any).env || {};
    const initName = env.VITE_INIT_NAME || '';
    const initCurrency = env.VITE_INIT_CURRENCY || '';
    const initGeminiKey = env.VITE_INIT_GEMINI_KEY || '';
    const initGroqKey = env.VITE_INIT_GROQ_KEY || '';

    if (initName) await setSetting('userName', initName);
    if (initCurrency) await setSetting('currency', initCurrency);
    if (initGeminiKey) await setSetting('geminiApiKey', initGeminiKey);
    if (initGroqKey) await setSetting('groqApiKey', initGroqKey);

    if (initName || initCurrency || initGeminiKey || initGroqKey) {
      await setSetting('hasBeenInitialized', true);
    }
  }
});

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
