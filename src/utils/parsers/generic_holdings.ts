import type { Investment } from '../../db/database';
import * as XLSX from 'xlsx';

/**
 * Fallback Excel parser for general statement formats.
 */
export function parseGenericHoldings(workbook: XLSX.WorkBook): Investment[] {
  const investments: Investment[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const tempRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
    if (tempRows.length < 2) continue;

    let symbolIdx = -1;
    let qtyIdx = -1;
    let avgIdx = -1;
    let ltpIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(tempRows.length, 40); r++) {
      const row = tempRows[r];
      if (!row || !Array.isArray(row)) continue;

      const candidateHeaders = row.map(h => String(h || '').toLowerCase().trim());
      const sym = candidateHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument') || h.includes('ticker') || h.includes('stock') || h === 'isin');
      const qty = candidateHeaders.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('holding') || h.includes('volume'));
      const avg = candidateHeaders.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy price') || h.includes('rate'));
      const ltp = candidateHeaders.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price'));

      if (sym !== -1 && qty !== -1 && avg !== -1) {
        symbolIdx = sym;
        qtyIdx = qty;
        avgIdx = avg;
        ltpIdx = ltp;
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx !== -1) {
      for (let i = headerRowIdx + 1; i < tempRows.length; i++) {
        const row = tempRows[i];
        if (!row || row.length === 0) continue;

        const sym = String(row[symbolIdx] || '').replace(/"/g, '').trim().toUpperCase();
        if (!sym || sym === 'SUMMARY' || sym === 'TOTAL') continue;

        const qty = parseFloat(String(row[qtyIdx] || '').replace(/[,\s₹$]/g, '').trim());
        const avg = parseFloat(String(row[avgIdx] || '').replace(/[,\s₹$]/g, '').trim());
        if (isNaN(qty) || isNaN(avg)) continue;

        const ltpVal = ltpIdx !== -1 ? String(row[ltpIdx] || '').replace(/[,\s₹$]/g, '').trim() : '';
        const ltp = ltpVal ? parseFloat(ltpVal) : undefined;

        investments.push({
          id: sym,
          symbol: sym,
          quantity: qty,
          avgCost: avg,
          currentPrice: ltp !== undefined && !isNaN(ltp) ? ltp : avg,
          lastUpdated: new Date().toISOString(),
          type: 'equity'
        });
      }
      break; 
    }
  }

  return investments;
}

/**
 * Fallback CSV parser for general statement formats.
 */
export function parseGenericCsv(csvText: string): Investment[] {
  const investments: Investment[] = [];
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  let symbolIdx = -1;
  let qtyIdx = -1;
  let avgIdx = -1;
  let ltpIdx = -1;
  let headerRowIdx = -1;

  for (let r = 0; r < Math.min(lines.length, 40); r++) {
    const line = lines[r];
    const candidateHeaders = line.toLowerCase().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.replace(/"/g, '').trim());
    const sym = candidateHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument') || h.includes('ticker') || h.includes('stock') || h === 'isin');
    const qty = candidateHeaders.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('holding') || h.includes('volume'));
    const avg = candidateHeaders.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy price') || h.includes('rate'));
    const ltp = candidateHeaders.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price'));

    if (sym !== -1 && qty !== -1 && avg !== -1) {
      symbolIdx = sym;
      qtyIdx = qty;
      avgIdx = avg;
      ltpIdx = ltp;
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx !== -1) {
    for (let i = headerRowIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      const sym = cols[symbolIdx]?.replace(/"/g, '').trim().toUpperCase();
      if (!sym || sym === 'SUMMARY' || sym === 'TOTAL') continue;

      const qty = parseFloat(cols[qtyIdx]?.replace(/[,\s₹$]/g, '').trim());
      const avg = parseFloat(cols[avgIdx]?.replace(/[,\s₹$]/g, '').trim());
      if (isNaN(qty) || isNaN(avg)) continue;

      const ltpVal = ltpIdx !== -1 ? cols[ltpIdx]?.replace(/[,\s₹$]/g, '').trim() : '';
      const ltp = ltpVal ? parseFloat(ltpVal) : undefined;

      investments.push({
        id: sym,
        symbol: sym,
        quantity: qty,
        avgCost: avg,
        currentPrice: ltp !== undefined && !isNaN(ltp) ? ltp : avg,
        lastUpdated: new Date().toISOString(),
        type: 'equity'
      });
    }
  }

  return investments;
}
