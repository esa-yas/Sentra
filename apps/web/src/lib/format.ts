/** Small presentation formatters. */

export const formatDateTime = (iso: string): string => {
  if (iso === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

export const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().slice(11, 23);
};

export const formatMs = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100) / 100} ms`;

export const formatMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

export const humanizeCode = (code: string): string =>
  code
    .toLowerCase()
    .split(/[_.]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
