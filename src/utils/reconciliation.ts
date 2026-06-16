import type { Transaction, SalarySlip, ReconDecision } from '../db/database';

export interface ReconciledPair {
  id: string; // `${transactionId}_${salarySlipId}`
  transaction: Transaction;
  salarySlip: SalarySlip;
  reason: string;
  status: 'accepted' | 'rejected';
  hasDecision: boolean;
}

/**
 * Runs the reconciliation engine to detect bank transactions matching salary slips.
 * Returns an array of matched pairs.
 * O(N + M) implementation for lightning-fast lookups.
 */
export function getReconciledPairs(
  transactions: Transaction[],
  salarySlips: SalarySlip[],
  decisions: ReconDecision[]
): ReconciledPair[] {
  // 1. Build a lookup of salary slips by year-month
  // Key format: YYYY-MM
  const slipMap = new Map<string, SalarySlip>();
  for (const slip of salarySlips) {
    if (!slip.id) continue;
    const key = `${slip.year}-${String(slip.month).padStart(2, '0')}`;
    slipMap.set(key, slip);
  }

  // 2. Build a lookup of user decisions by match ID
  const decisionMap = new Map<string, 'accepted' | 'rejected'>();
  for (const dec of decisions) {
    decisionMap.set(dec.id, dec.status);
  }

  const pairs: ReconciledPair[] = [];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // 3. Iterate through transactions to find matches
  for (const tx of transactions) {
    if (!tx.id) continue;
    
    // We only reconcile credit transactions
    if (tx.type !== 'credit') continue;
    
    // Skip virtual salary slip transactions themselves
    if (tx.id.startsWith('sal-')) continue;

    // Get the transaction's month and year
    // Date format: YYYY-MM-DD
    const txMonthKey = tx.date.slice(0, 7); // "YYYY-MM"
    const slip = slipMap.get(txMonthKey);

    if (slip && slip.id) {
      // Check if amount is within ±₹500 of the slip's net pay
      const diff = Math.abs(tx.amount - slip.netPay);
      if (diff <= 500) {
        const pairId = `${tx.id}_${slip.id}`;
        const hasDecision = decisionMap.has(pairId);
        const status = decisionMap.get(pairId) || 'accepted'; // accepted by default
        const monthName = monthNames[slip.month - 1] || 'Salary';

        pairs.push({
          id: pairId,
          transaction: tx,
          salarySlip: slip,
          reason: `Transaction amount (₹${tx.amount.toLocaleString()}) matches Net Pay (₹${slip.netPay.toLocaleString()}) in your ${monthName} ${slip.year} salary slip (within ₹500 range).`,
          status,
          hasDecision,
        });
      }
    }
  }

  return pairs;
}

export interface ReconciledTransferPair {
  id: string; // `${bankTxId}_${cardTxId}`
  bankTx: Transaction;
  cardTx: Transaction;
  reason: string;
  status: 'accepted' | 'rejected';
  hasDecision: boolean;
}

/**
 * Matches credit card bill payment debits in the bank statement
 * with matching payment received credits in the credit card statements.
 */
export function getReconciledTransfers(
  transactions: Transaction[],
  decisions: ReconDecision[]
): ReconciledTransferPair[] {
  // 1. Separate bank CC payment debits and card statement credits
  const bankDebits = transactions.filter(tx => {
    if (tx.type !== 'debit') return false;
    const desc = tx.description.toLowerCase();
    const isCcPay = desc.includes('cred club') || 
                     desc.includes('cheq digital') || 
                     desc.includes('cc payment') || 
                     desc.includes('credit card payment') ||
                     desc.includes('bppy cc') ||
                     tx.category.toLowerCase() === 'credit card payment' ||
                     tx.category.toLowerCase() === 'transfer';
    return isCcPay;
  });

  const cardCredits = transactions.filter(tx => {
    if (tx.type !== 'credit') return false;
    if (tx.id?.startsWith('sal-')) return false;
    if (tx.category === 'Salary') return false;
    
    const desc = tx.description.toLowerCase();
    const isCcCredit = desc.includes('payment received') || 
                       desc.includes('cc payment') || 
                       desc.includes('bppy cc') || 
                       desc.includes('bppy') ||
                       tx.category.toLowerCase() === 'credit card payment' ||
                       tx.category.toLowerCase() === 'transfer';
    return isCcCredit;
  });

  const decisionMap = new Map<string, 'accepted' | 'rejected'>();
  for (const dec of decisions) {
    decisionMap.set(dec.id, dec.status);
  }

  const pairs: ReconciledTransferPair[] = [];
  const usedCardTxIds = new Set<string>();

  for (const bTx of bankDebits) {
    if (!bTx.id) continue;
    let bestMatch: Transaction | null = null;
    let minDiffDays = 999;

    for (const cTx of cardCredits) {
      if (!cTx.id || usedCardTxIds.has(cTx.id)) continue;
      
      const amtDiff = Math.abs(bTx.amount - cTx.amount);
      if (amtDiff <= 50) {
        const bDate = new Date(bTx.date);
        const cDate = new Date(cTx.date);
        const diffTime = Math.abs(cDate.getTime() - bDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 5 && diffDays < minDiffDays) {
          minDiffDays = diffDays;
          bestMatch = cTx;
        }
      }
    }

    if (bestMatch && bestMatch.id) {
      usedCardTxIds.add(bestMatch.id);

      const pairId = `${bTx.id}_${bestMatch.id}`;
      const hasDecision = decisionMap.has(pairId);
      const status = decisionMap.get(pairId) || 'accepted'; // accepted by default

      pairs.push({
        id: pairId,
        bankTx: bTx,
        cardTx: bestMatch,
        reason: `Bank debit of ${bTx.amount.toLocaleString()} matches Card credit of ${bestMatch.amount.toLocaleString()} (within 5-day window).`,
        status,
        hasDecision
      });
    }
  }

  return pairs;
}
