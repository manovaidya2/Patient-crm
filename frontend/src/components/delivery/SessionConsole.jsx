import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { errText, field, fmtDT } from './deliveryUi.js';

const SECTIONS = [
  ['pre', 'Before starting'],
  ['sop', 'Session steps'],
  ['integrated', 'Reviews that ride on this follow-up'],
  ['teachback', 'Parent teach-back'],
];
const pill = (on, tone) => `rounded-lg border px-3 py-1.5 text-xs font-bold transition ${on ? tone : 'border-cardline bg-white text-charcoal/60 hover:border-sage/50'}`;

// The session console: every line of the session is marked Done or N/A, then the closing form (red flag, parent
// understanding, home task, recording). Only then is the session closed. A red flag goes to the doctor as an urgent query.
export default function SessionConsole({ session, options, onClose, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [close, setClose] = useState({ redFlag: null, concern: '', understanding: '', homeTask: '', recording: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const groups = useMemo(() => SECTIONS.map(([key, title]) => [title, session.lines.filter((line) => line.section === key)]).filter(([, lines]) => lines.length), [session.lines]);
  const answered = session.lines.filter((line) => answers[line.key]?.answer).length;
  const setAnswer = (key, patch) => setAnswers((old) => ({ ...old, [key]: { ...old[key], ...patch } }));
  const allDone = () => setAnswers((old) => Object.fromEntries(session.lines.map((line) => [line.key, { reason: '', ...old[line.key], answer: old[line.key]?.answer || 'done' }])));

  const submit = async (event) => {
    event.preventDefault();
    const missing = session.lines.find((line) => !answers[line.key]?.answer);
    if (missing) { setError(`Mark "${missing.text}" as Done or N/A`); return; }
    if (close.redFlag === null) { setError('Answer the red flag question: Yes or No'); return; }
    if (close.redFlag && close.concern.trim().length < 5) { setError('Write the red flag concern for the doctor'); return; }
    if (!close.understanding) { setError('Choose the parent understanding'); return; }
    if (!close.recording) { setError('Choose the recording status'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit({
        checklist: session.lines.map((line) => ({ key: line.key, answer: answers[line.key].answer, reason: answers[line.key].answer === 'na' ? (answers[line.key].reason || '') : '' })),
        close,
      });
    } catch (err) { setError(errText(err, 'The session could not be closed')); setBusy(false); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={session.title} className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-charcoal/60">{fmtDT(session.dateTime)} · {session.role === 'doctor' ? 'Doctor review (the PCC arranges it and fills this form)' : 'PCC session'}{session.mode ? ` · ${session.mode}` : ''}{session.duration ? ` · about ${session.duration} min` : ''}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cardline bg-white px-3 py-2">
          <p className="text-xs font-bold text-charcoal/70">{answered} of {session.lines.length} lines answered</p>
          <button type="button" onClick={allDone} className="text-xs font-bold text-sage hover:underline">Mark the unanswered lines Done</button>
        </div>

        {groups.map(([title, lines]) => (
          <fieldset key={title} className="space-y-2">
            <legend className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{title}</legend>
            {lines.map((line) => {
              const row = answers[line.key] || {};
              return (
                <div key={line.key} className="rounded-lg border border-cardline bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm text-charcoal">{line.text}</p>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" aria-pressed={row.answer === 'done'} onClick={() => setAnswer(line.key, { answer: 'done' })} className={pill(row.answer === 'done', 'border-[#2F8F5B] bg-[#E6F2EA] text-[#1F6B41]')}>Done</button>
                      <button type="button" aria-pressed={row.answer === 'na'} onClick={() => setAnswer(line.key, { answer: 'na' })} className={pill(row.answer === 'na', 'border-[#B45309] bg-[#FBF0DC] text-[#7C5B2E]')}>N/A</button>
                    </div>
                  </div>
                  {row.answer === 'na' && <input value={row.reason || ''} maxLength={300} onChange={(e) => setAnswer(line.key, { reason: e.target.value })} placeholder="Why it does not apply (short reason)" className={`mt-2 ${field}`} />}
                </div>
              );
            })}
          </fieldset>
        ))}

        <fieldset className="space-y-3 rounded-xl border-2 border-[#FDBA74] bg-[#FFF7ED] p-3">
          <legend className="px-1 text-[10.5px] font-bold uppercase tracking-wide text-[#C2410C]">Closing form</legend>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-charcoal"><AlertTriangle size={15} className="text-[#C2410C]" />Any red flag in this session? *</p>
            <div className="mt-1.5 flex gap-2">
              <button type="button" aria-pressed={close.redFlag === false} onClick={() => setClose((c) => ({ ...c, redFlag: false }))} className={pill(close.redFlag === false, 'border-[#2F8F5B] bg-[#E6F2EA] text-[#1F6B41]')}>No</button>
              <button type="button" aria-pressed={close.redFlag === true} onClick={() => setClose((c) => ({ ...c, redFlag: true }))} className={pill(close.redFlag === true, 'border-[#DC2626] bg-[#FDE2E1] text-[#9F1D1D]')}>Yes, tell the doctor</button>
            </div>
            {close.redFlag && <textarea rows={2} maxLength={1000} value={close.concern} onChange={(e) => setClose((c) => ({ ...c, concern: e.target.value }))} placeholder="What is the concern? It goes to the doctor as an urgent query." className={`mt-2 ${field}`} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-charcoal">Parent understanding *
              <select value={close.understanding} onChange={(e) => setClose((c) => ({ ...c, understanding: e.target.value }))} className={`mt-1.5 ${field}`}><option value="">Select</option>{Object.entries(options.understanding).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
            </label>
            <label className="block text-sm font-medium text-charcoal">Recording *
              <select value={close.recording} onChange={(e) => setClose((c) => ({ ...c, recording: e.target.value }))} className={`mt-1.5 ${field}`}><option value="">Select</option>{Object.entries(options.recording).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
            </label>
          </div>
          <label className="block text-sm font-medium text-charcoal">Home task given to the parent
            <textarea rows={2} maxLength={1000} value={close.homeTask} onChange={(e) => setClose((c) => ({ ...c, homeTask: e.target.value }))} placeholder="What the parent does till the next session" className={`mt-1.5 ${field}`} />
          </label>
        </fieldset>

        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Not now</Button>
          <Button type="submit" disabled={busy}><CheckCircle2 size={15} />{busy ? 'Closing...' : 'Close session'}</Button>
        </div>
      </form>
    </Modal>
  );
}
