import { useCallback, useEffect, useMemo, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ClipboardCheck, MessageSquareText, Pencil, Plus, Save, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';

const inputClass = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15 disabled:bg-gray-50 disabled:text-charcoal/50';
const ROLE_LABEL = { admin: 'Admin', doctor: 'Doctor' };
const stamp = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const dayLabel = (date, options) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', options);
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function ProgressRing({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 26; const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`${done} of ${total} tasks done`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90"><circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-cardline" /><circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} className={pct === 100 ? 'stroke-emerald-600' : 'stroke-sage'} /></svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-charcoal">{pct}%</span>
    </div>
  );
}

function DayStrip({ days, selected, onSelect, today }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Select day">
      {days.map((d) => {
        const complete = d.total > 0 && d.done >= d.total;
        const missed = d.date < today && d.total > 0 && d.done < d.total;
        const tone = d.notOk ? 'bg-[#8C3B2E]' : complete ? 'bg-emerald-600' : missed ? 'bg-amber-500' : d.date === today ? 'bg-sage' : 'bg-cardline';
        return (
          <button key={d.date} type="button" role="tab" aria-selected={selected === d.date} onClick={() => onSelect(d.date)} className={`flex min-w-[58px] shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition ${selected === d.date ? 'border-sage bg-sage text-white shadow-sm' : 'border-cardline bg-white hover:border-sage/60'}`}>
            <span className={`text-[10px] font-semibold uppercase ${selected === d.date ? 'text-white/80' : 'text-charcoal/45'}`}>{d.date === today ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</span>
            <span className="text-lg font-bold leading-tight">{dayLabel(d.date, { day: '2-digit' })}</span>
            <span className={`mt-1 h-1.5 w-8 overflow-hidden rounded-full ${selected === d.date ? 'bg-white/30' : 'bg-cardline'}`}><span className={`block h-full ${selected === d.date ? 'bg-white' : tone}`} style={{ width: `${d.total ? Math.round((d.done / d.total) * 100) : 0}%` }} /></span>
            <span className={`mt-0.5 text-[10px] ${selected === d.date ? 'text-white/80' : 'text-charcoal/45'}`}>{d.done}/{d.total}{d.reviewed ? ' *' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewPanel({ item, canReview, onSave }) {
  const [verdict, setVerdict] = useState(item.review?.verdict || '');
  const [remark, setRemark] = useState(item.review?.remark || '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const dirty = verdict !== (item.review?.verdict || '') || remark !== (item.review?.remark || '');
  useEffect(() => { setVerdict(item.review?.verdict || ''); setRemark(item.review?.remark || ''); }, [item.review?.verdict, item.review?.remark]);

  const save = async () => { setSaving(true); try { await onSave(item, { verdict, remark }); setOpen(false); } finally { setSaving(false); } };
  const r = item.review;
  const badge = r?.verdict === 'ok' ? 'bg-emerald-100 text-emerald-800' : r?.verdict === 'not_ok' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : 'bg-sky-100 text-sky-800';

  if (!canReview) {
    if (!r) return null;
    return (
      <div className="mt-2 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-bold ${badge}`}>{r.verdict === 'ok' ? 'Checked - OK' : r.verdict === 'not_ok' ? 'Not done properly' : 'Remark'}</span><span className="text-charcoal/55">{ROLE_LABEL[r.role] || r.role} {r.by} - {stamp(r.at)}</span></p>
        {r.remark && <p className="mt-1 text-charcoal/80">{r.remark}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2">
      {r && !open && (
        <div className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-bold ${badge}`}>{r.verdict === 'ok' ? 'Checked - OK' : r.verdict === 'not_ok' ? 'Not done properly' : 'Remark'}</span><span className="text-charcoal/55">{ROLE_LABEL[r.role] || r.role} {r.by} - {stamp(r.at)}</span><button type="button" onClick={() => setOpen(true)} className="ml-auto font-semibold text-sage hover:underline">Edit</button></p>
          {r.remark && <p className="mt-1 text-charcoal/80">{r.remark}</p>}
        </div>
      )}
      {!r && !open && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage hover:underline"><MessageSquareText size={14} />Add remark</button>}
      {open && (
        <div className="space-y-2 rounded-lg border border-sage/40 bg-sage/5 p-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setVerdict(verdict === 'ok' ? '' : 'ok')} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${verdict === 'ok' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-cardline bg-white text-charcoal/70'}`}><ThumbsUp size={13} />Done properly</button>
            <button type="button" onClick={() => setVerdict(verdict === 'not_ok' ? '' : 'not_ok')} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${verdict === 'not_ok' ? 'border-[#8C3B2E] bg-[#8C3B2E] text-white' : 'border-cardline bg-white text-charcoal/70'}`}><ThumbsDown size={13} />Not done / not proper</button>
          </div>
          <textarea className={inputClass} rows={2} maxLength={1000} placeholder="Remark for the receptionist" value={remark} onChange={(e) => setRemark(e.target.value)} />
          <div className="flex gap-2"><Button size="sm" onClick={save} disabled={saving || !dirty}><Save size={14} />{saving ? 'Saving...' : 'Save remark'}</Button><Button size="sm" variant="outline" onClick={() => { setOpen(false); setVerdict(item.review?.verdict || ''); setRemark(item.review?.remark || ''); }}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
}

const ReceptionistChecklist = ({ compact = false }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN; // removing a task stays Admin-only
  const canManage = isAdminLike(user);
  const isReceptionist = user?.role === ROLES.RECEPTIONIST;
  const canReview = canManage || user?.role === ROLES.DOCTOR;
  const [today, setToday] = useState(todayLocal());
  const [date, setDate] = useState(todayLocal());
  const [receptionists, setReceptionists] = useState([]);
  const [receptionistId, setReceptionistId] = useState('');
  const [items, setItems] = useStaleState(`receptionist-checklist:${date}:${receptionistId}`, []);
  const [dayReview, setDayReview] = useStaleState(`receptionist-checklist:${date}:${receptionistId}:review`, null);
  const [days, setDays] = useStaleState(`receptionist-checklist:${receptionistId}:days`, []);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [dayRemark, setDayRemark] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [noteEditId, setNoteEditId] = useState(null); // task whose note box is open
  const [editingLabel, setEditingLabel] = useState('');
  const [manage, setManage] = useState(false);
  const [loading, setLoading] = useState(!items.length);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const userParam = canReview && receptionistId ? { userId: receptionistId } : {};
  const editable = isReceptionist && date === today;

  useEffect(() => {
    if (!canReview) return;
    api.get('/receptionist-checklist/receptionists', { skipCache: true }).then(({ data }) => {
      setReceptionists(data.receptionists || []);
      setReceptionistId((current) => current || data.receptionists?.[0]?.id || '');
    }).catch(() => setError('Receptionist list could not be loaded'));
  }, [canReview]);

  const load = useCallback(async () => {
    if (canReview && !receptionistId) { setLoading(false); return; }
    try {
      setError('');
      const [daily, summary] = await Promise.all([
        api.get('/receptionist-checklist/daily', { params: { date, ...userParam }, skipCache: true }),
        compact ? Promise.resolve(null) : api.get('/receptionist-checklist/summary', { params: { days: 14, ...userParam }, skipCache: true }),
      ]);
      setItems(daily.data.items || []);
      setDayReview(daily.data.dayReview || null);
      setDayRemark(daily.data.dayReview?.remark || '');
      if (daily.data.today) setToday(daily.data.today);
      setNoteDrafts(Object.fromEntries((daily.data.items || []).map((item) => [item.id, item.note || ''])));
      if (summary) setDays(summary.data.days || []);
    } catch (err) { setError(err.response?.data?.message || 'Checklist could not be loaded'); }
    finally { setLoading(false); }
  }, [date, receptionistId, canReview, compact]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!items.length) setLoading(true); load(); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(t); }, [notice]);
  // Past midnight the page must roll over to the new day by itself.
  useEffect(() => { const t = setInterval(() => { const now = todayLocal(); setToday((old) => { if (old !== now) { setDate((d) => (d === old ? now : d)); return now; } return old; }); }, 60000); return () => clearInterval(t); }, []);

  const total = items.length;
  const done = items.filter((item) => item.completed).length;
  const pending = total - done;
  const notOk = items.filter((item) => item.review?.verdict === 'not_ok').length;

  const updateRecord = async (item, changes) => {
    const next = { ...item, ...changes };
    setItems((current) => current.map((entry) => (entry.id === item.id ? next : entry)));
    try {
      const { data } = await api.put('/receptionist-checklist/records', { date, itemId: item.id, completed: next.completed, note: next.note });
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...data.record } : entry)));
      if (changes.completed !== undefined) { setNotice(changes.completed ? `Done: ${item.label}` : `Reopened: ${item.label}`); load(); }
      else { setNotice('Note saved'); setNoteEditId(null); }
    } catch (err) { setError(err.response?.data?.message || 'Checklist record could not be saved'); load(); }
  };
  const saveReview = async (item, { verdict, remark }) => {
    try {
      const { data } = await api.put('/receptionist-checklist/review', { date, receptionistId, itemId: item.id, verdict, remark });
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, review: data.record.review } : entry)));
      setNotice('Remark saved'); load();
    } catch (err) { setError(err.response?.data?.message || 'Remark could not be saved'); throw err; }
  };
  const saveDayReview = async () => {
    try {
      const { data } = await api.put('/receptionist-checklist/day-review', { date, receptionistId, remark: dayRemark });
      setDayReview(data.dayReview); setNotice(data.dayReview ? 'Day remark saved' : 'Day remark cleared'); load();
    } catch (err) { setError(err.response?.data?.message || 'Remark could not be saved'); }
  };
  const addItem = async (event) => {
    event.preventDefault();
    if (!newLabel.trim()) return;
    try { await api.post('/receptionist-checklist/items', { label: newLabel }); setNewLabel(''); setNotice('Task added. It appears on every day from now.'); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be added'); }
  };
  const saveItem = async (item) => {
    try { await api.patch(`/receptionist-checklist/items/${item.id}`, { label: editingLabel }); setEditingId(null); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be updated'); }
  };
  const deleteItem = async (item) => {
    if (!window.confirm(`Remove "${item.label}" from the daily checklist? Past records stay in history.`)) return;
    try { await api.delete(`/receptionist-checklist/items/${item.id}`); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be removed'); }
  };

  const who = useMemo(() => receptionists.find((r) => r.id === receptionistId)?.name, [receptionists, receptionistId]);
  const isToday = date === today;
  const allDone = total > 0 && done === total;

  return (
    <section className={`rounded-2xl border border-cardline bg-offwhite-100 shadow-sm ${compact ? 'mt-5 p-4' : 'mx-auto max-w-5xl p-4 sm:p-6'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <ProgressRing done={done} total={total} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/50">Daily operations</p>
          <h2 className="font-display text-xl font-bold text-charcoal">Reception checklist</h2>
          <p className="mt-0.5 text-sm text-charcoal/60">
            {isToday ? 'Today' : dayLabel(date, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
            {canReview && who ? ` - ${who}` : ''}
            {' - '}{allDone ? <span className="font-semibold text-emerald-700">All tasks done</span> : <span className="font-semibold text-amber-800">{pending} pending</span>}
            {notOk > 0 && <span className="font-semibold text-[#8C3B2E]"> - {notOk} marked not proper</span>}
          </p>
        </div>
        {canReview && (
          <label className="text-xs font-semibold uppercase text-charcoal/50">Receptionist
            <select className={`${inputClass} mt-1 min-w-[180px] normal-case`} value={receptionistId} onChange={(e) => setReceptionistId(e.target.value)}>{receptionists.length ? receptionists.map((r) => <option key={r.id} value={r.id}>{r.name}</option>) : <option value="">No receptionist</option>}</select>
          </label>
        )}
        {!compact && <label className="text-xs font-semibold uppercase text-charcoal/50"><span className="flex items-center gap-1"><CalendarDays size={12} />Date</span><input type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${inputClass} mt-1`} /></label>}
      </div>

      {!compact && days.length > 0 && <div className="mt-4"><DayStrip days={days} selected={date} onSelect={setDate} today={today} /><p className="mt-1 text-[11px] text-charcoal/45">Bar = tasks done that day. * = reviewed by admin / doctor. Green all done, amber missed, red marked not proper.</p></div>}

      {error && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
      {notice && <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</div>}
      {isReceptionist && !isToday && <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={15} />This is a past day. It can be viewed but not changed. Tasks are completed on the same day.</div>}
      {isReceptionist && isToday && !allDone && total > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal"><ClipboardCheck size={15} className="text-sage" />Complete every task today. Add a note if something could not be done.</div>}

      <ul className="mt-4 space-y-2">
        {loading ? <li className="py-10 text-center text-sm text-charcoal/50">Loading checklist...</li>
          : canReview && !receptionistId ? <li className="py-10 text-center text-sm text-charcoal/50">No active receptionist found.</li>
            : !items.length ? <li className="py-10 text-center text-sm text-charcoal/50">No checklist tasks have been added yet.</li>
              : items.map((item, index) => {
                const missed = !item.completed && !isToday && date < today;
                const tone = item.review?.verdict === 'not_ok' ? 'border-[#8C3B2E]/40 bg-[#8C3B2E]/5' : item.completed ? 'border-emerald-200 bg-emerald-50/50' : missed ? 'border-amber-300 bg-amber-50/60' : 'border-cardline bg-white';
                return (
                  <li key={item.id} className={`rounded-xl border p-3 transition ${tone}`}>
                    <div className="flex items-start gap-3">
                      <button type="button" disabled={!editable} onClick={() => updateRecord(item, { completed: !item.completed, note: noteDrafts[item.id] ?? item.note ?? '' })} className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${item.completed ? 'border-emerald-600 bg-emerald-600 text-white' : editable ? 'border-charcoal/30 bg-white hover:border-sage' : 'border-charcoal/20 bg-gray-50'}`} aria-label={item.completed ? `Reopen ${item.label}` : `Mark ${item.label} done`} aria-pressed={item.completed}>{item.completed && <Check size={15} strokeWidth={3} />}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-charcoal/35">{index + 1}</span>
                          {editingId === item.id
                            ? <input autoFocus value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} className={`${inputClass} max-w-md`} />
                            : <p className={`text-sm font-semibold ${item.completed ? 'text-charcoal/55 line-through' : 'text-charcoal'}`}>{item.label}</p>}
                          {item.completed ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Done {stamp(item.completedAt)}</span> : missed ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Not done</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-charcoal/50">Pending</span>}
                        </div>
                        {(() => {
                          const saved = item.note || '';
                          const editing = editable && (noteEditId === item.id || !saved);
                          if (editing) {
                            const draft = noteDrafts[item.id] ?? saved;
                            const submit = () => updateRecord(item, { note: draft.trim() });
                            return (
                              <div className="mt-2 flex gap-2">
                                <input autoFocus={noteEditId === item.id} value={draft} maxLength={1000} onChange={(e) => setNoteDrafts((c) => ({ ...c, [item.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape' && saved) { setNoteEditId(null); setNoteDrafts((c) => ({ ...c, [item.id]: saved })); } }} placeholder="Note (why it could not be done, details...)" className={inputClass} />
                                <button type="button" onClick={submit} disabled={draft.trim() === saved} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-cardline bg-white px-3 text-xs font-semibold text-sage hover:bg-sage/10 disabled:opacity-40"><Save size={14} />Save</button>
                                {saved && <button type="button" onClick={() => { setNoteEditId(null); setNoteDrafts((c) => ({ ...c, [item.id]: saved })); }} className="shrink-0 rounded-lg border border-cardline bg-white px-2 text-charcoal/50 hover:bg-gray-50" title="Cancel"><X size={14} /></button>}
                              </div>
                            );
                          }
                          if (!saved) return null;
                          return (
                            <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-offwhite-200/70 px-3 py-2">
                              <MessageSquareText size={14} className="mt-0.5 shrink-0 text-charcoal/40" />
                              <p className="min-w-0 flex-1 whitespace-pre-line break-words text-sm text-charcoal/80">{saved}</p>
                              {editable && <button type="button" onClick={() => { setNoteDrafts((c) => ({ ...c, [item.id]: saved })); setNoteEditId(item.id); }} className="shrink-0 rounded-md p-1 text-sage hover:bg-sage/10" title="Edit note (today only)" aria-label={`Edit note for ${item.label}`}><Pencil size={14} /></button>}
                            </div>
                          );
                        })()}
                        {!compact && <ReviewPanel item={item} canReview={canReview} onSave={saveReview} />}
                      </div>
                      {canManage && manage && (
                        <div className="flex shrink-0 gap-1">
                          {editingId === item.id ? <><button type="button" onClick={() => saveItem(item)} className="p-2 text-sage" title="Save"><Save size={16} /></button><button type="button" onClick={() => setEditingId(null)} className="p-2 text-charcoal/50" title="Cancel"><X size={16} /></button></> : <button type="button" onClick={() => { setEditingId(item.id); setEditingLabel(item.label); }} className="p-2 text-sage" title="Edit task"><Pencil size={16} /></button>}
                          {isAdmin && <button type="button" onClick={() => deleteItem(item)} className="p-2 text-red-700" title="Remove task"><Trash2 size={16} /></button>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
      </ul>

      {canReview && !compact && receptionistId && (
        <div className="mt-5 rounded-xl border border-cardline bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal"><MessageSquareText size={16} className="text-sage" />Remark for the day</h3>
          <p className="mt-0.5 text-xs text-charcoal/55">Overall feedback on {isToday ? 'today' : dayLabel(date, { day: '2-digit', month: 'short' })}. The receptionist sees it on this page.</p>
          <textarea className={`${inputClass} mt-2`} rows={2} maxLength={2000} value={dayRemark} onChange={(e) => setDayRemark(e.target.value)} placeholder="e.g. Cash register was not matched, rest of the work was fine." />
          <div className="mt-2 flex flex-wrap items-center gap-3"><Button size="sm" onClick={saveDayReview} disabled={dayRemark === (dayReview?.remark || '')}><Save size={14} />Save day remark</Button>{dayReview && <span className="text-xs text-charcoal/55">Last by {ROLE_LABEL[dayReview.role] || dayReview.role} {dayReview.by}, {stamp(dayReview.at)}</span>}</div>
        </div>
      )}
      {!canReview && !compact && dayReview && (
        <div className="mt-5 rounded-xl border border-sage/40 bg-sage/5 p-4"><p className="flex items-center gap-2 text-sm font-bold text-charcoal"><MessageSquareText size={16} className="text-sage" />Remark for the day</p><p className="mt-1 text-sm text-charcoal/80">{dayReview.remark}</p><p className="mt-1 text-xs text-charcoal/55">{ROLE_LABEL[dayReview.role] || dayReview.role} {dayReview.by} - {stamp(dayReview.at)}</p></div>
      )}

      {canManage && !compact && (
        <div className="mt-5 border-t border-cardline pt-4">
          <button type="button" onClick={() => setManage((v) => !v)} className="text-sm font-semibold text-sage hover:underline">{manage ? 'Done managing tasks' : 'Manage daily tasks (add / edit / remove)'}</button>
          {manage && <form onSubmit={addItem} className="mt-3 flex gap-2"><input required value={newLabel} maxLength={200} onChange={(e) => setNewLabel(e.target.value)} placeholder="New daily task for the receptionist" className={inputClass} /><Button type="submit"><Plus size={16} />Add task</Button></form>}
          {manage && <p className="mt-1 text-xs text-charcoal/50">A task added here must be completed every day from the day it is added.</p>}
        </div>
      )}
    </section>
  );
};

export default ReceptionistChecklist;
