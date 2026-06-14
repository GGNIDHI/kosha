/** Maps ISO currency codes to their display symbols */
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

/** Returns the symbol for a currency code, defaulting to ₹ */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? '₹';
}

/**
 * Formats an amount with the correct symbol and locale formatting.
 * e.g. formatAmount(12345.6, 'INR') → "₹ 12,345.60"
 */
export function formatAmount(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
  return `${symbol} ${formatted}`;
}
