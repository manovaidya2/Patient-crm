import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns3, Pencil, Plus, RefreshCw, Save, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';

const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const input = 'w-full min-w-0 rounded-md border border-cardline bg-offwhite-100 px-3 py-2 text-sm';
const types = { text: 'Text', textarea: 'Long text', phone: 'Phone', number: 'Number', date: 'Date', time: 'Time', select: 'Dropdown', checkbox: 'Checkbox' };
const blankColumn = { label: '', type: 'text', required: false, options: '' };

export default function ReceptionRegister({ kind }) {
  const [data, setData] = useState({ columns: [], rows: [], total: 0 });
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [draft, setDraft] = useState(null);
  const [columnOpen, setColumnOpen] = useState(false);
  const [column, setColumn] = useState(blankColumn);
  const [saving, setSaving] = useState(false);
  const endpoint = `/reception-registers/${kind}`;
  const title = kind === 'visitors' ? 'Visitor Register' : 'Incoming Parcels / Couriers';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(endpoint, { params: { search, date, page }, skipCache: true, signal: controller.signal });
        setData(result.data);
      } catch (err) { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load register'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, search, date, page, revision]);

  async function save(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setModalError('');
    try {
      if (columnOpen) {
        await api.post(`${endpoint}/columns`, { ...column, options: column.options.split(',').map((value) => value.trim()).filter(Boolean) });
        setColumnOpen(false);
      } else {
        if (draft._id) await api.patch(`${endpoint}/entries/${draft._id}`, { date: draft.date, values: draft.values });
        else await api.post(`${endpoint}/entries`, { date: draft.date, values: draft.values });
        setDraft(null);
      }
      setRevision((value) => value + 1);
    } catch (err) { setModalError(err.response?.data?.message || 'Could not save changes'); }
    finally { setSaving(false); }
  }
  const change = (key, value) => setDraft((current) => ({ ...current, values: { ...current.values, [key]: value } }));
  const field = (item) => {
    const props = { className: input, value: draft.values[item.key] || '', required: item.required, onChange: (event) => change(item.key, event.target.value) };
    if (item.type === 'checkbox') return <input type="checkbox" className="h-4 w-4 accent-sage" checked={draft.values[item.key] === 'true'} required={item.required} onChange={(event) => change(item.key, String(event.target.checked))} />;
    if (item.type === 'select') return <select {...props}><option value="">Select</option>{item.options.map((option) => <option key={option}>{option}</option>)}</select>;
    if (item.type === 'textarea') return <textarea {...props} rows={3} maxLength={2000} />;
    return <input {...props} type={item.type === 'phone' ? 'tel' : item.type} step={item.type === 'number' ? 'any' : undefined} maxLength={2000} />;
  };
  return <div className="space-y-4 text-charcoal">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-xl font-bold sm:text-2xl">{title}</h1><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setColumn(blankColumn); setModalError(''); setColumnOpen(true); }}><Columns3 size={16} />Add column</Button><Button size="sm" disabled={loading || !!error} onClick={() => { setModalError(''); setDraft({ date: date || today(), values: {} }); }}><Plus size={16} />Add entry</Button></div></header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="relative min-w-0 flex-1 basis-56"><span className="sr-only">Search register</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-sage" /><input className={`${input} !pl-10`} placeholder={kind === 'visitors' ? 'Search visitors, phone or purpose' : 'Search sender, recipient or tracking number'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <label className="space-y-1 text-xs font-semibold"><span className="block">Entry date</span><input className={input} type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={!date} onChange={(event) => { setDate(event.target.checked ? '' : today()); setPage(1); }} />All dates</label>
      <button title="Refresh register" aria-label="Refresh register" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="rounded-md border border-cardline p-2.5"><RefreshCw size={16} /></button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded-lg border border-cardline"><table className="w-full border-collapse text-center text-sm"><thead className="bg-[#56695D] text-xs font-bold text-white"><tr><th className="p-3">#</th><th className="min-w-[125px] p-3">Entry date</th>{data.columns.map((item) => <th key={item.key} className="min-w-[160px] p-3">{item.label}{item.required ? ' *' : ''}</th>)}<th className="min-w-[175px] p-3">Recorded by</th><th className="p-3">Actions</th></tr></thead><tbody>
      {loading ? <tr><td className="p-8" colSpan={data.columns.length + 4}>Loading...</td></tr> : data.rows.map((row, index) => <tr key={row._id} className="border-t border-cardline bg-offwhite-100 hover:bg-sage/5"><td className="p-3">{(page - 1) * 25 + index + 1}</td><td className="p-3">{row.date}</td>{data.columns.map((item) => <td key={item.key} className="max-w-[280px] border-l border-cardline p-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.type === 'checkbox' ? (row.values?.[item.key] === 'true' ? 'Yes' : 'No') : row.values?.[item.key] || '-'}</td>)}<td className="p-3 text-xs"><strong>{row.createdByName}</strong><span className="mt-1 block">{new Date(row.createdAt).toLocaleString('en-IN')}</span>{row.updatedAt !== row.createdAt && <span className="mt-1 block">Updated by {row.updatedByName}<br />{new Date(row.updatedAt).toLocaleString('en-IN')}</span>}</td><td className="p-3"><button title="Edit entry" aria-label="Edit entry" onClick={() => { setModalError(''); setDraft({ ...row, values: { ...row.values } }); }} className="rounded p-2 text-sage"><Pencil size={16} /></button></td></tr>)}
      {!loading && !error && !data.rows.length && <tr><td colSpan={data.columns.length + 4} className="p-8 text-charcoal/70">No entries found.</td></tr>}
    </tbody></table></div>
    <footer className="flex items-center justify-between text-xs"><span>{data.total} entries · Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span><div className="flex gap-2"><button title="Previous page" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="p-2 disabled:opacity-30"><ChevronLeft size={18} /></button><button title="Next page" aria-label="Next page" disabled={page * 25 >= data.total || loading} onClick={() => setPage(page + 1)} className="p-2 disabled:opacity-30"><ChevronRight size={18} /></button></div></footer>
    <Modal open={!!draft || columnOpen} onClose={() => { if (!saving) { setDraft(null); setColumnOpen(false); } }} title={columnOpen ? 'Add column' : draft?._id ? 'Edit entry' : 'Add entry'} className="max-w-2xl">
      <form onSubmit={save} className="space-y-4">{modalError && <p role="alert" className="text-sm text-red-700">{modalError}</p>}<fieldset disabled={saving} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {columnOpen ? <><label className="space-y-1 text-sm">Column name<input className={input} required maxLength={80} value={column.label} onChange={(event) => setColumn({ ...column, label: event.target.value })} /></label><label className="space-y-1 text-sm">Type<select className={input} value={column.type} onChange={(event) => setColumn({ ...column, type: event.target.value })}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{column.type === 'select' && <label className="space-y-1 text-sm sm:col-span-2">Options, separated by commas<textarea className={input} required value={column.options} onChange={(event) => setColumn({ ...column, options: event.target.value })} /></label>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={column.required} onChange={(event) => setColumn({ ...column, required: event.target.checked })} />Required</label></> : draft && <><label className="space-y-1 text-sm">Entry date *<input className={input} type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>{data.columns.map((item) => <label key={item.key} className="flex min-w-0 flex-col gap-1 text-sm">{item.label}{item.required ? ' *' : ''}{field(item)}</label>)}</>}
      </fieldset><div className="flex justify-end"><Button type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save'}</Button></div></form>
    </Modal>
  </div>;
}
