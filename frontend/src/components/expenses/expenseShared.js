// Shared bits of the Expenses & Vouchers pages.
export const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
export const fileHref = (url) => (/^https?:/.test(url || '') ? url : `${SERVER_BASE}${url}`);
export const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const dayLabel = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const stamp = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export const PAID_FROM = { own: 'Own money (to be repaid)', clinic_cash: 'Clinic cash', clinic_bank: 'Clinic bank / UPI', credit: 'On credit (pay supplier later)' };
export const MODES = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer' };
export const REPAY = {
  to_repay: ['To repay', 'bg-[#FFF1E6] text-[#C2410C]'],
  repaid: ['Repaid', 'bg-[#E6F2EA] text-[#1F6B41]'],
  not_needed: ['No repay needed', 'bg-[#F3EEE2] text-charcoal/70'],
  supplier_due: ['Supplier due', 'bg-[#FDE2E1] text-[#9F1D1D]'],
  supplier_paid: ['Supplier paid', 'bg-[#E6F2EA] text-[#1F6B41]'],
};
export const VOUCHER = {
  pending: ['Waiting approval', 'bg-sky-50 text-sky-900'],
  approved: ['Approved', 'bg-[#E6F2EA] text-[#1F6B41]'],
  rejected: ['Sent back', 'bg-[#FDE2E1] text-[#9F1D1D]'],
};

// Rupees in words, Indian style (lakh / crore), for the voucher.
export const inWords = (num) => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ` ${a[n % 10]}` : ''}`);
  const three = (n) => `${n >= 100 ? `${a[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;
  let n = Math.floor(Number(num) || 0);
  const paise = Math.round(((Number(num) || 0) - n) * 100);
  if (!n && !paise) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''}`;
};
