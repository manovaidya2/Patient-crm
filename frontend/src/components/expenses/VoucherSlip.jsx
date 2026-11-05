import { Printer } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { PAID_FROM, MODES, dayLabel, inWords, rs, stamp } from './expenseShared.js';

// The payment voucher of one entry: number, date, pay to, what for, the amount in figures and words, where the money
// came from, and the Prepared / Approved / Received signature lines. "Print / Save PDF" opens it alone to print or save.
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const purposeOf = (e) => (e.kind === 'medicine'
  ? `${e.purpose} - ${e.items.map((i) => `${i.name} ${i.qty}${i.unit ? ` ${i.unit}` : ''} x ${rs(i.rate)}`).join(', ')}${e.extraCharges ? `, other charges ${rs(e.extraCharges)}` : ''}`
  : e.purpose);

const rowsOf = (e) => [
  ['Pay to', e.voucher.payTo],
  ['Towards', purposeOf(e)],
  [e.kind === 'medicine' ? 'Supplier' : 'Shop / vendor', [e.vendor, e.invoiceNo && `bill ${e.invoiceNo}`].filter(Boolean).join(' · ') || '-'],
  ['Paid by', `${e.paidByName} · ${PAID_FROM[e.paidFrom]}${e.paymentMode ? ` · ${MODES[e.paymentMode]}` : ''}`],
  ['Bill attached', e.bills?.length ? `Yes (${e.bills.length})` : 'No'],
  ...(e.settlement && e.repayStatus !== 'not_needed' ? [[e.repayStatus === 'supplier_paid' ? 'Supplier paid' : 'Repaid', `${dayLabel(e.settlement.date)} · ${MODES[e.settlement.mode] || e.settlement.mode}${e.settlement.reference ? ` · ${e.settlement.reference}` : ''} · by ${e.settlement.byName}`]] : []),
];

const printHtml = (e) => `<!doctype html><html><head><meta charset="utf-8"><title>Voucher ${esc(e.voucher.number)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}.v{border:1.5px solid #111;border-radius:6px;padding:20px;max-width:720px;margin:auto}
.top{display:flex;justify-content:space-between;border-bottom:1.5px dashed #777;padding-bottom:10px}h1{font-size:20px;margin:0}.k{color:#555;font-size:12px}.no{text-align:right;font-weight:700;font-size:18px}
dl{display:grid;grid-template-columns:140px 1fr;gap:8px 12px;margin:14px 0}dt{color:#555}dd{margin:0;border-bottom:1px dotted #999;font-weight:600}
.amt{display:flex;justify-content:space-between;border:1.5px solid #111;border-radius:6px;padding:10px 14px;align-items:center}.amt b{font-size:22px}
.s{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:48px;text-align:center;font-size:12px;color:#444}.s div{border-top:1px solid #555;padding-top:4px}.s b{display:block;color:#111}
.st{display:inline-block;border:2px solid #1F6B41;color:#1F6B41;border-radius:6px;padding:1px 8px;font-weight:700;font-size:11px;margin-top:4px}</style></head><body>
<div class="v"><div class="top"><div><h1>Manovaidya Clinic</h1><div class="k">${e.kind === 'medicine' ? 'Medicine purchase' : 'Clinic expense'} · Payment voucher</div></div>
<div class="no">${esc(e.voucher.number)}<div class="k">${esc(dayLabel(e.date))}</div></div></div>
<dl>${rowsOf(e).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
<div class="amt"><span>Rupees ${esc(inWords(e.amount))} only</span><b>${esc(rs(e.amount))}</b></div>
<div class="s"><div><b>${esc(e.voucher.madeByName || '')}</b>Prepared by</div><div><b>${esc(e.voucher.approvedByName || '')}</b>Approved by${e.voucher.status === 'approved' ? '<br><span class="st">APPROVED</span>' : ''}</div><div><b>&nbsp;</b>Received by</div></div></div>
<script>window.onload=function(){window.print();}</script></body></html>`;

export const printVoucher = (e) => {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return false;
  w.document.write(printHtml(e));
  w.document.close();
  return true;
};

export default function VoucherSlip({ expense: e }) {
  if (!e?.voucher) return null;
  const approved = e.voucher.status === 'approved';
  return (
    <div className="space-y-2">
      <div className="rounded-md border-[1.5px] border-charcoal bg-white p-4 text-sm text-charcoal">
        <div className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-charcoal/40 pb-2">
          <div><p className="font-display text-base font-extrabold">Manovaidya Clinic</p><p className="text-xs text-charcoal/60">{e.kind === 'medicine' ? 'Medicine purchase' : 'Clinic expense'} · Payment voucher</p></div>
          <div className="text-right"><p className="font-display font-extrabold">{e.voucher.number}</p><p className="text-xs text-charcoal/60">{dayLabel(e.date)}</p></div>
        </div>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 py-3 max-sm:grid-cols-1">
          {rowsOf(e).map(([k, v]) => <div key={k} className="contents"><dt className="text-charcoal/55">{k}</dt><dd className="min-w-0 break-words border-b border-dotted border-cardline font-semibold">{v}</dd></div>)}
        </dl>
        <div className="flex items-center justify-between gap-3 rounded-md border-[1.5px] border-charcoal px-3 py-2"><span className="min-w-0">Rupees {inWords(e.amount)} only</span><b className="shrink-0 font-display text-lg">{rs(e.amount)}</b></div>
        <div className="mt-7 grid grid-cols-3 gap-3 text-center text-xs text-charcoal/60">
          <div className="border-t border-charcoal/50 pt-1"><b className="block text-charcoal">{e.voucher.madeByName}</b>Prepared by</div>
          <div className="border-t border-charcoal/50 pt-1"><b className="block text-charcoal">{e.voucher.approvedByName || ' '}</b>Approved by{approved && <span className="mt-1 block"><span className="inline-block -rotate-3 rounded border-2 border-[#1F6B41] px-1.5 text-[10px] font-extrabold text-[#1F6B41]">APPROVED {stamp(e.voucher.approvedAt)}</span></span>}</div>
          <div className="border-t border-charcoal/50 pt-1"><b className="block text-charcoal">&nbsp;</b>Received by</div>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => printVoucher(e)}><Printer size={14} />Print / Save PDF</Button>
    </div>
  );
}
