import { useState } from 'react';
import { Layers } from 'lucide-react';
import api from '../../api/axios.js';

const PHASES = [1, 2, 3, 4, 5, 6];

// Which phase this visit is for. Reception picks it on the registration; the Post Counselor can change it here before
// converting. The purchase, PO and payment go into this phase. For an existing patient, phases already bought are locked.
export default function VisitPhase({ patient, data, editable, onData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = data.existingPatient || null;
  const used = new Set((existing?.phasesUsed || []).map((p) => p.number));
  const phase = Number(data.phase || 1);

  const change = async (event) => {
    const next = Number(event.target.value);
    setBusy(true); setError('');
    try {
      const { data: response } = await api.put(`/post-counseling/patients/${patient.id}/phase`, { phase: next });
      onData(response);
    } catch (err) { setError(err.response?.data?.message || 'Could not change the phase'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${existing ? 'border-sky-300 bg-sky-50 text-sky-950' : 'border-cardline bg-white/70 text-charcoal'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Layers size={15} aria-hidden="true" />
        <label htmlFor="visit-phase" className="font-semibold">This visit is for</label>
        {editable ? (
          <select id="visit-phase" value={phase} onChange={change} disabled={busy} className="rounded-md border border-cardline bg-white px-2 py-1 text-sm font-semibold text-charcoal">
            {PHASES.map((n) => <option key={n} value={n} disabled={used.has(n)}>Phase {n}{used.has(n) ? ' (already bought)' : ''}</option>)}
          </select>
        ) : <b>Phase {phase}</b>}
        {busy && <span className="text-xs text-charcoal/60">Saving...</span>}
      </div>
      {existing && (
        <p className="mt-1 text-[13px]">
          <b>Existing patient · {existing.patientCode}</b> ({existing.patientName}){existing.isActive ? '' : ' · closed, will be reopened'}.{' '}
          {existing.phasesUsed?.length ? `Phases already bought: ${existing.phasesUsed.map((p) => `Phase ${p.number}`).join(', ')}. ` : ''}
          The purchase goes into Phase {phase} of the same patient; no new patient is made.
        </p>
      )}
      {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
