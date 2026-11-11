import { useState } from 'react';
import { AlarmClock, Check, ChevronDown, Clock, History, PhoneCall, Send } from 'lucide-react';
import Badge from '../ui/Badge.jsx';

// Shared pieces of a patient query (Doctor Advice): the doctor's voice answer, where the query stands, the
// question-and-answer thread (every time the doctor was asked), and every step with its time.
const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export const formatDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-');
const shortTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
export const waitedFor = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
};

// The doctor's recorded advice, played where the advice is read.
export const VoiceAdvice = ({ voice }) => (voice?.url ? (
  <div className="mt-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Voice advice{voice.durationSec ? ` · ${Math.floor(voice.durationSec / 60)}:${String(voice.durationSec % 60).padStart(2, '0')}` : ''}</p>
    <audio controls preload="metadata" src={`${SERVER_BASE}${voice.url}`} className="mt-1 h-10 w-full max-w-md" />
  </div>
) : null);

// [label, badge tone] of each place a query can be.
export const PROGRESS = {
  with_doctor: ['Waiting for doctor', 'amber'],
  to_send: ['Answer ready - send to patient', 'orange'],
  follow_up: ['Sent - follow-up', 'purple'],
  solved: ['Solved', 'green'],
};

export const OUTCOME_TONE = { satisfied: 'green', not_satisfied: 'danger', not_reachable: 'amber', call_back: 'amber' };

