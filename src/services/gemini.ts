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

/**
 * Calls the Gemini API to parse bank/credit-card statement text into transactions.
 * Every transaction is guaranteed to be returned — unknowns land in "Others" with vendor name preserved.
 */
export async function parseBankStatementWithGemini(
  text: string,
  apiKey: string
): Promise<Transaction[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert financial data extraction system. Your job is to extract EVERY SINGLE transaction from the provided bank or credit card statement text. Do NOT skip any transaction — missing even one is a critical failure.

RULES:
1. Extract ALL transactions without exception, including fees, interest charges, EMI payments, cashback credits, refunds, balance transfers, annual charges — everything.
2. For each transaction:
   - date: format as YYYY-MM-DD. If the year is missing, infer it from context (statement period). Use best guess.
   - description: Use the raw vendor/merchant name from the statement (e.g. "ZOMATO*ORDER9812", "AMAZON MARKETPLACE", "SWIGGY INSTAMART"). Keep it human-readable but preserve the merchant name. Do not truncate.
   - amount: Extract as a positive number.
   - type: "debit" if money was spent/withdrawn/charged. "credit" if money was received/refunded/cashback.
   - category: Assign the BEST matching category from this list. NEVER leave it empty:
       * "Food"          — restaurants, food delivery, groceries, Swiggy, Zomato, BigBasket, Blinkit, cafes
       * "Shopping"      — retail, e-commerce, Amazon, Flipkart, Myntra, clothing, electronics
       * "Utilities"     — electricity, water, gas, internet, mobile recharge, DTH, broadband, BESCOM, BSNL, Jio, Airtel
       * "Travel"        — flights, trains, taxis, Uber, Ola, Rapido, Metro, Redbus, hotel, fuel, petrol
       * "Salary"        — salary credits, employer payments
       * "Investment"    — mutual funds, stocks, SIP, Zerodha, Groww, insurance premium, ELSS, FD
       * "Health"        — pharmacy, hospital, doctor, clinic, Practo, Apollo, medical
       * "Entertainment" — Netflix, Hotstar, Spotify, gaming, movies, concerts, OTT platforms, Amazon Prime
       * "Others"        — anything that does not fit above (bank charges, ATM fees, interest, transfers, unknown merchants)
   - notes: Put any reference numbers, UTR, or additional context here.

3. If you cannot determine the category, use "Others". NEVER omit a transaction just because the category is unclear.
4. For credit card statements: opening balance, closing balance, minimum payment lines are NOT transactions — skip those. But all actual charges and credits are transactions.
5. Return ONLY valid JSON matching the schema. No explanations, no markdown fences.

Bank/Credit Card Statement Text:
${text}
`;

  const schema = {
    type: 'OBJECT',
    properties: {
      transactions: {
        type: 'ARRAY',
        description: 'ALL transactions from the statement — must not be empty if there are any charges/credits',
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

  if (!resultText) {
    throw new Error('Empty response received from Gemini.');
  }

  const parsedData = JSON.parse(resultText);
  return (parsedData.transactions || []).map((tx: any) => ({
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
  apiKey: string
): Promise<SalarySlip> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
      netPay:          { type: 'NUMBER',  description: 'Net take-home salary' }
    },
    required: ['month', 'year', 'basicPay', 'hra', 'allowances', 'providentFund', 'taxDeducted', 'otherDeductions', 'grossPay', 'netPay']
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
