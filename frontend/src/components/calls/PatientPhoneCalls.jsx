import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PhoneCall, PhoneOff, RefreshCw, Smartphone } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import CallRecording from './CallRecording.jsx';

// A patient's Calls tab: every call from the staff phones (call app) on this patient's numbers, newest first, with the
// recording. "Call" (page header) looks for the calls of the last 10 minutes and keeps watching for 10 minutes: a call
// comes in when it ends on the phone, and shows here by itself.
const WINDOW_MS = 10 * 60000;
const POLL_MS = 20000;
const whenText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const talk = (sec) => { const s = Math.round(Number(sec) || 0); const m = Math.floor(s / 60); return m ? `${m} min ${s % 60} sec` : `${s} sec`; };
const talkedOn = (call) => call.durationSec > 0 && !['missed', 'rejected'].includes(call.direction);
const fileStamp = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 16).replace('T', '-').replace(':', '');

export default function PatientPhoneCalls({ patientId, patientName = '', searchAt = 0 }) {
  const [calls, setCalls] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/patients/${patientId}/phone-calls`, { skipCache: true });
      setCalls(data.calls || []); setError('');
    } catch (e) { setError(e.response?.data?.message || 'Could not load the calls'); }
    finally { setLoading(false); }
  }, [patientId]);
  useEffect(() => { load(); }, [load, searchAt]);
  // A call of this patient came in from a phone: the list refreshes.
  useLiveEvent('phone-calls:changed', (payload) => { if (!payload || (payload.patients || []).includes(String(patientId))) load(); });
  // After "Call": checked again every 20 seconds for 10 minutes too (in case the live connection is down).
  const watching = searchAt > 0 && Date.now() - searchAt < WINDOW_MS;
  useEffect(() => {
    if (!watching) return undefined;
    const timer = window.setInterval(() => { setTick((n) => n + 1); load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [watching, load]);

  const list = calls || [];
  // Going on in the 10 minutes before "Call" (or since): ended at most 10 min before (a long talk started earlier).
  const isRecent = (call) => searchAt > 0 && new Date(call.startedAt).getTime() + (call.durationSec || 0) * 1000 >= searchAt - WINDOW_MS;
  const recent = list.filter(isRecent);
  const name = String(patientName || 'patient').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'patient';
  return (
    <section className="space-y-3 rounded-xl border border-cardline bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-[15px] font-bold text-charcoal">Phone calls</h3>
          <p className="text-[12px] text-charcoal/55">Call app वाले staff phones से इस patient के numbers (father / mother / WhatsApp …) पर हुई calls — recording के साथ।</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-cardline bg-white px-3 py-1.5 text-[12px] font-bold text-charcoal/75 hover:border-sage disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </div>

      {searchAt > 0 && calls && (recent.length ? (
        <p className="flex items-center gap-2 rounded-lg bg-[#E7F2EC] px-3 py-2 text-[12.5px] font-semibold text-[#1F4F3D]"><CheckCircle2 size={15} />पिछले 10 min में {recent.length} call मिली{watching ? ' — नई call आते ही यहाँ जुड़ जाएगी' : ''}।</p>
      ) : watching ? (
        <p className="flex items-center gap-2 rounded-lg bg-[#FFF7E8] px-3 py-2 text-[12.5px] font-semibold text-[#7A4A06]"><Loader2 size={15} className="animate-spin" />पिछले 10 min में अभी कोई call नहीं मिली। Phone पर call ख़त्म होते ही यहाँ आ जाएगी — 10 min तक अपने-आप देख रहे हैं।</p>
      ) : (
        <p className="rounded-lg bg-charcoal/[0.05] px-3 py-2 text-[12.5px] font-semibold text-charcoal/65">पिछले 10 min में कोई call नहीं मिली। Call app वाले phone से call करें, फिर "Call" दबाएँ।</p>
      ))}

      {error && <p className="rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[12.5px] font-semibold text-[#8A1C25]">{error}</p>}
      {!calls && loading ? <p className="py-6 text-center text-[13px] text-charcoal/55">Loading...</p> : list.length ? (
        <ul className="space-y-2">
          {list.map((call) => {
            const talked = talkedOn(call);
            const fresh = isRecent(call);
            return (
              <li key={call.id} className={`rounded-xl border bg-white px-3 py-2.5 ${fresh ? 'border-[#1F5F4A] ring-1 ring-[#1F5F4A]/20' : 'border-cardline'}`}>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:items-center">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${talked ? 'bg-[#E7F2EC] text-[#1F5F4A]' : 'bg-[#FDECEC] text-[#8A1C25]'}`}>{talked ? <PhoneCall size={14} /> : <PhoneOff size={14} />}</span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                        <b className={talked ? 'text-[#1F4F3D]' : 'text-[#8A1C25]'}>{call.directionLabel} · {talked ? `बात हुई ${talk(call.durationSec)}` : 'नहीं उठा / नहीं लगा'}</b>
                        <span className="text-[12px] text-charcoal/65">{whenText(call.startedAt)}</span>
                        {fresh && <span className="rounded bg-[#DCF0E3] px-1.5 text-[11px] font-bold text-[#166534]">पिछले 10 min</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-charcoal/55">{call.phoneNumber}{call.whose && <span>· {call.whose}</span>}{call.userName && <span className="inline-flex items-center gap-0.5">· <Smartphone size={11} />{call.userName} का phone</span>}</p>
                    </div>
                  </div>
                  {call.recording ? <CallRecording url={`/patients/${patientId}/phone-calls/${call.id}/recording`} size={call.size} fileName={`Call-${name}-${fileStamp(call.startedAt)}`} /> : <span className="text-[11.5px] text-charcoal/45">No recording</span>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-cardline px-3 py-6 text-center text-[13px] text-charcoal/55">इस patient की अभी कोई phone call नहीं आई। (पुराने calling system की calls Activity tab में हैं।)</p>
      )}
    </section>
  );
}