// Raised -> answered -> sent -> follow-up -> solved on one slim line (hover a step for who did it).
export function ProgressSteps({ row }) {
  const lastFollowUp = row.followUps?.[row.followUps.length - 1];
  const steps = [
    ['Raised', row.askedAt || row.createdAt, row.requestedByName],
    ['Doctor answered', row.adviceGivenAt, row.adviceGivenByName],
    ['Sent to patient', row.sentToPatientAt, row.sentToPatientByName],
    [lastFollowUp ? lastFollowUp.outcomeLabel : 'Follow-up', lastFollowUp?.at, lastFollowUp?.byName],
    ['Solved', row.resolvedAt, row.resolvedByName],
  ];
  const current = steps.findIndex(([, at]) => !at);
  return (
    <ol className="flex flex-wrap items-center gap-y-1.5">
      {steps.map(([label, at, by], i) => {
        const done = Boolean(at) && (i !== 3 || row.progress === 'solved' || lastFollowUp?.outcome === 'satisfied');
        const isNow = i === current || (i === 3 && Boolean(at) && !done);
        return (
          <li key={i} className="flex items-center">
            {i > 0 && <span className={`mx-1 h-px w-3 sm:w-5 ${done || isNow ? 'bg-[#1F6B41]/40' : 'bg-charcoal/15'}`} />}
            <span title={at ? `${label} · ${formatDateTime(at)}${by ? ` · ${by}` : ''}` : label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${done ? 'border-[#B7D7C2] bg-[#EEF7F1] text-[#1F6B41]' : isNow ? 'border-[#F5C08B] bg-[#FFF6EC] text-[#C2410C]' : 'border-cardline bg-white text-charcoal/40'}`}>
              {done ? <Check size={11} strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full ${isNow ? 'bg-[#F97316]' : 'bg-charcoal/25'}`} />}
              {label}
              {at && <span className="font-normal opacity-75">· {shortTime(at)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// The rounds of one query as they happened: the patient's question, the doctor's answer, sending it to the patient
// and the follow-ups - then the next question if the PCC asked the doctor again.
// waiting(round) renders the answer box while the doctor has not answered the latest question.
export function QueryThread({ row, waiting }) {
  const current = {
    query: row.query, askedAt: row.askedAt || row.createdAt, askedByName: row.requestedByName, isUrgent: row.isUrgent,
    advice: row.advice, adviceVoice: row.adviceVoice, adviceGivenAt: row.adviceGivenAt, adviceGivenByName: row.adviceGivenByName,
    sentToPatientAt: row.sentToPatientAt, sentToPatientByName: row.sentToPatientByName, sentViaLabel: row.sentViaLabel, sentNote: row.sentNote, followUps: row.followUps || [],
  };
  const rounds = [...(row.rounds || []), current];
  const many = rounds.length > 1;
  return (
    <ol className="space-y-2.5">
      {rounds.map((r, i) => {
        const latest = i === rounds.length - 1;
        const answered = Boolean(r.advice || r.adviceVoice?.url);
        const n = many ? i + 1 : '';
        return (
          <li key={i} className={`rounded-lg border p-3 ${latest ? 'border-cardline bg-white' : 'border-dashed border-cardline bg-white/55'}`}>
            {many && <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/45">{i === 0 ? 'First question' : `Asked again (${i + 1} of ${rounds.length})`}{latest ? ' · latest' : ''}</p>}
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-[#5B7B65] px-1.5 text-[11px] font-bold text-white">Q{n}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-charcoal/55"><b className="text-charcoal/80">Patient&apos;s question</b> · {formatDateTime(r.askedAt)}{r.askedByName ? ` · raised by ${r.askedByName}` : ''}{r.isUrgent ? <b className="ml-1 text-[#B42318]">EMERGENCY</b> : null}</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-charcoal">{r.query}</p>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2.5 pl-3 sm:pl-9">
              <span className={`mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${answered ? 'bg-[#2F5E7A]' : 'bg-charcoal/25'}`}>A{n}</span>
              <div className={`min-w-0 flex-1 rounded-lg px-3 py-2 ${answered ? 'bg-[#EEF4F8]' : 'bg-[#FFF8EE]'}`}>
                {answered ? <>
                  <p className="text-[11px] text-charcoal/55"><b className="text-[#2F5E7A]">Doctor&apos;s answer</b> · {formatDateTime(r.adviceGivenAt)}{r.adviceGivenByName ? ` · ${r.adviceGivenByName}` : ''}</p>
                  {r.advice && <p className="mt-0.5 whitespace-pre-line text-sm text-charcoal">{r.advice}</p>}
                  <VoiceAdvice voice={r.adviceVoice} />
                </> : latest && waiting ? waiting(r) : <p className="flex items-center gap-1.5 text-sm text-[#9C6B2E]"><Clock size={14} />Waiting for the doctor · {waitedFor(r.askedAt)}</p>}
              </div>
            </div>
            {(r.sentToPatientAt || r.followUps?.length > 0) && (
              <ul className="mt-2.5 space-y-1.5 border-t border-dashed border-cardline pl-3 pt-2 text-xs sm:pl-9">
                {r.sentToPatientAt && <li className="flex flex-wrap items-center gap-1.5"><Send size={12} className="text-sage" /><b className="text-charcoal">Sent to patient</b><span className="text-charcoal/60">· {r.sentViaLabel} · {formatDateTime(r.sentToPatientAt)}{r.sentToPatientByName ? ` · ${r.sentToPatientByName}` : ''}</span>{r.sentNote && <span className="w-full pl-5 text-charcoal/70">{r.sentNote}</span>}</li>}
                {(r.followUps || []).map((f) => (
                  <li key={f.id || f.at} className="flex flex-wrap items-center gap-1.5"><PhoneCall size={12} className="text-sage" /><Badge tone={OUTCOME_TONE[f.outcome] || 'default'}>{f.outcomeLabel}</Badge><span className="text-charcoal/60">{formatDateTime(f.at)}{f.byName ? ` · ${f.byName}` : ''}{f.nextAt ? ` · next call ${formatDateTime(f.nextAt)}` : ''}</span>{f.note && <span className="w-full pl-5 text-charcoal/70">{f.note}</span>}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// How long the latest question has waited, and how often the PCC rang the doctor.
export function WaitingForDoctor({ row, you = false }) {
  const last = row.alarms?.[row.alarms.length - 1];
  return <>
    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#9C6B2E]"><Clock size={14} />{you ? 'Waiting for your answer' : 'Waiting for the doctor'} · {waitedFor(row.askedAt || row.createdAt)}</p>
    {row.alarms?.length > 0 && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#B42318]"><AlarmClock size={12} />Alarm rung {row.alarms.length} time{row.alarms.length === 1 ? '' : 's'} · last {formatDateTime(row.lastAlarmAt)}{last?.byName ? ` by ${last.byName}` : ''}{last?.note ? ` - "${last.note}"` : ''}</p>}
  </>;
}

// Every step of the query with its exact time (who did what, when).
export function QueryTimeline({ timeline = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!timeline.length) return null;
  return (
    <div className="rounded-lg border border-cardline bg-white/60">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-charcoal/70">
        <span className="flex items-center gap-1.5"><History size={13} />All steps with time ({timeline.length})</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-cardline px-3 py-2">
          {timeline.map((t, i) => (
            <li key={`${t.at}-${i}`} className="grid gap-x-3 text-xs sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="font-mono text-[11px] text-charcoal/55">{formatDateTime(t.at)}</span>
              <span><b className="text-charcoal">{t.action}</b>{t.byName ? <span className="text-charcoal/50"> · {t.byName}</span> : null}{t.details ? <span className="block whitespace-pre-line text-charcoal/65">{t.details}</span> : null}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
