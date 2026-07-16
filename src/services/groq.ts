import type { Transaction, SalarySlip } from '../db/database';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Calls the Groq API to parse bank statement text into a structured list of transactions.
 * Used as an automatic fallback when Gemini is unavailable (quota, rate-limit, billing).
 */
export async function parseBankStatementWithGroq(
  text: string,
  apiKey: string,
  modelName: string = 'llama-3.1-8b-instant'
): Promise<Transaction[]> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a financial document parser. Always respond with valid JSON in this exact shape:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "clean merchant name",
      "amount": 123.45,
      "type": "debit or credit",
      "category": "Food|Shopping|Utilities|Travel|Salary|Investment|Health|Entertainment|Others",
      "notes": "optional extra detail"
    }
  ]
}
Rules:
- date must be YYYY-MM-DD format
- amount must be a positive number
- type must be exactly "debit" or "credit"
- category must be one of the options listed above
- description should be a clean merchant/payee name, not a raw reference number`
        },
        {
          role: 'user',
          content: `Extract all transactions from this bank statement:\n\n${text}`
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq API Error: ${err?.error?.message || 'API request failed'}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  return parsed.transactions.map((tx: any) => ({
    ...tx,
    id: `tx-${crypto.randomUUID()}`,
    source: 'bank_statement' as const
  }));
}

/**
 * Calls the Groq API to parse salary slip text into structured salary components.
 * Used as an automatic fallback when Gemini is unavailable.
 */
export async function parseSalarySlipWithGroq(
  text: string,
  apiKey: string,
  modelName: string = 'llama-3.3-70b-versatile'
): Promise<SalarySlip> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a financial document parser. Always respond with valid JSON in this exact shape:
{
  "month": 3,
  "year": 2026,
  "basicPay": 50000,
  "hra": 20000,
  "allowances": 10000,
  "providentFund": 6000,
  "taxDeducted": 5000,
  "otherDeductions": 2000,
  "grossPay": 80000,
  "netPay": 67000,
  "earningsBreakdown": [
    { "name": "Basic Pay", "amount": 50000 },
    { "name": "HRA", "amount": 20000 },
    { "name": "LTA", "amount": 10000 }
  ],
  "deductionsBreakdown": [
    { "name": "Provident Fund", "amount": 6000 },
    { "name": "TDS", "amount": 5000 },
    { "name": "ESPP", "amount": 2000 }
  ]
}
Rules:
- month is a number 1-12
- year is a 4-digit number
- All monetary fields are positive numbers (use 0 if not found)
- netPay is the final take-home amount credited to the employee
- earningsBreakdown is an array listing all itemized earning components (e.g. Basic, HRA, LTA, Allowances, etc.) with their amounts
- deductionsBreakdown is an array listing all itemized deduction components (e.g. EPF, ESPP, TDS, Professional Tax, etc.) with their amounts`
        },
        {
          role: 'user',
          content: `Extract the salary components from this salary slip:\n\n${text}`
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq API Error: ${err?.error?.message || 'API request failed'}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content) as SalarySlip;

  return {
    ...parsed,
    id: `slip-${crypto.randomUUID()}`
  };
}

/**
 * Calls the Groq API to generate financial insights based on system and user prompts.
 * Used as an automatic fallback when Gemini is unavailable.
 */
export async function generateInsightsWithGroq(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq API Error: ${err?.error?.message || 'API request failed'}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

