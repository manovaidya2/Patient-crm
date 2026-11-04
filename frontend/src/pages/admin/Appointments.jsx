import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { downloadXlsx } from '../../utils/xlsx.js';

// "Appointments": each appointment of the chosen dates and how the visit went - Patient ID (and when it was made),
// arrival, registration sent to the Post Counselor, history started / taken (ticked by a PCC) and the package bought.
// Reception's and post counselling's columns fill by themselves; a PCC ticks the history here. Everyone can see it; it
// exports to Excel (.xlsx) with the columns picked.
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const time = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const Stamp = ({ at, by }) => (at ? <p className="mt-0.5 text-[11px] leading-4 text-charcoal/55">{time(at)}{by ? ` · ${by}` : ''}</p> : null);
const Empty = () => <span className="text-charcoal/30">—</span>;

// The table: [title, width class]
const HEAD = [['#', 'w-[110px]'], ['Patient', 'w-[220px]'], ['Patient ID', 'w-[150px]'], ['Arrival', 'w-[100px]'], ['Registration → Post Counselor', 'w-[190px]'], ['History start', 'w-[120px]'], ['History taken', 'w-[120px]'], ['Package', 'w-[240px]'], ['Purchase order', 'w-[180px]'], ['Medicine', 'w-[190px]'], ['Delivery', 'w-[200px]'], ['Treatment', 'w-[150px]']];
const cellClass = 'border border-[#E8DFCB] px-3 py-2.5 align-top';

// Export columns (picked in the dialog): key, header, Excel width, value.
const DELIVERY = { not_scheduled: 'Not scheduled', scheduled: 'Scheduled', on_the_way: 'On the way', delivered: 'Delivered' };
const DELIVERY_TONE = { not_scheduled: 'text-charcoal/60', scheduled: 'text-sky-800', on_the_way: 'text-amber-800', delivered: 'text-emerald-800' };
const MED_TONE = { requested: 'text-charcoal/70', in_process: 'text-amber-800', made: 'text-emerald-800', sent_to_courier: 'text-emerald-800', cancelled: 'text-[#9F1D1D]' };
const outcomeText = (r) => (r.outcome === 'converted' ? 'Package bought' : r.outcome === 'not_purchased' ? 'Not purchased' : '');
const EXPORT_COLUMNS = [
  ['date', 'Appointment date', 14, (r) => dayLabel(r.appointmentDate)],
  ['token', 'Token', 8, (r) => r.tokenNumber || ''],
  ['code', 'Appointment ID', 20, (r) => r.appointmentCode],
  ['patient', 'Patient name', 24, (r) => r.patientName],
  ['phone', 'Phone', 14, (r) => r.phone],
  ['patientId', 'Patient ID', 16, (r) => r.patientId],
  ['idAt', 'Patient ID made at', 20, (r) => dateTime(r.patientIdAt)],
  ['arrival', 'Arrival', 10, (r) => r.arrivalStatus],
  ['arrivalTime', 'Arrival time', 11, (r) => r.arrivalTime],
  ['regAt', 'Registration sent at', 20, (r) => dateTime(r.registration?.at)],
  ['postCounselor', 'Post Counselor', 18, (r) => r.registration?.to],
  ['historyStart', 'History start', 20, (r) => dateTime(r.historyStarted?.at)],
  ['historyStartBy', 'History start by', 16, (r) => r.historyStarted?.byName],
  ['historyTaken', 'History taken', 20, (r) => dateTime(r.historyTaken?.at)],
  ['historyTakenBy', 'History taken by', 16, (r) => r.historyTaken?.byName],
  ['outcome', 'Outcome', 16, outcomeText],
  ['treatment', 'Treatment', 26, (r) => r.package?.treatment],
  ['supply', 'Supply', 16, (r) => r.package?.supply],
  ['plan', 'Payment plan', 14, (r) => r.package?.plan],
  ['fee', 'Package fee (Rs)', 14, (r) => (r.package ? r.package.fee : '')],
  ['paid', 'Paid (Rs)', 12, (r) => (r.package ? r.package.paid : '')],
  ['due', 'Due (Rs)', 12, (r) => (r.package ? r.package.due : '')],
  ['poNumber', 'PO number', 12, (r) => r.po?.number || r.poNumber],
  ['poStatus', 'PO status', 20, (r) => r.po?.statusLabel],
  ['poTotal', 'PO amount (Rs)', 14, (r) => (r.po ? r.po.total : '')],
  ['poPaid', 'PO paid (Rs)', 13, (r) => (r.po ? r.po.paid : '')],
  ['poBalance', 'PO balance (Rs)', 14, (r) => (r.po ? r.po.balance : '')],
  ['medicine', 'Medicine status', 20, (r) => r.medicine?.label],
  ['medicineStep', 'Medicine step', 30, (r) => r.medicine?.detail],
  ['medicineMade', 'Medicine ready on', 20, (r) => dateTime(r.medicine?.madeAt)],
  ['delivery', 'Delivery status', 18, (r) => DELIVERY[r.delivery?.state] || ''],
  ['deliveryPlan', 'Delivery plan', 26, (r) => r.delivery?.text],
  ['deliverySent', 'Dispatched / handed over', 20, (r) => dateTime(r.delivery?.sentAt)],
  ['deliveryVia', 'Courier / tracking', 22, (r) => r.delivery?.via],
  ['delivered', 'Delivered on', 20, (r) => dateTime(r.delivery?.deliveredAt)],
  ['explained', 'Medicine explained', 20, (r) => dateTime(r.explainedAt)],
  ['started', 'Treatment started', 20, (r) => dateTime(r.startedAt)],
];
const PICK_KEY = 'appointments:export-columns';
const savedPick = () => { try { const v = JSON.parse(localStorage.getItem(PICK_KEY) || 'null'); return Array.isArray(v) && v.length ? v : null; } catch { return null; } };

