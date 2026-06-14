/** India Income Tax Calculator — FY 2024-25 */

export interface TaxSlabDetail {
  from: number;
  to: number;
  rate: number;
  tax: number;
}

export interface TaxResult {
  regime: 'new' | 'old';
  grossIncome: number;
  standardDeduction: number;
  section80C: number;
  section80D: number;
  hraExemption: number;
  taxableIncome: number;
  slabs: TaxSlabDetail[];
  baseTax: number;
  surcharge: number;
  cess: number; // 4% health & education cess
  totalTax: number;
  effectiveRate: number;
  takeHome: number;
}

export interface TaxComparison {
  newRegime: TaxResult;
  oldRegime: TaxResult;
  recommended: 'new' | 'old';
  savings: number;
}

// ─── New Regime slabs (FY 2024-25) ───────────────────────────────────────────
function taxNewRegime(taxable: number): { slabs: TaxSlabDetail[]; baseTax: number } {
  const brackets = [
    { from: 0,       to: 300000,  rate: 0   },
    { from: 300000,  to: 700000,  rate: 0.05 },
    { from: 700000,  to: 1000000, rate: 0.10 },
    { from: 1000000, to: 1200000, rate: 0.15 },
    { from: 1200000, to: 1500000, rate: 0.20 },
    { from: 1500000, to: Infinity, rate: 0.30 },
  ];
  return computeSlabs(taxable, brackets);
}

// ─── Old Regime slabs ─────────────────────────────────────────────────────────
function taxOldRegime(taxable: number): { slabs: TaxSlabDetail[]; baseTax: number } {
  const brackets = [
    { from: 0,       to: 250000,  rate: 0    },
    { from: 250000,  to: 500000,  rate: 0.05 },
    { from: 500000,  to: 1000000, rate: 0.20 },
    { from: 1000000, to: Infinity, rate: 0.30 },
  ];
  return computeSlabs(taxable, brackets);
}

function computeSlabs(
  taxable: number,
  brackets: { from: number; to: number; rate: number }[]
): { slabs: TaxSlabDetail[]; baseTax: number } {
  let baseTax = 0;
  const slabs: TaxSlabDetail[] = [];
  for (const b of brackets) {
    if (taxable <= b.from) break;
    const slice = Math.min(taxable, b.to) - b.from;
    const tax = slice * b.rate;
    baseTax += tax;
    slabs.push({ from: b.from, to: Math.min(taxable, b.to), rate: b.rate * 100, tax });
  }
  return { slabs, baseTax };
}

function surcharge(baseTax: number, income: number): number {
  if (income > 50_00_00_000) return baseTax * 0.37;
  if (income > 2_00_00_000)  return baseTax * 0.25;
  if (income > 1_00_00_000)  return baseTax * 0.15;
  if (income > 50_00_000)    return baseTax * 0.10;
  return 0;
}

export interface TaxInputs {
  annualGrossIncome: number;
  section80C: number;   // max 150000
  section80D: number;   // max 25000
  hraExemption: number; // manually entered
}

export function calculateTax(inputs: TaxInputs): TaxComparison {
  const { annualGrossIncome: gross } = inputs;

  // ── New Regime ──────────────────────────────────────────────
  const newSD = 75000;
  const newTaxable = Math.max(0, gross - newSD);
  const { slabs: nSlabs, baseTax: nBase } = taxNewRegime(newTaxable);
  // Rebate u/s 87A: no tax if taxable ≤ 7L under new regime
  const nBaseAfterRebate = newTaxable <= 700000 ? 0 : nBase;
  const nSurcharge = surcharge(nBaseAfterRebate, gross);
  const nCess = (nBaseAfterRebate + nSurcharge) * 0.04;
  const nTotal = nBaseAfterRebate + nSurcharge + nCess;

  const newRegime: TaxResult = {
    regime: 'new',
    grossIncome: gross,
    standardDeduction: newSD,
    section80C: 0,
    section80D: 0,
    hraExemption: 0,
    taxableIncome: newTaxable,
    slabs: nSlabs,
    baseTax: nBaseAfterRebate,
    surcharge: nSurcharge,
    cess: nCess,
    totalTax: nTotal,
    effectiveRate: gross > 0 ? (nTotal / gross) * 100 : 0,
    takeHome: gross - nTotal,
  };

  // ── Old Regime ──────────────────────────────────────────────
  const oldSD = 50000;
  const c80 = Math.min(inputs.section80C, 150000);
  const d80 = Math.min(inputs.section80D, 25000);
  const hra = inputs.hraExemption;
  const oldTaxable = Math.max(0, gross - oldSD - c80 - d80 - hra);
  const { slabs: oSlabs, baseTax: oBase } = taxOldRegime(oldTaxable);
  // Rebate u/s 87A: no tax if taxable ≤ 5L under old regime
  const oBaseAfterRebate = oldTaxable <= 500000 ? 0 : oBase;
  const oSurcharge = surcharge(oBaseAfterRebate, gross);
  const oCess = (oBaseAfterRebate + oSurcharge) * 0.04;
  const oTotal = oBaseAfterRebate + oSurcharge + oCess;

  const oldRegime: TaxResult = {
    regime: 'old',
    grossIncome: gross,
    standardDeduction: oldSD,
    section80C: c80,
    section80D: d80,
    hraExemption: hra,
    taxableIncome: oldTaxable,
    slabs: oSlabs,
    baseTax: oBaseAfterRebate,
    surcharge: oSurcharge,
    cess: oCess,
    totalTax: oTotal,
    effectiveRate: gross > 0 ? (oTotal / gross) * 100 : 0,
    takeHome: gross - oTotal,
  };

  const recommended = nTotal <= oTotal ? 'new' : 'old';
  const savings = Math.abs(nTotal - oTotal);

  return { newRegime, oldRegime, recommended, savings };
}
