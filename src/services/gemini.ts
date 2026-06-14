import type { Transaction, SalarySlip } from '../db/database';

/**
 * Calls the Gemini API to parse bank statement text into a structured list of transactions.
 */
export async function parseBankStatementWithGemini(
  text: string,
  apiKey: string
): Promise<Transaction[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert financial analyzer. Parse the following bank statement text and extract all transactions.
For each transaction:
1. Parse the date and format it as YYYY-MM-DD.
2. Standardize the description to be human-readable, clean, and concise (e.g. remove long reference numbers, keep merchant name).
3. Extract the amount as a positive number.
4. Determine the type as 'debit' (money spent/withdrawn) or 'credit' (money received/deposited).
5. Categorize the transaction into one of: 'Food', 'Shopping', 'Utilities', 'Travel', 'Salary', 'Investment', 'Health', 'Entertainment', 'Others'.

Here is the bank statement text:
${text}
`;

  // JSON Schema for structured output
  const schema = {
    type: 'OBJECT',
    properties: {
      transactions: {
        type: 'ARRAY',
        description: 'The list of parsed transactions from the statement',
        items: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'Transaction date in YYYY-MM-DD format' },
            description: { type: 'STRING', description: 'Clean, simplified description or merchant name' },
            amount: { type: 'NUMBER', description: 'Positive numeric amount' },
            type: { type: 'STRING', enum: ['debit', 'credit'], description: 'Whether it is a withdrawal (debit) or deposit (credit)' },
            category: { 
              type: 'STRING', 
              enum: ['Food', 'Shopping', 'Utilities', 'Travel', 'Salary', 'Investment', 'Health', 'Entertainment', 'Others'], 
              description: 'Best matching category' 
            },
            notes: { type: 'STRING', description: 'Any extra details, reference numbers or clean notes' }
          },
          required: ['date', 'description', 'amount', 'type', 'category']
        }
      }
    },
    required: ['transactions']
  };

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
    return parsedData.transactions.map((tx: any) => ({
      ...tx,
      source: 'bank_statement'
    }));
  } catch (error) {
    console.error('Gemini Bank Statement Parsing Error:', error);
    throw error;
  }
}

/**
 * Calls the Gemini API to parse salary slip text into structured salary components.
 */
export async function parseSalarySlipWithGemini(
  text: string,
  apiKey: string
): Promise<SalarySlip> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert financial analyzer. Parse the following salary slip text and extract the salary components.
Identify the month and year. Break down the earnings and deductions.
If a component is not explicitly found, set its value to 0.

Salary Slip Text:
${text}
`;

  // JSON Schema for structured output
  const schema = {
    type: 'OBJECT',
    properties: {
      month: { type: 'INTEGER', description: 'Month of salary slip (1 for January, 12 for December)' },
      year: { type: 'INTEGER', description: 'Year of salary slip (e.g. 2026)' },
      basicPay: { type: 'NUMBER', description: 'Basic salary component' },
      hra: { type: 'NUMBER', description: 'House Rent Allowance (HRA)' },
      allowances: { type: 'NUMBER', description: 'Sum of all other earnings/allowances (LTA, Special Allowance, Medical, etc.)' },
      providentFund: { type: 'NUMBER', description: 'Provident Fund (PF/EPF) deduction' },
      taxDeducted: { type: 'NUMBER', description: 'TDS, Income Tax, or withholding tax deducted' },
      otherDeductions: { type: 'NUMBER', description: 'Sum of other deductions (Professional Tax, Insurance, Gratuity, etc.)' },
      grossPay: { type: 'NUMBER', description: 'Total Earnings before deductions' },
      netPay: { type: 'NUMBER', description: 'Net salary credited, net take-home salary' }
    },
    required: ['month', 'year', 'basicPay', 'hra', 'allowances', 'providentFund', 'taxDeducted', 'otherDeductions', 'grossPay', 'netPay']
  };

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

    return JSON.parse(resultText) as SalarySlip;
  } catch (error) {
    console.error('Gemini Salary Slip Parsing Error:', error);
    throw error;
  }
}
