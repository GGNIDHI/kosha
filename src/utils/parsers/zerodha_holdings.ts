import type { Investment } from '../../db/database';
import * as XLSX from 'xlsx';

/**
 * Parses a Zerodha holdings statement (multi-sheet workbook).
 * Looks for "Equity" and "Mutual Funds" sheets specifically.
 */
export function parseZerodhaHoldings(workbook: XLSX.WorkBook): Investment[] {
  const investments: Investment[] = [];

  // 1. Process Equity Sheet
  const equitySheetName = workbook.SheetNames.find(name => name.toLowerCase().trim() === 'equity');
  if (equitySheetName) {
    const sheet = workbook.Sheets[equitySheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    parseSheet(rows, 'equity', investments);
  }

  // 2. Process Mutual Funds Sheet
  const mfSheetName = workbook.SheetNames.find(name => name.toLowerCase().trim() === 'mutual funds');
  if (mfSheetName) {
    const sheet = workbook.Sheets[mfSheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    parseSheet(rows, 'mutual_fund', investments);
  }

  // Fallback: If neither sheet was found/parsed, but there's a single sheet (e.g. CSV upload), parse that sheet
  if (investments.length === 0 && workbook.SheetNames.length === 1) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    // Try to parse it as equity
    parseSheet(rows, 'equity', investments);
  }

  return investments;
}

function parseSheet(rows: any[][], type: 'equity' | 'mutual_fund', output: Investment[]) {
  if (rows.length < 2) return;

  let symbolIdx = -1;
  let qtyIdx = -1;
  let avgIdx = -1;
  let ltpIdx = -1;
  let isinIdx = -1;
  let sectorIdx = -1;
  let headerRowIdx = -1;

  // Scan the first 40 rows for candidate headers
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    const candidateHeaders = row.map(h => String(h || '').toLowerCase().trim());
    
    const sym = candidateHeaders.findIndex(h => h === 'symbol' || h === 'instrument' || h.includes('ticker') || h.includes('stock'));
    const qty = candidateHeaders.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('volume') || h === 'units');
    const avg = candidateHeaders.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy price') || h.includes('rate'));
    const ltp = candidateHeaders.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price') || h.includes('closing price') || h.includes('nav'));
    const isin = candidateHeaders.findIndex(h => h === 'isin');
    const sector = candidateHeaders.findIndex(h => h === 'sector');

    // Zerodha specific match condition: symbol/instrument, quantity and average price/cost must exist
    if (sym !== -1 && qty !== -1 && avg !== -1) {
      symbolIdx = sym;
      qtyIdx = qty;
      avgIdx = avg;
      ltpIdx = ltp;
      isinIdx = isin;
      sectorIdx = sector;
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.warn(`Could not find header row for type: ${type}`);
    return;
  }

  // Parse data rows below the header
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawSym = row[symbolIdx];
    const sym = String(rawSym || '').replace(/"/g, '').trim().toUpperCase();
    if (!sym || sym === 'SUMMARY' || sym === 'TOTAL') continue;

    const qty = parseFloat(String(row[qtyIdx] || '').replace(/[,\s₹$]/g, '').trim());
    const avg = parseFloat(String(row[avgIdx] || '').replace(/[,\s₹$]/g, '').trim());
    
    if (isNaN(qty) || isNaN(avg) || qty <= 0) continue;

    const rawLtp = ltpIdx !== -1 ? row[ltpIdx] : undefined;
    const ltpVal = rawLtp !== undefined ? parseFloat(String(rawLtp).replace(/[,\s₹$]/g, '').trim()) : NaN;
    const currentPrice = !isNaN(ltpVal) ? ltpVal : avg;

    const isin = isinIdx !== -1 && row[isinIdx] ? String(row[isinIdx]).trim() : undefined;
    const sector = sectorIdx !== -1 && row[sectorIdx] ? String(row[sectorIdx]).trim() : undefined;

    output.push({
      id: sym,
      symbol: sym,
      quantity: qty,
      avgCost: avg,
      currentPrice: currentPrice,
      lastUpdated: new Date().toISOString(),
      type: type,
      isin: isin,
      sector: sector
    });
  }
}
