import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = './PDF1.pdf';
const apiKey = process.argv[2];

if (!apiKey) {
  console.error('\n❌ [API KEY REQUIRED] Please provide your Gemini API key:');
  console.error('  node test_gemini.js <your_gemini_api_key>\n');
  process.exit(1);
}

// Polyfill ReadableStream async iterator
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

async function extractText() {
  console.log(`1. Extracting text from ${pdfPath}...`);
  const fileBuffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(fileBuffer);
  const pdf = await pdfjs.getDocument({ data }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let lastY = -1;
    let pageText = '';
    
    for (const item of textContent.items) {
      if ('str' in item) {
        const str = item.str;
        const transform = item.transform;
        const currentY = transform ? transform[5] : -1;
        
        if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
          pageText += '\n';
        }
        pageText += str + ' ';
        lastY = currentY;
      }
    }
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  return fullText.trim();
}

async function callGemini(text) {
  console.log('2. Sending text to Gemini API for parsing...');
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

  return JSON.parse(resultText);
}

async function run() {
  try {
    const text = await extractText();
    console.log(`Text extracted successfully (${text.length} characters).`);
    
    const parsed = await callGemini(text);
    console.log('\n=================== PARSED TRANSACTIONS ===================');
    console.log(JSON.stringify(parsed, null, 2));
    console.log('===========================================================');
    console.log(`\nSuccess! Parsed ${parsed.transactions?.length || 0} transactions.`);
  } catch (error) {
    console.error('\n❌ Error occurred:', error.message || error);
  }
}

run();
