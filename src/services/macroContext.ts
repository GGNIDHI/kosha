import { getSetting, setSetting } from '../db/database';

export interface IndianMacroContext {
  cpiInflation: string;
  repoRate: string;
  section80CLimit: string;
  nps80CCDLimit: string;
  standardDeductionNewRegime: string;
  basicExemptionNewRegime: string;
  fetchedAt: string;
  sources: string;
}

export const MACRO_DEFINITIONS = {
  cpiInflation: "Consumer Price Index measures the average rate of retail inflation and cost of living changes.",
  repoRate: "The RBI benchmark lending rate, which directly influences loan EMIs and fixed deposit rates.",
  section80CLimit: "Tax deduction limit for investments in PPF, ELSS mutual funds, EPF, and school fees.",
  nps80CCDLimit: "Additional deduction exclusive to voluntary National Pension System (NPS) contributions.",
  standardDeductionNewRegime: "Flat deduction reducing salaried taxable income under the New Tax Regime.",
  basicExemptionNewRegime: "Income limit below which you are completely exempt from tax under the New Tax Regime."
};

const MACRO_CACHE_KEY = 'kosha_macro_context';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — macro data doesn't change daily

const currentMonthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

export const DEFAULT_MACRO_CONTEXT: IndianMacroContext = {
  cpiInflation: `4.8% (${currentMonthYear} - approximate)`,
  repoRate: `6.50% (${currentMonthYear} - approximate)`,
  section80CLimit: '₹1.5 Lakhs',
  nps80CCDLimit: '₹50,000',
  standardDeductionNewRegime: '₹75,000 (new regime)',
  basicExemptionNewRegime: '₹3 Lakhs (new regime)',
  fetchedAt: new Date().toISOString(),
  sources: 'Static Defaults (Approximate — verify before acting)'
};

// Robust helper to extract a value checking multiple key variations
function extractKey(obj: any, keys: string[], defaultValue: string): string {
  if (!obj || typeof obj !== 'object') return defaultValue;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]);
    }
    // Case-insensitive check
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
      return String(obj[foundKey]);
    }
  }
  return defaultValue;
}

