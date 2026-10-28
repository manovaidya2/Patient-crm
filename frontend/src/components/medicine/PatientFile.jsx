import { useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../../api/axios.js';
import { CompactAttachments } from '../ui/Attachments.jsx';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// For lists: loads the patient's file only when asked.
export function PatientFileButton({ patientId }) {
  const [documents, setDocuments] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (documents) return <PatientFile documents={documents} className="mt-2" />;
  const open = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.get(`/medicine-jobs/patient-file/${patientId}`, { skipCache: true }); setDocuments(data.documents || []); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the patient file'); }
    finally { setBusy(false); }
  };
  return (
    <span className="mt-2 inline-flex items-center gap-2">
      <button type="button" onClick={open} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline disabled:opacity-50"><FileText size={13} />{busy ? 'Loading...' : 'Patient file (Records Room)'}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

// The patient's whole file from the Records Room, read with a medicine request instead of an uploaded prescription.
export default function PatientFile({ documents = [], className = '' }) {
  return (
    <div className={`rounded-lg border border-cardline bg-white/70 px-3 py-2 text-sm ${className}`}>
      <p className="flex items-center gap-1.5 font-semibold text-charcoal"><FileText size={14} aria-hidden="true" />Patient file (Records Room)</p>
      {documents.length ? (
        <>
          <CompactAttachments files={documents.map((d) => ({ url: d.url, fileName: d.fileName }))} label="Patient file" />
          <p className="mt-1 text-[11.5px] text-charcoal/55">
            {documents.map((d) => [d.pageCount ? `${d.pageCount} pages` : '', d.updatedAt ? `updated ${day(d.updatedAt)}` : '', d.shelfNumber ? `shelf ${d.shelfNumber}` : ''].filter(Boolean).join(' · ')).filter(Boolean).join(' | ')}
          </p>
        </>
      ) : <p className="mt-1 text-[12.5px] text-[#9C6B2E]">No patient file in the Records Room yet. Ask Reception to scan the patient's file into the Records Room.</p>}
    </div>
  );
}
