const INDIA_OFFSET_MINUTES = 5 * 60 + 30;

const indiaWallClockToDate = (year, monthIndex, day, hour, minute, second = 0, millisecond = 0) =>
  new Date(
    Date.UTC(year, monthIndex, day, hour, minute, second, millisecond) - INDIA_OFFSET_MINUTES * 60 * 1000
  );

const hour24 = (hour, meridiem = '') => {
  const value = Number(hour);
  if (!meridiem) return value;
  return (value % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
};

const parseCallTimestamp = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text) return null;

  // Explicit Z/offset timestamps already identify an exact instant.
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[t\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(am|pm)?$/i);
  if (match) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0', meridiem = ''] = match;
    return indiaWallClockToDate(Number(year), Number(month) - 1, Number(day), hour24(hour, meridiem), Number(minute), Number(second), Number(fraction.padEnd(3, '0')));
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    const [, day, month, rawYear, hour, minute, second = '0', meridiem = ''] = match;
    const year = Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear);
    return indiaWallClockToDate(year, Number(month) - 1, Number(day), hour24(hour, meridiem), Number(minute), Number(second));
  }

  const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*,?\s*(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/i);
  if (match) {
    const [, hour, minute, second = '0', meridiem, day, monthName, rawYear] = match;
    const month = monthMap[monthName.toLowerCase()];
    if (month === undefined) return null;
    const year = Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear);
    return indiaWallClockToDate(year, month, Number(day), hour24(hour, meridiem), Number(minute), Number(second));
  }

  return null;
};

module.exports = { parseCallTimestamp };