function ExportDialog({ rows, from, to, onClose }) {
  const [picked, setPicked] = useState(() => savedPick() || EXPORT_COLUMNS.map(([key]) => key));
  const toggle = (key) => setPicked((old) => (old.includes(key) ? old.filter((k) => k !== key) : [...old, key]));
  const run = () => {
    const cols = EXPORT_COLUMNS.filter(([key]) => picked.includes(key));
    if (!cols.length) return;
    try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch { /* the choice is just not remembered */ }
    const fileName = `appointments-${from}${to !== from ? `-to-${to}` : ''}`;
    const columns = cols.map(([, header, width]) => ({ header, width }));
    const data = rows.map((r) => cols.map(([, , , value]) => { const v = value(r); return v === undefined || v === null ? '' : v; }));
    downloadXlsx({ fileName, sheetName: 'Appointments', columns, rows: data });
    onClose();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-charcoal/70">{rows.length} appointment{rows.length === 1 ? '' : 's'} · {from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`}. Tick the columns to export.</p>
      <div className="flex gap-3 text-xs font-semibold text-sage"><button type="button" onClick={() => setPicked(EXPORT_COLUMNS.map(([key]) => key))}>Select all</button><button type="button" onClick={() => setPicked([])}>Clear</button></div>
      <div className="grid max-h-[50vh] grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-cardline bg-white p-3 sm:grid-cols-2">
        {EXPORT_COLUMNS.map(([key, header]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#5B7B65]" checked={picked.includes(key)} onChange={() => toggle(key)} />{header}</label>)}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!picked.length} onClick={run}><FileSpreadsheet size={15} />Download Excel (.xlsx)</Button>
      </div>
    </div>
  );
}

function HistoryTick({ row, step, onSaved, onError }) {
  const value = step === 'taken' ? row.historyTaken : row.historyStarted;
  const [busy, setBusy] = useState(false);
  const blocked = !row.patientId || (step === 'taken' && !row.historyStarted);
  const toggle = async () => {
    setBusy(true); onError('');
    try { const { data } = await api.post(`/appointments-board/${row.id}/history`, { step, done: !value }); onSaved(data.row); }
    catch (err) { onError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  if (!row.canMarkHistory) return value ? <><span className="font-bold text-emerald-700">✓ Done</span><Stamp at={value.at} by={value.byName} /></> : <Empty />;
  return (
    <label className={`inline-flex flex-col ${blocked ? 'opacity-40' : 'cursor-pointer'}`} title={!row.patientId ? 'Reception marks the arrival first' : step === 'taken' && !row.historyStarted ? 'Tick History start first' : ''}>
      <input type="checkbox" className="h-4 w-4 accent-[#5B7B65]" checked={Boolean(value)} disabled={busy || blocked} onChange={toggle} />
      <Stamp at={value?.at} by={value?.byName} />
    </label>
  );
}

export default function Appointments() {
  const [from, setFrom] = useState(istToday);
  const [to, setTo] = useState(istToday);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: res } = await api.get('/appointments-board', { params: { from, to }, skipCache: true }); setData(res); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Appointments could not be loaded'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('appointments-board:changed', load);
  useLiveEvent('sales-sheet:date-changed', load);
  useLiveEvent('post-counseling:changed', load);
  const replace = (row) => setData((old) => ({ ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, ...row, patientIdAt: r.patientIdAt } : r)) }));
  const rows = data?.rows || [];

  return (
    <div className="space-y-4">
      <PageHeader title="Appointments" icon={CalendarCheck2} subtitle="Each appointment and how the visit went: Patient ID, arrival, registration, history, the package, and after it the PO, medicine, delivery and treatment start."
        actions={<Button variant="outline" disabled={!rows.length} onClick={() => setExporting(true)}><Download size={15} />Export to Excel</Button>} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-charcoal">From<input type="date" className="mt-1 block rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
        <label className="text-xs font-semibold text-charcoal">To<input type="date" className="mt-1 block rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="outline" size="sm" onClick={() => { setFrom(istToday()); setTo(istToday()); }}>Today</Button>
        <span className="mb-2 ml-1 text-sm text-charcoal/60">{rows.length} appointment{rows.length === 1 ? '' : 's'}</span>
        <button type="button" aria-label="Refresh" onClick={load} className="mb-0.5 ml-auto rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-[12px] border border-[#E8DFCB] bg-white">
        <table className="w-full min-w-[1980px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>{HEAD.map(([h, w]) => <col key={h} className={w} />)}</colgroup>
          <thead className="bg-[#F6F0E3] text-[11px] font-bold uppercase tracking-wide text-charcoal/70">
            <tr>{HEAD.map(([h]) => <th key={h} className="border border-[#E8DFCB] px-3 py-2.5 align-middle">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 ? 'bg-[#FFFCF7]' : 'bg-white'}>
                <td className={cellClass}>
                  <p className="font-semibold text-charcoal">{i + 1}{r.tokenNumber ? <span className="ml-1.5 rounded bg-[#FFF1E6] px-1.5 py-0.5 text-[11px] font-bold text-[#C2410C]">T{r.tokenNumber}</span> : null}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-charcoal/55">{dayLabel(r.appointmentDate)}</p>
                </td>
                <td className={cellClass}>
                  <p className="truncate font-bold text-charcoal" title={r.patientName}>{r.patientName || '-'}</p>
                  <p className="truncate text-[11px] text-charcoal/55" title={r.appointmentCode}>{r.appointmentCode}</p>
                  {r.phone && <a href={`tel:${r.phone}`} className="text-[11px] font-semibold text-sage">{r.phone}</a>}
                </td>
                <td className={cellClass}>{r.patientId ? <><p className="whitespace-nowrap font-bold text-sage">{r.patientId}</p><Stamp at={r.patientIdAt} /></> : <Empty />}</td>
                <td className={cellClass}>{r.arrivalStatus ? <><p className="font-semibold">{r.arrivalStatus}</p><p className="text-[11px] text-charcoal/55">{r.arrivalTime}</p></> : <Empty />}</td>
                <td className={cellClass}>{r.registration?.at ? <><p className="font-semibold text-emerald-800">✓ {r.registration.to}</p><Stamp at={r.registration.at} by={r.registration.byName} /></> : r.registration?.draft ? <span className="text-xs text-amber-800">Saved, not sent</span> : <Empty />}</td>
                <td className={cellClass}><HistoryTick row={r} step="started" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><HistoryTick row={r} step="taken" onSaved={replace} onError={setError} /></td>
                <td className={`${cellClass} text-xs`}>
                  {r.package ? <div className="space-y-0.5"><p className="font-bold text-emerald-800">Package bought</p><p className="text-charcoal/80">{r.package.treatment}{r.package.supply ? ` · ${r.package.supply}` : ''}</p><p>{money(r.package.fee)}{r.package.plan ? ` · ${r.package.plan}` : ''}</p><p>Paid {money(r.package.paid)} · Due <b className={r.package.due ? 'text-[#C2410C]' : ''}>{money(r.package.due)}</b></p></div>
                    : r.outcome === 'not_purchased' ? <span className="font-semibold text-[#9F1D1D]">Not purchased</span> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.po ? <><Link to={`/admin/purchase-orders/${r.po.id}`} className="font-bold text-sage hover:underline">{r.po.number}</Link><p className={r.po.status === 'verified' ? 'text-emerald-800' : r.po.status === 'rejected' ? 'text-[#9F1D1D]' : 'text-amber-800'}>{r.po.statusLabel}</p><p className="text-charcoal/70">{money(r.po.paid)} / {money(r.po.total)}{r.po.balance > 0 ? <> · <b className="text-[#C2410C]">bal {money(r.po.balance)}</b></> : null}</p>{r.po.pending > 0 && <p className="text-amber-800">{r.po.pending} payment(s) to verify</p>}</>
                    : r.poNumber ? <span className="font-semibold">{r.poNumber}</span> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.medicine?.label ? <><p className={`font-bold ${MED_TONE[r.medicine.status] || 'text-charcoal/60'}`}>{r.medicine.label}</p>{r.medicine.detail && <p className="text-charcoal/65">{r.medicine.detail}</p>}{r.medicine.madeAt && <p className="text-[11px] text-charcoal/55">Ready {dateTime(r.medicine.madeAt)}</p>}{!r.medicine.madeAt && r.medicine.readyBy && <p className="text-[11px] text-charcoal/55">Ready by {dayLabel(String(r.medicine.readyBy).slice(0, 10))}</p>}</> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.delivery?.state ? <><p className={`font-bold ${DELIVERY_TONE[r.delivery.state]}`}>{DELIVERY[r.delivery.state]}</p>{r.delivery.text && <p className="text-charcoal/70">{r.delivery.text}</p>}{r.delivery.via && <p className="text-charcoal/60">{r.delivery.via}</p>}{r.delivery.deliveredAt ? <p className="text-[11px] text-charcoal/55">Delivered {dateTime(r.delivery.deliveredAt)}</p> : r.delivery.sentAt ? <p className="text-[11px] text-charcoal/55">Sent {dateTime(r.delivery.sentAt)}</p> : null}{r.delivery.now && r.delivery.state !== 'delivered' && <p className="text-[11px] text-charcoal/55">Now: {r.delivery.now}</p>}</> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.startedAt ? <><p className="font-bold text-emerald-800">Treatment started</p><p className="text-[11px] text-charcoal/55">{dateTime(r.startedAt)}</p></>
                    : r.explainedAt ? <><p className="font-bold text-emerald-800">Explained</p><p className="text-[11px] text-charcoal/55">{dateTime(r.explainedAt)}</p></> : r.po ? <span className="text-charcoal/50">Not started</span> : <Empty />}
                </td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={HEAD.length} className={`${cellClass} py-10 text-center text-sm text-charcoal/55`}>No appointments on {from === to ? dayLabel(from) : 'these dates'}.</td></tr>}
            {!data && !error && <tr><td colSpan={HEAD.length} className={`${cellClass} py-10 text-center text-sm text-charcoal/55`}>Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-charcoal/55">Any PCC ticks "History start" and "History taken" (the time and who ticked are saved). Patient ID, arrival, registration and package come in by themselves. <Link to="/admin/appointment-management" className="font-semibold text-sage">Appointment Management</Link></p>
      <Modal open={exporting} onClose={() => setExporting(false)} title="Export appointments" className="max-w-xl">
        {exporting && <ExportDialog rows={rows} from={from} to={to} onClose={() => setExporting(false)} />}
      </Modal>
    </div>
  );
}
