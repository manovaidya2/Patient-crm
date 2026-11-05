import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Pill, Plus, Receipt, RefreshCw, Store, Wallet } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, roleAllowed } from '../../constants/roles.js';
import ExpenseForm from '../../components/expenses/ExpenseForm.jsx';
import ExpenseDetail from '../../components/expenses/ExpenseDetail.jsx';
import { MODES, PAID_FROM, REPAY, VOUCHER, dayLabel, istToday, rs } from '../../components/expenses/expenseShared.js';
import { downloadXlsx } from '../../utils/xlsx.js';

// Expenses & vouchers, one page in three views:
//  'clinic'   - Clinic Expenses (Reception): what was spent for the clinic, who paid, the voucher, who is owed
//  'medicine' - Medicine Purchases (Medicine Department): supplier bills with items, and what each medicine cost
//  'all'      - All Expenses (Admin / Doctor): both together, vouchers to approve, money to repay / pay suppliers
const VIEWS = {
  clinic: { title: 'Clinic Expenses', icon: Store, subtitle: 'Every rupee spent for the clinic: what it was for, who paid and from which money. Make a payment voucher for each; Admin / Doctor approve it and repay whoever paid from their own pocket.' },
  medicine: { title: 'Medicine Purchases', icon: Pill, subtitle: 'Supplier bills for herbs, bottles, droppers and labels: each item with quantity and rate. Make the voucher; Admin / Doctor approve it and settle the payment.' },
  all: { title: 'All Expenses', icon: Receipt, subtitle: 'Clinic expenses and medicine purchases together: when, who, for what, how much, the voucher, and whether the money is repaid.' },
};
const RANGES = [['month', 'This month'], ['today', 'Today'], ['week', 'Last 7 days'], ['last', 'Last month'], ['all', 'All time'], ['custom', 'Custom']];
const rangeDates = (key) => {
  const t = istToday();
  const d = new Date(`${t}T00:00:00`);
  const ymd = (x) => x.toLocaleDateString('en-CA');
  if (key === 'today') return [t, t];
  if (key === 'week') { const s = new Date(d); s.setDate(s.getDate() - 6); return [ymd(s), t]; }
  if (key === 'month') return [`${t.slice(0, 7)}-01`, t];
  if (key === 'last') { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); return [ymd(s), ymd(e)]; }
  return ['', ''];
};
const STATUS_FILTERS = [['all', 'All'], ['no_voucher', 'No voucher'], ['pending_approval', 'Waiting approval'], ['to_repay', 'To repay'], ['supplier_due', 'Supplier due'], ['repaid', 'Repaid'], ['not_needed', 'No repay needed']];
const Tile = ({ label, value, sub, tone = '' }) => (
  <div className={`min-w-0 rounded-[14px] border px-3.5 py-3 ${tone === 'orange' ? 'border-[#FDBA74] bg-[#FFF7ED]' : tone === 'red' ? 'border-[#F5C6C0] bg-[#FEF2F2]' : 'border-[#E8DFCB] bg-white'}`}>
    <p className={`text-[10.5px] font-bold uppercase tracking-wide ${tone === 'orange' ? 'text-[#C2410C]' : tone === 'red' ? 'text-[#9F1D1D]' : 'text-charcoal/55'}`}>{label}</p>
    <p className={`font-display text-[22px] font-extrabold tabular-nums ${tone === 'orange' ? 'text-[#C2410C]' : tone === 'red' ? 'text-[#9F1D1D]' : 'text-charcoal'}`}>{value}</p>
    {sub && <p className="text-xs text-charcoal/60">{sub}</p>}
  </div>
);

