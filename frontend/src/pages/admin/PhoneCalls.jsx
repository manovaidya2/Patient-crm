import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Copy, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, RefreshCw, Search, Smartphone } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { PageHeader, StatRow, StatTile } from '../../components/ui/Layout.jsx';
import CallRecording from '../../components/calls/CallRecording.jsx';

// Calls: every call with a patient's number from the staff phones (the call app sends each call and its recording to
// one webhook). Only calls with a number the CRM has of a patient are kept; recordings are kept compressed. The user
// name the app sends says who uses the phone. Admin only.
const field = 'rounded-lg border border-cardline bg-white px-3 py-2 text-[13px] outline-none focus:border-sage';
const DIRECTION = {
  incoming: ['Incoming', PhoneIncoming, 'text-[#1F6B41] bg-[#DCF0E3]'],
  outgoing: ['Outgoing', PhoneOutgoing, 'text-[#24476F] bg-[#E6EEF8]'],
  missed: ['Missed', PhoneMissed, 'text-[#8A1C25] bg-[#FDECEC]'],
  rejected: ['Rejected', PhoneOff, 'text-[#8A4B00] bg-[#FFF4E0]'],
  unknown: ['Call', PhoneCall, 'text-charcoal/70 bg-charcoal/[0.06]'],
};
const KIND = { patient: '', visit: 'registered, not converted', not_bought: 'Package Not Bought' };
const whenText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const talk = (sec) => {
  const s = Math.round(Number(sec) || 0);
  if (!s) return '0s';
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};
const slug = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

const stampOf = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 16).replace('T', '-').replace(':', '');
function Recording({ call }) {
  if (!call.recording.has) return <span className="text-[11.5px] text-charcoal/45">{call.recording.error || 'No recording'}</span>;
  return <CallRecording url={`/phone-calls/${call.id}/recording`} size={call.recording.size} fileName={`Call-${slug(call.matches[0]?.name) || call.phoneNumber}-${stampOf(call.startedAt)}`} />;
}

function CallRow({ call }) {
  const [label, Icon, tone] = DIRECTION[call.direction] || DIRECTION.unknown;
  return (
    <li className="grid gap-2 rounded-xl border border-cardline bg-white px-3 py-2.5 md:grid-cols-[150px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] md:items-center">
      <div className="flex items-center gap-2 md:block">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${tone}`}><Icon size={12} />{label}</span>
        <span className="block text-[12px] text-charcoal/65 md:mt-1">{whenText(call.startedAt)}</span>
      </div>
      <div className="min-w-0">
        {call.matches.map((m) => (
          <p key={`${m.kind}:${m.id}`} className="truncate text-[13.5px]">
            {m.patientId ? <Link to={`/admin/patients/${m.patientId}`} className="font-bold text-charcoal underline-offset-2 hover:underline">{m.name || 'Patient'}</Link> : <b>{m.name || 'Patient'}</b>}
            <span className="text-[12px] text-charcoal/55">{[m.code, m.label, KIND[m.kind]].filter(Boolean).map((t) => ` · ${t}`).join('')}</span>
          </p>
        ))}
        <p className="text-[12px] tabular-nums text-charcoal/60">{call.phoneNumber}</p>
      </div>
      <div className="text-[12.5px]">
        <span className="font-semibold text-charcoal">{call.durationSec ? talk(call.durationSec) : <span className="text-charcoal/50">Not picked up</span>}</span>
      </div>
      <div className="min-w-0 text-[12.5px]">
        <p className="flex items-center gap-1 truncate font-semibold text-charcoal"><Smartphone size={13} className="shrink-0 text-charcoal/45" />{call.userName || 'Unknown user'}</p>
        {call.userPhone && <p className="text-[11.5px] text-charcoal/50">{call.userPhone}</p>}
      </div>
      <Recording call={call} />
    </li>
  );
}

// The one webhook address to put in the call app on every phone.
function Setup() {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.get('/phone-calls/setup', { skipCache: true }).then(({ data }) => setInfo(data)).catch(() => setInfo({ failed: true })); }, []);
  if (!info) return null;
  const base = new URL(api.defaults.baseURL, window.location.origin).toString().replace(/\/$/, '');
  const url = info.configured ? `${base}${info.path}?key=${encodeURIComponent(info.key)}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select it by hand */ } };
  return (
    <details className="rounded-xl border border-cardline bg-white p-3">
      <summary className="cursor-pointer text-[13px] font-bold text-charcoal">Phone setup — the webhook address for the call app</summary>
      {info.failed ? <p className="mt-2 text-[12.5px] text-[#8A1C25]">Could not load the setup.</p> : !info.configured ? (
        <p className="mt-2 text-[12.5px] text-[#8A1C25]">The webhook key is not set on the server (CALL_APP_WEBHOOK_SECRET).</p>
      ) : (
        <div className="mt-2 space-y-2 text-[12.5px] text-charcoal/75">
          <p>Put this same address in the call app on <b>every</b> phone (method POST, the recording as the file "recording"). Keep it private: it is the key.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-[#F4F7F3] px-2.5 py-1.5 text-[12px]">{url}</code>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[12px] font-bold hover:border-sage">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="text-[11.5px] text-charcoal/55">Fields read: {info.fields.join(', ')}. In the app, set the user name to the person who uses that phone. Only calls with a patient's number (father's, mother's, WhatsApp, alternate …) are kept; every other call is dropped with its recording.{info.ownKey ? '' : ' (Uses the patient webhook key until CALL_APP_WEBHOOK_SECRET is set on the server.)'}</p>
        </div>
      )}
    </details>
  );
}

