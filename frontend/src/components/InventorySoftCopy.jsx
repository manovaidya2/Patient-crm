import { useEffect, useState } from 'react';
import { Download, Printer, Upload } from 'lucide-react';
import api from '../api/axios.js';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';

export default function InventorySoftCopy({ item, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function upload(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) { setError('Maximum file size is 10 MB.'); return; }
    if (item.softCopy && !window.confirm(`Replace the soft copy for ${item.name}?`)) return;
    setBusy(true); setError('');
    try { const body = new FormData(); body.append('file', file); await api.post(`/clinic-inventory/${item.id}/soft-copy`, body); onSaved(); }
    catch (err) { setError(err.response?.data?.message || 'Upload failed. Use PDF, JPG or PNG.'); }
    finally { setBusy(false); }
  }
  async function view() {
    setBusy(true); setError('');
    try {
      const { data } = await api.get(`/clinic-inventory/${item.id}/soft-copy`, { responseType: 'blob', skipCache: true });
      setPreview({ url: URL.createObjectURL(data), mime: data.type });
    } catch { setError('Could not open soft copy. Refresh and try again.'); }
    finally { setBusy(false); }
  }
  function printImage() {
    const tab = window.open('', '_blank');
    if (!tab) { setError('Allow pop-ups to print this image.'); return; }
    tab.opener = null;
    tab.document.title = `${item.name} - Print`;
    const style = tab.document.createElement('style');
    style.textContent = '@page { margin: 10mm; } body { margin: 0; text-align: center; } img { max-width: 100%; max-height: 95vh; object-fit: contain; }';
    tab.document.head.append(style);
    const img = tab.document.createElement('img');
    img.alt = item.name;
    img.onload = () => { tab.focus(); tab.print(); };
    img.src = preview.url;
    tab.document.body.append(img);
  }
  return <div className="space-y-2 text-center text-xs">
    {item.softCopy ? <><p className="max-w-[180px] truncate font-semibold" title={item.softCopy.fileName}>{item.softCopy.fileName}</p><p className="text-charcoal/65">{item.softCopy.uploadedByName}<br />{new Date(item.softCopy.uploadedAt).toLocaleString('en-IN')}</p><button type="button" disabled={busy} onClick={view} className="inline-flex items-center gap-1 font-semibold text-sage disabled:opacity-50"><Printer size={14} />View / Print</button></> : <p className="text-charcoal/60">No soft copy</p>}
    <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-cardline px-2 py-1.5 text-sage ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={13} />{busy ? 'Please wait...' : item.softCopy ? 'Replace file' : 'Upload soft copy'}<input type="file" className="sr-only" aria-label={`Upload soft copy for ${item.name}`} accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={upload} /></label>
    {error && <p role="alert" className="max-w-[220px] text-red-700">{error}</p>}
    <Modal open={!!preview} onClose={() => setPreview(null)} title={`${item.name} - Soft copy`} className="max-w-4xl">{preview && <><div className="mb-3 flex flex-wrap justify-end gap-2"><a href={preview.url} download={item.softCopy?.fileName || 'soft-copy'} className="inline-flex items-center gap-1 text-sm font-semibold text-sage"><Download size={15} />Download</a>{preview.mime === 'application/pdf' ? <a href={preview.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-sage"><Printer size={15} />Open PDF / Print</a> : <Button size="sm" onClick={printImage}><Printer size={15} />Print</Button>}</div>{preview.mime === 'application/pdf' ? <iframe title="Soft copy PDF preview" src={preview.url} className="h-[65vh] w-full border border-cardline" /> : <img src={preview.url} alt={`${item.name} soft copy`} className="mx-auto max-h-[65vh] max-w-full object-contain" />}</>}</Modal>
  </div>;
}
