import type { Transaction, SalarySlip } from '../db/database';

/**
 * Detects whether a Gemini API error should trigger a fallback to another provider.
 * Returns true for quota, rate-limit, billing, and model-not-found errors.
 */
export function isGeminiFallbackError(error: any): boolean {
  const message: string = error?.message || '';
  return (
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('rate') ||
    message.includes('billing') ||
    message.includes('exceeded') ||
    message.includes('is not found for API version') ||
    message.includes('limit')
  );
}

// Max characters per chunk sent to Gemini. Keeps well within token limits.
const CHUNK_SIZE = 6000;
const BATCH_CHAR_LIMIT = 5000; // Combine pages up to this char total per API call

function splitIntoChunks(text: string): string[] {
  const pages = text.split(/---\s*Page\s*\d+\s*---/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentBatch = '';

  for (const page of pages) {
    if (page.length > CHUNK_SIZE) {
      // Oversized page: flush current batch first, then split the page itself
      if (currentBatch) { chunks.push(currentBatch.trim()); currentBatch = ''; }
      for (let i = 0; i < page.length; i += CHUNK_SIZE) {
        chunks.push(page.slice(i, i + CHUNK_SIZE));
      }
    } else if (currentBatch.length + page.length > BATCH_CHAR_LIMIT) {
      // Adding this page would exceed batch limit: flush and start new batch
      if (currentBatch) chunks.push(currentBatch.trim());
      currentBatch = page;
    } else {
      // Safe to add page to current batch
      currentBatch += (currentBatch ? '\n\n' : '') + page;
    }
  }
  if (currentBatch) chunks.push(currentBatch.trim());
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Calls Gemini once for a single chunk of statement text.
 */
export async function parseChunkWithGemini(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  apiKey: string,
  modelName: string = 'gemini-2.5-flash'
): Promise<any[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert financial data extraction system. Extract EVERY SINGLE transaction from this portion of a bank/credit card statement (chunk ${chunkIndex + 1} of ${totalChunks}). Do NOT skip any — missing even one is a critical failure.

RULES:
1. Extract ALL transactions: fees, interest charges, EMI payments, cashback credits, refunds, balance transfers, annual charges — everything.
2. For each transaction:
   - date: format as YYYY-MM-DD. If year is missing, infer from context. Use best guess.
   - description: Use the raw vendor/merchant name. Keep it human-readable but preserve merchant name. Do not truncate.
   - amount: Extract as a positive number.
   - type: "debit" if money spent/withdrawn/charged. "credit" if money received/refunded/cashback.
   - category: Assign the BEST matching category. NEVER leave empty:
       * "Food"          — restaurants, food delivery, groceries, Swiggy, Zomato, BigBasket, Blinkit, cafes
       * "Shopping"      — retail, e-commerce, Amazon, Flipkart, Myntra, clothing, electronics
       * "Utilities"     — electricity, water, gas, internet, mobile recharge, DTH, broadband, BESCOM, Jio, Airtel
       * "Travel"        — flights, trains, taxis, Uber, Ola, Rapido, Metro, Redbus, hotel, fuel, petrol
       * "Salary"        — salary credits, employer payments
       * "Investment"    — mutual funds, stocks, SIP, Zerodha, Groww, insurance premium, ELSS, FD
       * "Health"        — pharmacy, hospital, doctor, clinic, Practo, Apollo, medical
       * "Entertainment" — Netflix, Hotstar, Spotify, gaming, movies, concerts, OTT platforms, Amazon Prime
       * "Others"        — bank charges, ATM fees, interest, transfers, unknown merchants
   - notes: Reference numbers, UTR, or additional context.
3. If category unclear, use "Others". NEVER omit a transaction because category is unclear.
4. Opening/closing balance lines and minimum payment lines are NOT transactions — skip those.
5. Return ONLY valid JSON. No markdown. No explanation.

Statement Text (chunk ${chunkIndex + 1} of ${totalChunks}):
${chunk}
`;

  const schema = {
    type: 'OBJECT',
    properties: {
      transactions: {
        type: 'ARRAY',
        description: 'ALL transactions found in this text chunk',
        items: {
          type: 'OBJECT',
          properties: {
            date:        { type: 'STRING', description: 'YYYY-MM-DD' },
            description: { type: 'STRING', description: 'Vendor/merchant name, human-readable' },
            amount:      { type: 'NUMBER', description: 'Positive numeric amount' },
            type:        { type: 'STRING', enum: ['debit', 'credit'] },
            category:    { type: 'STRING', enum: ['Food', 'Shopping', 'Utilities', 'Travel', 'Salary', 'Investment', 'Health', 'Entertainment', 'Others'] },
            notes:       { type: 'STRING', description: 'Reference numbers or extra details' }
          },
          required: ['date', 'description', 'amount', 'type', 'category']
        }
      }
    },
    required: ['transactions']
  };

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || 'API request failed';
    throw new Error(`Gemini API Error: ${message}`);
  }

  const data = await response.json();
  const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resultText) return [];

  const parsedData = JSON.parse(resultText);
  return parsedData.transactions || [];
}

/**
 * Deduplicates transactions that appear identical across chunks
 * (same date + description + amount + type).
 */
function deduplicateTransactions(txs: any[]): any[] {
  const seen = new Set<string>();
  return txs.filter(tx => {
    const key = `${tx.date}|${tx.description}|${tx.amount}|${tx.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Calls the Gemini API to parse bank/credit-card statement text into transactions.
 * Splits large statements into chunks to avoid output token limits causing silent truncation.
 */
export async function parseBankStatementWithGemini(
  text: string,
  apiKey: string
): Promise<Transaction[]> {
  const chunks = splitIntoChunks(text);
  const allRawTxs: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkTxs = await parseChunkWithGemini(chunks[i], i, chunks.length, apiKey);
    allRawTxs.push(...chunkTxs);
  }

  const deduplicated = deduplicateTransactions(allRawTxs);

  return deduplicated.map((tx: any) => ({
    ...tx,
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    source: 'bank_statement' as const,
    category: tx.category || 'Others',
  }));
}

/**
 * Calls the Gemini API to parse salary slip text into structured salary components.
 */
export async function parseSalarySlipWithGemini(
  text: string,
  apiKey: string,
  modelName: string = 'gemini-2.5-flash'
): Promise<SalarySlip> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert financial analyzer. Parse the following salary slip text and extract the salary components.
Identify the month and year. Break down the earnings and deductions.
If a component is not explicitly found, set its value to 0.

Salary Slip Text:
${text}
`;

  const schema = {
    type: 'OBJECT',
    properties: {
      month:           { type: 'INTEGER', description: 'Month (1-12)' },
      year:            { type: 'INTEGER', description: 'Year e.g. 2026' },
      basicPay:        { type: 'NUMBER',  description: 'Basic salary' },
      hra:             { type: 'NUMBER',  description: 'House Rent Allowance' },
      allowances:      { type: 'NUMBER',  description: 'Other allowances total' },
      providentFund:   { type: 'NUMBER',  description: 'PF/EPF deduction' },
      taxDeducted:     { type: 'NUMBER',  description: 'TDS / Income Tax' },
      otherDeductions: { type: 'NUMBER',  description: 'Other deductions total' },
      grossPay:        { type: 'NUMBER',  description: 'Gross earnings' },
      netPay:          { type: 'NUMBER',  description: 'Net take-home salary' },
      earningsBreakdown: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Name of the earning component (e.g. Basic, HRA, LTA, Bonus)' },
            amount: { type: 'NUMBER', description: 'Amount for this component' }
          },
          required: ['name', 'amount']
        },
        description: 'Itemized list of all earning/allowance components found on the salary slip'
      },
      deductionsBreakdown: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Name of the deduction component (e.g. EPF, ESPP, TDS, Tax)' },
            amount: { type: 'NUMBER', description: 'Amount for this component' }
          },
          required: ['name', 'amount']
        },
        description: 'Itemized list of all deduction components found on the salary slip'
      }
    },
    required: ['month', 'year', 'basicPay', 'hra', 'allowances', 'providentFund', 'taxDeducted', 'otherDeductions', 'grossPay', 'netPay', 'earningsBreakdown', 'deductionsBreakdown']
  };

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || 'API request failed';
    throw new Error(`Gemini API Error: ${message}`);
  }

  const data = await response.json();
  const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!resultText) {
    throw new Error('Empty response received from Gemini.');
  }

  const parsed = JSON.parse(resultText) as SalarySlip;
  return {
    ...parsed,
    id: `slip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  };
}