export default function ExpenseBook({ view = 'clinic' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const meta = VIEWS[view];
  // Opened from My Day (?open=id): all dates, so the entry is in the list.
  const startRange = params.get('open') ? 'all' : 'month';
  const [range, setRange] = useState(startRange);
  const [from, setFrom] = useState(() => rangeDates(startRange)[0]);
  const [to, setTo] = useState(() => rangeDates(startRange)[1]);
  const [status, setStatus] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null); // 'clinic' | 'medicine'
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(params.get('open') || '');
  const [repayFor, setRepayFor] = useState(null);

  const kind = view === 'all' ? kindFilter : view;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/expenses', { params: { kind, from: from || undefined, to: to || undefined, status, q: q || undefined }, skipCache: true });
      setData(res); setError('');
    } catch (err) { setError(err.response?.data?.message || 'Expenses could not be loaded'); }
    finally { setLoading(false); }
  }, [kind, from, to, status, q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useLiveEvent('expenses:changed', load);

  const pickRange = (key) => { setRange(key); if (key !== 'custom') { const [f, t] = rangeDates(key); setFrom(f); setTo(t); } };
  const rows = data?.rows || [];
  const s = data?.summary;
  const opened = useMemo(() => rows.find((r) => r.id === openId) || null, [rows, openId]);
  const closeOpen = () => { setOpenId(''); if (params.get('open')) setParams({}); };
  // Who can add what here.
  const canAddClinic = roleAllowed([ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], user);
  const canAddMedicine = roleAllowed([ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], user);

  const exportExcel = () => {
    const columns = [['Date', 12], ['Type', 16], ['What for', 34], ['Shop / supplier', 22], ['Bill no.', 12], ['Items', 40], ['Amount (Rs)', 13], ['Who paid', 16], ['Money from', 22], ['Mode', 10], ['Voucher', 11], ['Voucher status', 16], ['Approved by', 16], ['Repay status', 16], ['Paid / repaid on', 16], ['Paid to', 16], ['Paid by', 16], ['Reference', 16], ['Written by', 16]];
    downloadXlsx({
      fileName: `${meta.title.toLowerCase().replace(/\s+/g, '-')}-${from || 'all'}${to && to !== from ? `-to-${to}` : ''}`,
      sheetName: meta.title,
      columns: columns.map(([header, width]) => ({ header, width })),
      rows: rows.map((e) => [dayLabel(e.date), e.kindLabel, e.purpose, e.vendor, e.invoiceNo, e.items.map((i) => `${i.name} ${i.qty}${i.unit ? ` ${i.unit}` : ''} x ${i.rate}`).join('; '), e.amount, e.paidByName, PAID_FROM[e.paidFrom], MODES[e.paymentMode] || '',
        e.voucher?.number || '', e.voucher ? VOUCHER[e.voucher.status][0] : 'No voucher', e.voucher?.approvedByName || '', REPAY[e.repayStatus][0], e.settlement?.date ? dayLabel(e.settlement.date) : '', e.settlement?.toName || '', e.settlement?.byName || '', e.settlement?.reference || e.settlement?.reason || '', e.createdByName]),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader title={meta.title} icon={meta.icon} subtitle={meta.subtitle} actions={<div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!rows.length} onClick={exportExcel}><Download size={15} />Export to Excel</Button>
        {view !== 'medicine' && canAddClinic && <Button onClick={() => setAdding('clinic')}><Plus size={15} />{view === 'all' ? 'Clinic expense' : 'Add expense'}</Button>}
        {view !== 'clinic' && canAddMedicine && <Button onClick={() => setAdding('medicine')}><Plus size={15} />{view === 'all' ? 'Medicine purchase' : 'Add purchase'}</Button>}
      </div>} />

      {/* Numbers first */}
      {s && <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile label={range === 'all' ? 'Total spent' : `Spent · ${RANGES.find(([k]) => k === range)?.[1].toLowerCase()}`} value={rs(s.total)} sub={view === 'all' ? `Clinic ${rs(s.clinic)} · Medicine ${rs(s.medicine)}` : `${s.count} ${view === 'medicine' ? 'purchases' : 'expenses'}`} />
        {view === 'all'
          ? <Tile label="Vouchers to approve" value={s.pendingApproval} sub="approve before paying" tone={s.pendingApproval ? 'orange' : ''} />
          : <Tile label="Without voucher" value={s.withoutVoucher} sub="make one for each" tone={s.withoutVoucher ? 'orange' : ''} />}
        <Tile label="To repay to staff" value={rs(s.toRepay)} sub={`${data.toRepay.length} ${data.toRepay.length === 1 ? 'person' : 'people'} paid from own money`} tone={s.toRepay ? 'orange' : ''} />
        {view === 'clinic' ? <Tile label="Today" value={rs(s.today)} sub={dayLabel(istToday())} /> : <Tile label="Supplier due" value={rs(s.supplierDue)} sub={`${s.supplierDueCount} bill${s.supplierDueCount === 1 ? '' : 's'} bought on credit`} tone={s.supplierDue ? 'red' : ''} />}
      </div>}

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-[14px] border border-[#E8DFCB] bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map(([k, v]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => pickRange(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${range === k ? 'border-charcoal bg-charcoal text-white' : 'border-cardline bg-white text-charcoal/70'}`}>{v}</button>)}
          {range === 'custom' && <span className="flex items-center gap-1.5 text-xs"><input type="date" className="rounded-md border border-cardline px-2 py-1" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" />to<input type="date" className="rounded-md border border-cardline px-2 py-1" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" /></span>}
          <button type="button" aria-label="Refresh" onClick={load} className="ml-auto rounded-lg p-1.5 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.filter(([k]) => view !== 'clinic' || k !== 'supplier_due').map(([k, v]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === k ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70'}`}>{v}</button>)}
          {view === 'all' && <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="rounded-md border border-cardline bg-white px-2 py-1 text-xs" aria-label="Type"><option value="all">Clinic + Medicine</option><option value="clinic">Clinic expenses</option><option value="medicine">Medicine purchases</option></select>}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: what for, name, supplier, voucher no." className="min-w-[200px] flex-1 rounded-md border border-cardline bg-white px-2.5 py-1 text-xs" aria-label="Search" />
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className={`grid gap-4 ${view === 'clinic' ? '' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <div className="min-w-0 overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
            <thead className="bg-[#F6F0E3] text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><tr>
              {['Date', view === 'medicine' ? 'Supplier · items' : 'What for', 'Who paid', 'Amount', 'Voucher', 'Money'].map((h) => <th key={h} className={`border-b border-[#E8DFCB] px-3 py-2.5 ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => setOpenId(e.id)} className="cursor-pointer border-b border-[#F0E8D8] align-top hover:bg-[#FFFCF5]">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{dayLabel(e.date)}</td>
                  <td className="max-w-[360px] px-3 py-2.5">
                    {view === 'all' && <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${e.kind === 'medicine' ? 'bg-[#FBF0DC] text-[#7C5B2E]' : 'bg-[#E9EFE9] text-sage'}`}>{e.kind === 'medicine' ? 'Medicine' : 'Clinic'}</span>}
                    <b className="text-charcoal">{e.kind === 'medicine' ? e.vendor : e.purpose}</b>
                    <p className="text-xs text-charcoal/60">{e.kind === 'medicine' ? `${e.purpose}${e.items.length ? ` · ${e.items.map((i) => `${i.name} ${i.qty}${i.unit ? ` ${i.unit}` : ''}`).join(', ')}` : ''}` : [e.vendor, e.invoiceNo && `bill ${e.invoiceNo}`].filter(Boolean).join(' · ')}{e.bills.length ? ` · ${e.bills.length} bill${e.bills.length === 1 ? '' : 's'}` : ' · no bill'}</p>
                  </td>
                  <td className="px-3 py-2.5"><p className="font-semibold">{e.paidByName}</p><p className="text-xs text-charcoal/55">{PAID_FROM[e.paidFrom]}</p></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums">{rs(e.amount)}</td>
                  <td className="px-3 py-2.5">{e.voucher ? <><p className="font-semibold">{e.voucher.number}</p><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${VOUCHER[e.voucher.status][1]}`}>{VOUCHER[e.voucher.status][0]}</span></> : <span className="text-xs font-semibold text-[#C2410C]">No voucher yet</span>}</td>
                  <td className="px-3 py-2.5"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${REPAY[e.repayStatus][1]}`}>{REPAY[e.repayStatus][0]}</span>{e.settlement?.date && e.repayStatus !== 'not_needed' && <p className="mt-0.5 text-[11px] text-charcoal/55">{dayLabel(e.settlement.date)}</p>}</td>
                </tr>
              ))}
              {data && !rows.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-charcoal/55">Nothing for these filters. {view === 'clinic' ? 'Add the first expense with "Add expense".' : view === 'medicine' ? 'Add the first purchase with "Add purchase".' : ''}</td></tr>}
              {!data && !error && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-charcoal/55">Loading...</td></tr>}
            </tbody>
          </table>
        </div>

        {view !== 'clinic' && data && (
          <aside className="min-w-0 space-y-4">
            {view === 'all' && (
              <section className="rounded-[14px] border border-[#E8DFCB] bg-white">
                <header className="border-b border-[#E8DFCB] px-3.5 py-2.5"><h2 className="font-display text-sm font-extrabold">To repay</h2><p className="text-xs text-charcoal/55">People who paid from their own money</p></header>
                <ul className="divide-y divide-[#F0E8D8]">
                  {data.toRepay.map((p) => <li key={p.name} className="flex items-center justify-between gap-2 px-3.5 py-2.5"><span className="min-w-0"><b className="block truncate">{p.name}</b><span className="text-xs text-charcoal/55">{p.count} expense{p.count === 1 ? '' : 's'}{p.ready < p.count ? ` · ${p.count - p.ready} voucher${p.count - p.ready === 1 ? '' : 's'} not approved` : ''}</span></span><span className="text-right"><b className="block tabular-nums">{rs(p.amount)}</b>{data.canApprove && p.ready > 0 && <button type="button" onClick={() => setRepayFor(p)} className="text-xs font-bold text-sage hover:underline">Repay approved</button>}</span></li>)}
                  {!data.toRepay.length && <li className="px-3.5 py-4 text-sm text-charcoal/55">Everyone is repaid.</li>}
                </ul>
              </section>
            )}
            {data.costByItem.length > 0 && (
              <section className="rounded-[14px] border border-[#E8DFCB] bg-white">
                <header className="border-b border-[#E8DFCB] px-3.5 py-2.5"><h2 className="font-display text-sm font-extrabold">Cost by medicine</h2><p className="text-xs text-charcoal/55">Bought in these dates</p></header>
                <ul className="space-y-2.5 px-3.5 py-3">
                  {data.costByItem.slice(0, 12).map((m) => <li key={m.name}><div className="flex items-baseline justify-between gap-2 text-sm"><b className="min-w-0 truncate">{m.name}</b><b className="tabular-nums">{rs(m.spend)}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F3EEE2]"><div className="h-full rounded-full bg-[#B7791F]" style={{ width: `${(m.spend / Math.max(data.costByItem[0].spend, 1)) * 100}%` }} /></div><p className="mt-0.5 text-[11px] text-charcoal/55">{m.qty.toLocaleString('en-IN')} {m.unit} · last rate {rs(m.lastRate)} · {m.buys} buy{m.buys === 1 ? '' : 's'}</p></li>)}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      <Modal open={Boolean(adding) || Boolean(editing)} onClose={() => { setAdding(null); setEditing(null); }} title={editing ? `Edit ${editing.kindLabel.toLowerCase()}` : adding === 'medicine' ? 'Add medicine purchase' : 'Add clinic expense'} className="max-w-2xl">
        {(adding || editing) && <ExpenseForm kind={editing ? editing.kind : adding} expense={editing} suggestions={data?.suggestions} onCancel={() => { setAdding(null); setEditing(null); }}
          onSaved={(saved, withVoucher) => { setAdding(null); setEditing(null); load(); if (withVoucher || editing) setOpenId(saved.id); }} />}
      </Modal>
      <Drawer open={Boolean(opened)} onClose={closeOpen} title={opened ? `${opened.kindLabel} · ${dayLabel(opened.date)}` : ''} widthClass="max-w-xl">
        {opened && <ExpenseDetail key={opened.id} expense={opened} onEdit={() => setEditing(opened)} onChanged={(next) => { if (next) setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === next.id ? next : r)) })); else closeOpen(); load(); }} />}
      </Drawer>
      <Modal open={Boolean(repayFor)} onClose={() => setRepayFor(null)} title={repayFor ? `Repay ${repayFor.name}` : ''}>
        {repayFor && <RepayAll person={repayFor} onDone={() => { setRepayFor(null); load(); }} />}
      </Modal>
    </div>
  );
}

// Repay one person every expense whose voucher is approved, in one go.
function RepayAll({ person, onDone }) {
  const [form, setForm] = useState({ date: istToday(), mode: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/expenses/repay-person', { name: person.name, ...form }); onDone(); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const field = 'mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p>{person.ready} approved expense{person.ready === 1 ? '' : 's'} of <b>{person.name}</b> are marked repaid together.{person.ready < person.count ? ` ${person.count - person.ready} more wait for their voucher approval.` : ''}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="font-medium">Date<input type="date" className={field} max={istToday()} value={form.date} onChange={set('date')} /></label>
        <label className="font-medium">Mode<select className={field} value={form.mode} onChange={set('mode')}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="font-medium">Reference<input className={field} value={form.reference} onChange={set('reference')} /></label>
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={busy}><Wallet size={15} />{busy ? 'Saving...' : 'Mark repaid'}</Button></div>
    </form>
  );
}
