export const BILL_DESCRIPTIONS = ['Consultation Fee', 'Customized Ayurvedic Formulations', 'Card Processing Charge'];
const small = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n) {
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${small[n % 10]}` : '');
  for (const [value, name] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]) {
    if (n >= value) return `${words(Math.floor(n / value))} ${name}${n % value ? ` ${words(n % value)}` : ''}`;
  }
}
export function toPaise(value) {
  if (value === '' || value == null) return 0;
  if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value)) || Number(value) > 999999999) throw new Error('Enter an amount between 0 and 999999999 with up to two decimal places');
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function amountInWords(amount) {
  const paise = toPaise(amount);
  return `Rupees ${words(Math.floor(paise / 100))}${paise % 100 ? ` and ${words(paise % 100)} Paise` : ''} Only`;
}
export function calculateFinalBill(items, payments) {
  const total = items.reduce((sum, row) => sum + toPaise(row.amount), 0);
  const received = payments.reduce((sum, row) => sum + toPaise(row.received), 0);
  if (total > 99999999900 || received > 99999999900) throw new Error('Bill total exceeds the supported amount');
  return {
    totalPayable: total / 100, amountReceived: received / 100,
    outstanding: Math.max(0, total - received) / 100,
    excessReceived: Math.max(0, received - total) / 100,
    amountInWords: amountInWords(received / 100),
  };
}
