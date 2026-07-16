import type { Transaction } from '../db/database';

/** A single parsed row from a CSV bank statement */
export interface CsvRow {
  date: string;       // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
}

/** Result of a parse attempt */
export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
  detectedFormat: string;
}

// ─── Auto-categoriser ─────────────────────────────────────────────────────────
const CATEGORY_RULES: [RegExp, string][] = [
  [/zomato|swiggy|dominos|pizza|restaurant|cafe|food|bigbasket|blinkit/i, 'Food'],
  [/amazon|flipkart|myntra|shopping|store|mart|mall/i, 'Shopping'],
  [/electricity|water|gas|internet|broadband|mobile|recharge|bill/i, 'Utilities'],
  [/irctc|flight|uber|ola|rapido|travel|hotel|make.*trip/i, 'Travel'],
  [/salary|payroll|credit by employer|neft.*salary/i, 'Salary'],
  [/zerodha|groww|sip|mutual fund|nse|bse|stock|invest/i, 'Investment'],
  [/hospital|pharmacy|medic|apollo|health|doctor|clinic/i, 'Health'],
  [/netflix|spotify|prime|hotstar|youtube|entertainment|movie|pvr/i, 'Entertainment'],
];

function guessCategory(description: string): string {
  for (const [pattern, cat] of CATEGORY_RULES) {
    if (pattern.test(description)) return cat;
  }
  return 'Others';
}

// ─── Date normaliser ──────────────────────────────────────────────────────────
function normaliseDate(raw: string): string | null {
  raw = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD (already standard)
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return raw;

  // MM/DD/YYYY (US format, less common for Indian banks)
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

// ─── CSV text splitter (handles quoted commas) ────────────────────────────────
function splitCsv(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// ─── Column index resolver ────────────────────────────────────────────────────
function findCol(headers: string[], candidates: string[]): number {
  const lh = headers.map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  for (const c of candidates) {
    const idx = lh.indexOf(c.toLowerCase().replace(/[^a-z]/g, ''));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseCsv(csvText: string): CsvParseResult {
  const errors: string[] = [];
  const rows: CsvRow[] = [];

  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV file appears to be empty or has only one line.'], detectedFormat: 'unknown' };
  }

  // Find header row (first row with recognisable keywords)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('date') || lower.includes('narration') || lower.includes('description')) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCsv(lines[headerIdx]);

  // Detect column positions
  const dateCol   = findCol(headers, ['date', 'txndate', 'transactiondate', 'valudate', 'postingdate']);
  const descCol   = findCol(headers, ['narration', 'description', 'particulars', 'remarks', 'details', 'transactionremarks']);
  const debitCol  = findCol(headers, ['debit', 'withdrawalamount', 'withdrawal', 'dramt', 'debitamount']);
  const creditCol = findCol(headers, ['credit', 'depositamount', 'deposit', 'cramt', 'creditamount']);
  const amtCol    = findCol(headers, ['amount', 'transactionamount']);

  // Detect format name
  let detectedFormat = 'Generic CSV';
  if (headers.join('').toLowerCase().includes('narration')) detectedFormat = 'HDFC / ICICI Bank CSV';
  if (headers.join('').toLowerCase().includes('particulars')) detectedFormat = 'SBI / Axis Bank CSV';

  if (dateCol === -1) errors.push('Could not find a Date column. Expected column names: Date, TxnDate, ValueDate.');
  if (descCol === -1) errors.push('Could not find a Description column. Expected: Narration, Description, Particulars.');
  if (debitCol === -1 && creditCol === -1 && amtCol === -1) {
    errors.push('Could not find Amount columns. Expected: Debit, Credit, Amount, or Withdrawal/Deposit Amount.');
  }

  if (dateCol === -1) return { rows, errors, detectedFormat };

  // Parse data rows
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = cols[dateCol] ?? '';
    const date = normaliseDate(rawDate);
    if (!date) { errors.push(`Row ${i + 1}: Could not parse date "${rawDate}"`); continue; }

    const description = (descCol !== -1 ? cols[descCol] : '').trim() || 'Unknown';

    // Determine amount and type
    let amount = 0;
    let type: 'debit' | 'credit' = 'debit';

    if (debitCol !== -1 && creditCol !== -1) {
      const dr = parseFloat((cols[debitCol] ?? '').replace(/[,\s₹$]/g, '')) || 0;
      const cr = parseFloat((cols[creditCol] ?? '').replace(/[,\s₹$]/g, '')) || 0;
      if (cr > 0) { amount = cr; type = 'credit'; }
      else        { amount = dr; type = 'debit'; }
    } else if (amtCol !== -1) {
      const raw = (cols[amtCol] ?? '').replace(/[,\s₹$]/g, '');
      const val = parseFloat(raw);
      if (isNaN(val)) continue;
      if (val < 0) { amount = Math.abs(val); type = 'debit'; }
      else         { amount = val; type = 'credit'; }
    }

    if (amount <= 0) continue;

    rows.push({ date, description, amount, type, category: guessCategory(description) });
  }

  return { rows, errors, detectedFormat };
}

/** Convert parsed CSV rows into Transaction objects ready for DB insertion */
export function csvRowsToTransactions(rows: CsvRow[], fileName: string): Transaction[] {
  return rows.map(r => ({
    id: crypto.randomUUID(),
    date: r.date,
    description: r.description,
    amount: r.amount,
    type: r.type,
    category: r.category,
    source: 'csv' as const,
    pdfName: fileName,
  }));
}
