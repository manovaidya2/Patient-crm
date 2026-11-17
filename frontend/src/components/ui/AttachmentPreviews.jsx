import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileText } from 'lucide-react';
import Modal from './Modal.jsx';

const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function AttachmentPreview({ file, label }) {
  const [localUrl, setLocalUrl] = useState('');
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const local = file instanceof Blob;
  useEffect(() => {
    if (!local) return undefined;
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, local]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);
  const rawUrl = file.url || '';
  const url = local ? localUrl : rawUrl.startsWith('/uploads/') ? `${SERVER_BASE}${rawUrl}` : /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
  const name = file.name || file.fileName || label;
  const type = file.type || file.mimeType || '';
  const extensionSource = `${name} ${rawUrl.split(/[?#]/)[0]}`;
  const image = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)(?:\s|$)/i.test(extensionSource);
  const pdf = type === 'application/pdf' || /\.pdf(?:\s|$)/i.test(extensionSource);
  if (!url) return null;
  return <div className="mt-2 min-w-0 space-y-1">
    <button ref={trigger} type="button" onClick={(event) => { event.preventDefault(); setOpen(true); }} className="flex max-w-full items-center gap-2 rounded-md border border-cardline bg-white p-2 text-left text-xs font-semibold text-sage hover:border-sage" aria-label={`Preview ${name}`}>
      {image ? <img src={url} alt={name} className="h-14 w-14 shrink-0 rounded object-cover" /> : <FileText size={24} className="shrink-0" />}
      <span className="min-w-0"><span className="block truncate">{name}</span><span className="mt-1 inline-flex items-center gap-1"><Eye size={13} />Preview{pdf ? ' PDF' : image ? ' image' : ' file'}</span></span>
    </button>
    {open && createPortal(<Modal open onClose={close} title={`Preview: ${name}`} className="max-w-4xl">
      {image ? <img src={url} alt={name} className="mx-auto max-h-[65dvh] max-w-full rounded object-contain" /> : pdf ? <iframe src={url} title={`PDF preview: ${name}`} className="h-[65dvh] w-full rounded border border-cardline" /> : <p className="text-sm text-charcoal/70">Open this file in a new tab to view it.</p>}
      <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-sage underline">Open in new tab</a>
    </Modal>, document.body)}
  </div>;
}

export default function AttachmentPreviews({ files = [], label = 'Attachment' }) {
  return <>{files.map((file, index) => <AttachmentPreview key={`${file.url || file.name}-${index}`} file={file} label={label} />)}</>;
}
