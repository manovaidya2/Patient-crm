import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search, UserRound, X } from 'lucide-react';
import api from '../../api/axios.js';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-offwhite-100 px-3 py-2 text-sm';

// New / edit enquiry: the patient's name and ID, looked up in the system as they are typed (name, Patient / appointment
// ID or phone). Picking a match links the enquiry to that patient, fills the name and ID, shows the patient's details
// and a link to the patient's page. Nothing found: the enquiry keeps the name typed.
export default function EnquiryPatientPicker({ draft, setDraft }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const linked = Boolean(draft.patientId);

  useEffect(() => {
    if (linked || query.trim().length < 2) { setResults([]); return undefined; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.get('/enquiries/patients', { params: { q: query.trim() }, skipCache: true })
        .then(({ data }) => { if (active) setResults(data.patients || []); })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, linked]);

  const type = (key, value) => { setDraft({ ...draft, [key]: value }); setQuery(value); };
  const pick = (p) => { setDraft({ ...draft, patientId: p.id, patientInfo: p, patientName: p.patientName, patientReference: p.patientCode }); setResults([]); setQuery(''); };
  const unlink = () => setDraft({ ...draft, patientId: '', patientInfo: null });

  if (linked) {
    const p = draft.patientInfo || { id: draft.patientId, patientName: draft.patientName, patientCode: draft.patientReference };
    const rows = [
      ['Patient ID', p.patientCode], ['Phone', [p.number, p.alternateNumber].filter(Boolean).join(' / ')], ['Parent / guardian', p.guardianName],
      ['Category', p.category], ['Age', p.age], ['Current phase', p.currentStage ? `Phase ${p.currentStage}` : ''], ['PCC', p.pcc], ['City', p.city],
      ['Status', p.approvalStatus ? `${p.approvalStatus === 'approved' ? 'Approved' : 'Approval pending'}${p.isActive === false ? ' · Closed' : ''}` : ''],
    ].filter(([, v]) => v);
    return (
      <div className="rounded-lg border border-sage/40 bg-[#F3F6F2] p-3 sm:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-charcoal"><UserRound size={16} className="text-sage" />{p.patientName}<span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sage">Patient in the system</span></p>
          <div className="flex items-center gap-3">
            <Link to={`/admin/patients/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><ExternalLink size={13} />Open patient details</Link>
            <button type="button" onClick={unlink} className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C3B2E] hover:underline"><X size={13} />Change patient</button>
          </div>
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {rows.map(([label, value]) => <div key={label} className="flex gap-1.5"><dt className="text-charcoal/55">{label}:</dt><dd className="font-semibold text-charcoal">{value}</dd></div>)}
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Patient name *<input className={input} required maxLength={150} value={draft.patientName} onChange={(e) => type('patientName', e.target.value)} placeholder="Type to find the patient" autoComplete="off" /></label>
        <label className="space-y-1 text-sm">Patient / appointment ID or phone<input className={input} maxLength={100} value={draft.patientReference} onChange={(e) => type('patientReference', e.target.value)} placeholder="e.g. A-251026-15" autoComplete="off" /></label>
      </div>
      {query.trim().length >= 2 && (
        <div className="rounded-lg border border-cardline bg-white">
          <p className="flex items-center gap-1.5 border-b border-cardline px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50"><Search size={12} />{searching ? 'Searching patients...' : results.length ? 'Patients in the system - pick one' : 'No patient found in the system'}</p>
          {results.length > 0 ? (
            <ul className="max-h-56 divide-y divide-cardline overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#F3F6F2]">
                    <span className="font-semibold text-charcoal">{p.patientName}</span> <span className="text-charcoal/60">· {p.patientCode}</span>
                    <span className="block text-xs text-charcoal/55">{[p.number, p.guardianName, p.category, `Phase ${p.currentStage}`, p.age && `age ${p.age}`].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !searching && <p className="px-3 py-2 text-xs text-charcoal/60">The enquiry is saved with the name typed. Try the Patient ID or phone number to find them.</p>}
        </div>
      )}
    </div>
  );
}