export default function PhoneCalls() {
  const [filters, setFilters] = useState({ from: '', to: '', user: '', direction: '', connected: false, recording: false, q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const set = (key) => (e) => { setPage(1); setFilters((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page };
      for (const key of ['from', 'to', 'user', 'direction']) if (filters[key]) params[key] = filters[key];
      if (filters.connected) params.connected = '1';
      if (filters.recording) params.recording = '1';
      if (filters.q.trim()) params.q = filters.q.trim();
      const { data: res } = await api.get('/phone-calls', { params, skipCache: true });
      setData(res);
      if (page === 1) setDevices(res.devices || []);
    } catch (e) { setError(e.response?.data?.message || 'Could not load the calls'); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);
  // A new call arrived from a phone: the first page refreshes by itself.
  useLiveEvent('phone-calls:changed', (payload) => { if (payload && page === 1) load(); });

  const items = data?.items || [];
  const summary = data?.summary || { calls: 0, connected: 0, talkSec: 0 };
  const userNames = [...new Set([...(data?.users || []).map((u) => u.userName), ...devices.map((d) => d.userName)].filter(Boolean))].sort();
  return (
    <div className="space-y-4">
      <PageHeader icon={PhoneCall} title="Calls" subtitle="Calls with patients from the staff phones, with their recordings (kept compressed). Only patient numbers are kept."
        actions={<button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-cardline bg-white px-3 py-2 text-[12.5px] font-bold text-charcoal/75 hover:border-sage disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>} />

      <Setup />

      {devices.length > 0 && (
        <section>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/55">Phones sending calls ({devices.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {devices.map((d) => (
              <div key={d.key} className="min-w-[180px] rounded-xl border border-cardline bg-white px-3 py-2 text-[12px]">
                <p className="flex items-center gap-1 font-bold text-charcoal"><Smartphone size={13} className="text-charcoal/45" />{d.userName || 'Unknown user'}</p>
                <p className="text-charcoal/55">Last call {whenText(d.lastSeenAt)}</p>
                <p className="text-charcoal/55"><b className="text-[#1F6B41]">{d.saved}</b> patient calls · {d.ignored} other calls dropped</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <StatRow>
        <StatTile label="Patient calls" value={summary.calls} hint={filters.from || filters.to ? 'in the dates chosen' : 'all time'} />
        <StatTile label="Picked up" value={summary.connected} tone="green" hint={summary.calls ? `${Math.round((summary.connected / summary.calls) * 100)}% of calls` : ''} />
        <StatTile label="Talk time" value={talk(summary.talkSec)} tone="soft" />
      </StatRow>

      {(data?.users || []).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.users.map((u) => (
            <button key={u.userName || 'unknown'} type="button" onClick={() => { setPage(1); setFilters((f) => ({ ...f, user: f.user === u.userName ? '' : u.userName })); }}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-[12px] ${filters.user === u.userName ? 'border-[#1F5F4A] bg-[#EEF3F0]' : 'border-cardline bg-white hover:border-sage'}`}>
              <b>{u.userName || 'Unknown user'}</b> <span className="text-charcoal/60">· {u.calls} calls · {u.connected} picked up · {talk(u.talkSec)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
          <input value={filters.q} onChange={set('q')} placeholder="Patient name, patient ID or number" className={`${field} w-full pl-9`} />
        </label>
        <select value={filters.user} onChange={set('user')} className={field} aria-label="Who used the phone">
          <option value="">Every phone user</option>
          {userNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={filters.direction} onChange={set('direction')} className={field} aria-label="Call type">
          <option value="">Every call</option>
          {['incoming', 'outgoing', 'missed', 'rejected'].map((key) => <option key={key} value={key}>{DIRECTION[key][0]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-charcoal/60">From<input type="date" value={filters.from} onChange={set('from')} className={field} /></label>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-charcoal/60">To<input type="date" value={filters.to} onChange={set('to')} className={field} /></label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/70"><input type="checkbox" checked={filters.connected} onChange={set('connected')} />Picked up only</label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/70"><input type="checkbox" checked={filters.recording} onChange={set('recording')} />With recording</label>
      </div>

      {error && <p className="rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13px] font-semibold text-[#8A1C25]">{error}</p>}
      {!data && loading ? <p className="py-10 text-center text-sm text-charcoal/55">Loading...</p> : items.length ? (
        <>
          <div className="hidden px-3 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/50 md:grid md:grid-cols-[150px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
            <span>Call</span><span>Patient · whose number</span><span>Duration</span><span>Phone user</span><span>Recording</span>
          </div>
          <ul className="space-y-2">{items.map((call) => <CallRow key={call.id} call={call} />)}</ul>
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-3 text-[12.5px]">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 font-bold disabled:opacity-40"><ChevronLeft size={14} />Newer</button>
              <span className="text-charcoal/60">Page {data.page} of {data.pages} · {data.total} calls</span>
              <button type="button" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 font-bold disabled:opacity-40">Older<ChevronRight size={14} /></button>
            </div>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-cardline bg-white/60 px-4 py-10 text-center text-sm text-charcoal/55">
          {Object.values(filters).some(Boolean) ? 'No call matches these filters.' : 'No patient call yet. Put the webhook address (Phone setup, above) in the call app on each phone; calls with a patient\'s number show here.'}
        </p>
      )}
    </div>
  );
}