export async function fetchLatestMacroContext(
  geminiApiKey: string,
  forceRefresh?: boolean
): Promise<IndianMacroContext> {
  // Return cached version if fresh enough (skip if forcing refresh)
  if (!forceRefresh) {
    const cached = localStorage.getItem(MACRO_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const age = Date.now() - new Date(parsed.fetchedAt).getTime();
        if (age < CACHE_TTL_MS) {
          console.log('[Kosha] Using cached macro context from', parsed.fetchedAt);
          return parsed;
        }
      } catch (e) {
        console.warn('[Kosha] Failed to parse cached macro context, refetching...');
      }
    }
  }

  const prompt = `
Search for the latest, current Indian macroeconomic data (for personal tax and financial planning) as of today:
1. Current CPI inflation rate in India (must include the specific month and year of the rate, e.g. '4.8% (May 2026)')
2. Current RBI Repo Rate (must include the specific month and year or date of last update, e.g. '6.50% (as of June 2026)')
3. Section 80C deduction limit (usually ₹1.5 Lakhs)
4. NPS 80CCD(1B) additional limit (usually ₹50,000)
5. Standard deduction limit under the New Tax Regime (usually ₹75,000)
6. Basic exemption limit under the New Tax Regime (usually ₹3 Lakhs)

Return the results as a single valid JSON object matching the following TypeScript interface structure. Do not include markdown wraps or code block formatting, just the raw JSON:

{
  "cpiInflation": "string (must include month and year, e.g. '4.8% (May 2026)')",
  "repoRate": "string (must include month and year, e.g. '6.50% (June 2026)')",
  "section80CLimit": "string (e.g. '₹1.5 Lakhs')",
  "nps80CCDLimit": "string (e.g. '₹50,000')",
  "standardDeductionNewRegime": "string (e.g. '₹75,000')",
  "basicExemptionNewRegime": "string (e.g. '₹3 Lakhs')",
  "sources": "string (comma-separated short list of sources consulted, e.g. RBI, MoSPI, Income Tax Dept)"
}
`.trim();

  // Helper to query Gemini models
  const runWithGemini = async (modelName: string): Promise<IndianMacroContext> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.1 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const resultText = parts.map((p: any) => p.text || '').join('');
    if (!resultText) throw new Error(`Empty response from ${modelName}`);

    const match = resultText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Invalid JSON from ${modelName}`);
    const parsed = JSON.parse(match[0]);

    return {
      cpiInflation: extractKey(parsed, ['cpiInflation', 'cpi_inflation', 'cpiInflationRate', 'cpi'], DEFAULT_MACRO_CONTEXT.cpiInflation),
      repoRate: extractKey(parsed, ['repoRate', 'repo_rate', 'reporate'], DEFAULT_MACRO_CONTEXT.repoRate),
      section80CLimit: extractKey(parsed, ['section80CLimit', 'section_80c_limit', 'section80cLimit', '80cLimit', '80c'], DEFAULT_MACRO_CONTEXT.section80CLimit),
      nps80CCDLimit: extractKey(parsed, ['nps80CCDLimit', 'nps_80ccd_limit', 'nps80ccdLimit', 'npsLimit', 'nps'], DEFAULT_MACRO_CONTEXT.nps80CCDLimit),
      standardDeductionNewRegime: extractKey(parsed, ['standardDeductionNewRegime', 'standard_deduction_new_regime', 'standardDeduction', 'stdDeduction'], DEFAULT_MACRO_CONTEXT.standardDeductionNewRegime),
      basicExemptionNewRegime: extractKey(parsed, ['basicExemptionNewRegime', 'basic_exemption_new_regime', 'basicExemption', 'basicExemptLimit'], DEFAULT_MACRO_CONTEXT.basicExemptionNewRegime),
      fetchedAt: new Date().toISOString(),
      sources: extractKey(parsed, ['sources', 'source'], `${modelName} Search`)
    };
  };

  // Run cascade strictly through Gemini models (no Groq)
  if (geminiApiKey) {
    const models = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro'
    ];
    for (const model of models) {
      try {
        console.log(`[Kosha] Trying to fetch macro context via ${model} Search...`);
        const result = await runWithGemini(model);
        localStorage.setItem(MACRO_CACHE_KEY, JSON.stringify(result));

        // Save to Dexie IndexedDB settings with timeline history
        try {
          await setSetting('latestMacroContext', result);
          const history = await getSetting<IndianMacroContext[]>('macroContextHistory', []);
          if (!history.some(h => h.fetchedAt === result.fetchedAt)) {
            const updatedHistory = [...history, result].slice(-100);
            await setSetting('macroContextHistory', updatedHistory);
            console.log('[Kosha] Saved macro context fetch history to database.');
          }
        } catch (dbErr) {
          console.warn('[Kosha] Failed to save macro context to database:', dbErr);
        }

        return result;
      } catch (err: any) {
        console.warn(`[Kosha] ${model} search failed:`, err.message || err);
      }
    }
  }

  console.log('[Kosha] All Gemini search options failed or no key provided. Using static default macro context.');
  const finalDefaults = {
    ...DEFAULT_MACRO_CONTEXT,
    fetchedAt: new Date().toISOString()
  };

  // Save fallback defaults to Dexie too
  try {
    await setSetting('latestMacroContext', finalDefaults);
    const history = await getSetting<IndianMacroContext[]>('macroContextHistory', []);
    if (!history.some(h => h.fetchedAt === finalDefaults.fetchedAt)) {
      const updatedHistory = [...history, finalDefaults].slice(-100);
      await setSetting('macroContextHistory', updatedHistory);
    }
  } catch (dbErr) {
    console.warn('[Kosha] Failed to save fallback defaults to database:', dbErr);
  }

  return finalDefaults;
}
