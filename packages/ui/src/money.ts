// Monetary amounts remain integer strings. These helpers only encode user input
// and format recorded values; pricing, tax and coverage decisions stay in the API.
export function currencyDigits(currency: unknown): number {
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) throw new Error('Choose a valid currency code.');
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new Error('This currency has no available precision definition.');
  return digits;
}

export function parseMoney(input: string, currency: unknown): string {
  const digits = currencyDigits(currency);
  const value = input.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Enter a nonnegative amount using a decimal point, without grouping separators.');
  const [whole, fraction = ''] = value.split('.');
  if (/[^0]/.test(fraction.slice(digits))) throw new Error(`${String(currency).toUpperCase()} supports ${digits} decimal places. This amount cannot be represented exactly.`);
  const minor = (whole + fraction.slice(0, digits).padEnd(digits, '0')).replace(/^0+(?=\d)/, '');
  if (minor.length > 18) throw new Error('This amount is too large.');
  return minor;
}

export function formatMoney(value: unknown, currency: unknown): string {
  if (value === undefined || value === null) return '—';
  const raw = String(value);
  try {
    const digits = currencyDigits(currency);
    if (!/^-?\d+$/.test(raw)) return `${raw} ${String(currency).toUpperCase()}`;
    const negative = raw.startsWith('-');
    const padded = raw.replace('-', '').padStart(digits + 1, '0');
    const integer = digits ? padded.slice(0, -digits) : padded;
    const fraction = digits ? '.' + padded.slice(-digits) : '';
    return `${negative ? '−' : ''}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction} ${String(currency).toUpperCase()}`;
  } catch { return `${raw} (${typeof currency === 'string' ? currency : 'currency unavailable'})`; }
}
