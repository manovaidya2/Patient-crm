import { useEffect, useState } from 'react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import AttachmentPreviews from './ui/AttachmentPreviews.jsx';
import { RECORD_ROOM_UPLOAD_MAX_BYTES, RECORD_ROOM_UPLOAD_MAX_MB } from '../constants/recordRoom.js';

export default function ReplaceRecordDocumentModal({ document, onClose, onReplace, replaceAll = false }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setFiles([]); setError(''); }, [document?.id, replaceAll]);
  const submit = async (event) => {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy(true); setError('');
    try { await onReplace(document, replaceAll ? files : files[0]); onClose(); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Could not replace this paper'); }
    finally { setBusy(false); }
  };
  return <Modal open={Boolean(document)} onClose={() => !busy && onClose()} title={replaceAll ? 'Replace all papers' : 'Replace paper'} className="max-w-xl">
    <form onSubmit={submit} className="space-y-4">
      {replaceAll ? <p className="text-sm text-charcoal/70">Upload the complete new set of papers for <b>{document?.patientName}</b>. All current documents will be replaced after saving. Select images or PDFs in the required order (up to 30 files, {RECORD_ROOM_UPLOAD_MAX_MB} MB each).</p> : <p className="text-sm text-charcoal/70">Replace <b>{document?.fileName}</b> with the correct image or PDF. Its position in the record stays the same, and the combined PDF updates after saving.</p>}
      {!replaceAll && <AttachmentPreviews files={document ? [document] : []} label="Current paper" />}
      <label className="block space-y-1 text-sm font-semibold">Replacement images / PDFs<input aria-label="Replacement image / PDF" type="file" accept="image/jpeg,image/png,application/pdf" multiple={replaceAll} disabled={busy} className="block w-full rounded-lg border border-cardline bg-white p-2 text-sm" onChange={(event) => {
        const selected = Array.from(event.target.files || []);
        if (selected.length > (replaceAll ? 30 : 1) || selected.some((file) => file.size > RECORD_ROOM_UPLOAD_MAX_BYTES)) { setError(replaceAll ? `Select up to 30 files, each up to ${RECORD_ROOM_UPLOAD_MAX_MB} MB` : `Select one file up to ${RECORD_ROOM_UPLOAD_MAX_MB} MB`); setFiles([]); event.target.value = ''; return; }
        setFiles(selected); setError('');
      }} /></label>
      {replaceAll && files.length > 0 && <p className="text-xs font-semibold text-sage">{files.length} replacement file(s) selected</p>}
      <AttachmentPreviews files={files} label="Replacement paper" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !files.length}>{busy ? 'Replacing...' : replaceAll ? 'Replace all papers' : 'Save replacement'}</Button></div>
    </form>
  </Modal>;
}
