/**
 * Money helpers.
 *
 * All monetary values are stored and computed as **integer cents** to avoid
 * floating-point rounding errors. Kenyan Shilling (KES) is the default
 * currency. Prices are typically whole shillings, but cents are supported.
 */

export const DEFAULT_CURRENCY = "KES";

/**
 * Apply a percentage to an amount in cents and round to the nearest cent.
 * Used for the platform service fee.
 */
export function applyPercent(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/** Format integer cents as a currency string, e.g. "KES 1,250.00". */
export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  opts: { withSymbol?: boolean; decimals?: boolean } = {}
): string {
  const { withSymbol = true, decimals = true } = opts;
  const value = cents / 100;
  const formatted = value.toLocaleString("en-KE", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return withSymbol ? `${currency} ${formatted}` : formatted;
}

/**
 * Round a cell-phone-friendly total to the nearest whole shilling.
 * Kenyan mobile money typically transacts in whole shillings.
 */
export function toWholeShilling(cents: number): number {
  return Math.round(cents / 100) * 100;
}
