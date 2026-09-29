import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, History, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import RefundImages from '../../components/RefundImages.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';

const money = (amount) => `Rs ${Number(amount || 0).toLocaleString('en-IN')}`;
const dateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const labels = { all: 'All refunds', initiated: 'Refund pending', paid: 'Refund paid', settled: 'Settled' };
const colors = { initiated: 'bg-amber-50 text-amber-900', paid: 'bg-sky-50 text-sky-900', settled: 'bg-emerald-50 text-emerald-900' };
const inputClass = 'w-full rounded-md border border-cardline bg-offwhite-100 px-3 py-2 text-sm text-charcoal';

const Refunds = () => {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ initiated: 0, paid: 0, settled: 0 });
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState({ paymentMode: 'online', referenceNumber: '', payoutNote: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [files, setFiles] = useState([]);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/patients/refunds-ledger', { params: { status: status === 'all' ? undefined : status, search, page, limit: 20 }, forceRefresh: true, signal });
      setRows(data.refunds || []);
      setTotals(data.totals || { initiated: 0, paid: 0, settled: 0 });
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      if (!signal?.aborted) setError(err.response?.data?.message || 'Could not load refunds.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openAction = (row) => {
    setSelected(row);
    setFiles([]);
    setForm({ paymentMode: 'online', referenceNumber: '', payoutNote: '' });
    setSaveError('');
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const body = new FormData();
      Object.entries({ ...form, action: selected.status === 'initiated' ? 'pay' : 'settle' }).forEach(([key, value]) => body.append(key, value));
      files.forEach((file) => body.append('screenshot', file));
      await api.patch(`/patients/${selected.patientId}/stages/${selected.stage}/payments/${selected.paymentId}/refunds/${selected.id}`, body);
      setSelected(null);
      await load();
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Could not save refund.');
    } finally { setSaving(false); }
  };

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-sage">Accounts</p><h1 className="font-display text-xl font-bold text-charcoal sm:text-2xl">Refund Register</h1></div>
      <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[['Refund pending', totals.initiated], ['Total refunded', totals.paid + totals.settled], ['Settlement pending', totals.paid]].map(([label, amount]) => <Card key={label}><p className="text-xs font-semibold text-charcoal/70">{label}</p><p className="mt-1 text-xl font-bold text-charcoal">{loading ? '...' : money(amount)}</p></Card>)}
    </div>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Refund status">
        {Object.entries(labels).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`rounded-md px-3 py-2 text-xs font-semibold ${status === value ? 'bg-sage text-white' : 'text-charcoal hover:bg-offwhite-200'}`}>{label}</button>)}
      </div>
      <form className="flex w-full gap-2 sm:w-80" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
        <input aria-label="Search patients" placeholder="Patient name, ID or phone" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} />
        <button type="submit" title="Search" aria-label="Search" className="shrink-0 rounded-md border border-cardline p-2 text-sage"><Search size={18} /></button>
      </form>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-[#8C3B2E]">{error}</p>}
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-cardline px-4 py-3 text-sm text-charcoal"><h2 className="font-bold">Patient refunds</h2><span className="text-xs">{total} records</span></div>
      {loading ? <p className="p-8 text-center text-sm text-charcoal/70">Loading...</p> : rows.length === 0 ? <p className="p-8 text-center text-sm text-charcoal/70">No refunds found.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-xs text-charcoal">
          <thead className="bg-sage text-white"><tr>{['Patient', 'Refund amount', 'Reason', 'Requested', 'Refund paid on', 'Status', 'Actions'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-cardline-soft align-top last:border-0">
            <td className="px-4 py-3"><Link to={`/admin/patients/${row.patientId}`} className="font-bold text-sage hover:underline">{row.patientName}</Link><p className="mt-1">{row.patientCode || row.patientNumber || '-'} | Phase {row.stage}</p></td>
            <td className="whitespace-nowrap px-4 py-3"><strong>{money(row.amount)}</strong><p className="mt-1 text-charcoal/70">Received {money(row.originalAmount)}</p></td>
            <td className="max-w-56 break-words px-4 py-3">{row.reason}</td>
            <td className="px-4 py-3">{dateTime(row.initiatedAt)}<p className="mt-1 text-charcoal/70">{row.initiatedByName}</p></td>
            <td className="px-4 py-3">{row.paidAt ? dateTime(row.paidAt) : 'Not paid yet'}{row.paidAt && <p className="mt-1 text-charcoal/70">{row.paymentMode === 'cash' ? 'Cash' : 'Online'}{row.referenceNumber ? ` | ${row.referenceNumber}` : ''}</p>}</td>
            <td className="px-4 py-3"><span className={`inline-block whitespace-nowrap rounded px-2 py-1 font-semibold ${colors[row.status]}`}>{labels[row.status]}</span></td>
            <td className="px-4 py-3"><div className="flex items-center gap-2">
              {row.status !== 'settled' && <Button variant="outline" size="sm" onClick={() => openAction(row)}><Check size={13} />{row.status === 'initiated' ? 'Record refund paid' : 'Settle'}</Button>}
              <button type="button" onClick={() => setHistory(row)} title="Refund history" aria-label={`Refund history for ${row.patientName}`} className="rounded-md p-2 text-sage hover:bg-offwhite-200"><History size={17} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!loading && total > 0 && <div className="flex items-center justify-between border-t border-cardline px-4 py-2 text-xs text-charcoal"><span>Page {page} of {pages}</span><div className="flex gap-1"><button aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><button aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div></div>}
    </Card>
    <Modal open={Boolean(selected)} onClose={() => !saving && setSelected(null)} title={selected?.status === 'initiated' ? 'Record refund paid' : 'Settle refund'}>
      <form onSubmit={save} className="space-y-4 text-sm text-charcoal">
        <div><p className="font-bold">{selected?.patientName} - {money(selected?.amount)}</p><p className="mt-1">{selected?.reason}</p></div>
        {saveError && <p role="alert" className="text-[#8C3B2E]">{saveError}</p>}
        {selected?.status === 'initiated' ? <>
          <label className="block">Refund mode<select className={`${inputClass} mt-1`} value={form.paymentMode} onChange={(event) => setForm({ ...form, paymentMode: event.target.value })}><option value="online">Online</option><option value="cash">Cash</option></select></label>
          <label className="block">{form.paymentMode === 'online' ? 'UTR / transaction reference (optional)' : 'Cash receipt reference (optional)'}<input className={`${inputClass} mt-1`} value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} /></label>
          <CompactAttachments files={selected?.proofFiles || []} label="Saved images" />
          <RefundImages files={files} onChange={setFiles} disabled={saving} />
          <label className="block">Note (optional)<textarea rows={2} maxLength={2000} className={`${inputClass} mt-1`} value={form.payoutNote} onChange={(event) => setForm({ ...form, payoutNote: event.target.value })} /></label>
          <p className="text-xs text-charcoal/70">Confirm only after returning the money to the patient.</p>
        </> : <p>Confirm the refund of {money(selected?.amount)} matches your bank or cash record.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setSelected(null)}>Back</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : selected?.status === 'initiated' ? 'Confirm refund paid' : 'Confirm settlement'}</Button></div>
      </form>
    </Modal>
    <Drawer open={Boolean(history)} onClose={() => setHistory(null)} title="Refund history">
      {history && <div className="space-y-5 text-sm text-charcoal">
        <div><p className="font-bold">{history.patientName} - {money(history.amount)}</p><p className="mt-1">{history.reason}</p><p className="mt-1 text-xs">Phase {history.stage} | Payment {String(history.paymentId).slice(-8)}</p></div>
        {[
          ['Refund requested', history.initiatedAt, history.initiatedByName],
          ['Refund paid', history.paidAt, history.paidByName],
          ['Settlement confirmed', history.settledAt, history.settledByName],
        ].map(([label, date, name]) => <div key={label} className={`border-l-2 pl-3 ${date ? 'border-sage' : 'border-cardline'}`}><p className="font-semibold">{label}</p><p className="mt-1 text-xs">{date ? `${dateTime(date)} | ${name || '-'}` : 'Pending'}</p></div>)}
        {history.referenceNumber && <p>Transaction reference: {history.referenceNumber}</p>}
        {history.payoutNote && <p>Note: {history.payoutNote}</p>}
        <CompactAttachments files={history.proofFiles || []} label="Refund images" />
      </div>}
    </Drawer>
  </div>;
};

export default Refunds;
