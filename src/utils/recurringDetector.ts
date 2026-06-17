import type { Transaction } from '../db/database';

export type RecurringFrequency = 'monthly' | 'weekly' | 'bi-weekly';

export interface RecurringTransaction {
  description: string;
  category: string;
  frequency: RecurringFrequency;
  averageAmount: number;
  lastDate: string;
  occurrences: number;
  transactions?: Transaction[];
}


/** Normalise a description for grouping: lowercase, strip numbers & special chars */
function normalise(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

/** Gap in days between two YYYY-MM-DD dates */
function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

/** Classify frequency based on average gap in days */
function classifyFrequency(avgGap: number): RecurringFrequency | null {
  if (avgGap >= 25 && avgGap <= 35) return 'monthly';
  if (avgGap >= 12 && avgGap <= 18) return 'bi-weekly';
  if (avgGap >= 5 && avgGap <= 9) return 'weekly';
  return null;
}

/**
 * Analyses a list of transactions and returns detected recurring ones.
 * Only looks at debit transactions. Requires 2+ occurrences.
 */
export function detectRecurring(transactions: Transaction[]): RecurringTransaction[] {
  // Group debits by normalised description
  const groups: Record<string, Transaction[]> = {};

  transactions
    .filter(tx => tx.type === 'debit')
    .forEach(tx => {
      const key = normalise(tx.description);
      if (!key || key.length < 3) return; // skip too-short/empty keys
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });

  const recurring: RecurringTransaction[] = [];

  for (const [, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue;

    // Sort by date ascending
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

    // Calculate gaps between consecutive dates
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const freq = classifyFrequency(avgGap);
    if (!freq) continue;

    // Check that gaps are relatively consistent (std deviation < 10 days)
    const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
    if (Math.sqrt(variance) > 10) continue;

    const avgAmount = txs.reduce((s, t) => s + t.amount, 0) / txs.length;

    recurring.push({
      description: txs[txs.length - 1].description, // use latest description form
      category: txs[txs.length - 1].category,
      frequency: freq,
      averageAmount: Math.round(avgAmount * 100) / 100,
      lastDate: sorted[sorted.length - 1].date,
      occurrences: txs.length,
      transactions: sorted,
    });

  }

  // Sort by average amount descending
  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}
