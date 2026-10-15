import { useEffect, useState } from 'react';
import { FileText, LoaderCircle, X } from 'lucide-react';
import api from '../../api/axios.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const fileList = (files = [], fallbackUrl, fallbackName) =>
  files?.length ? files : fallbackUrl ? [{ url: fallbackUrl, fileName: fallbackName || 'Attachment' }] : [];

export const CompactAttachments = ({
  files = [], fallbackUrl, fallbackName, label = 'Files', className = '', deleteUrl = '', onDeleted,
}) => {
  const sourceList = fileList(files, fallbackUrl, fallbackName);
  const [removedUrls, setRemovedUrls] = useState([]);
  const [deletingUrl, setDeletingUrl] = useState('');
  const [error, setError] = useState('');
  const sourceKey = sourceList.map((file) => file.url).join('|');
  useEffect(() => { setRemovedUrls([]); setError(''); }, [sourceKey]);
  const list = sourceList.filter((file) => !removedUrls.includes(file.url));
  if (!list.length) return null;

  const remove = async (file) => {
    const name = file.fileName || 'this attachment';
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return;
    setDeletingUrl(file.url);
    setError('');
    try {
      await api.delete(deleteUrl, { data: { url: file.url } });
      setRemovedUrls((current) => [...current, file.url]);
      onDeleted?.(file);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove this attachment.');
    } finally {
      setDeletingUrl('');
    }
  };

  return (
    <div className={className}>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/45">{label}</span>
        {list.map((file, index) => (
          <span key={`${file.url}-${index}`} className="relative inline-flex">
            <a
              href={`${SERVER_BASE}${file.url}`}
              target="_blank"
              rel="noreferrer"
              title={file.fileName || `${label} ${index + 1}`}
              aria-label={`Open ${file.fileName || `${label} ${index + 1}`} in a new tab`}
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded border border-cardline bg-offwhite-100 px-1 text-sage hover:border-sage hover:text-charcoal ${deleteUrl ? 'pr-3' : ''}`}
            >
              <FileText size={13} />
            </a>
            {deleteUrl && (
              <button
                type="button"
                onClick={() => remove(file)}
                disabled={Boolean(deletingUrl)}
                className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#9B3D30] text-white shadow-sm hover:bg-[#7E2F25] disabled:opacity-60"
                aria-label={`Remove ${file.fileName || `${label} ${index + 1}`}`}
                title="Remove this file"
              >
                {deletingUrl === file.url ? <LoaderCircle size={10} className="animate-spin" /> : <X size={10} strokeWidth={3} />}
              </button>
            )}
          </span>
        ))}
        {list.length > 1 && <span className="text-xs font-semibold text-sage">{list.length}</span>}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-[#8C3B2E]" role="alert">{error}</p>}
    </div>
  );
};

export const SelectedAttachments = ({ files = [], onRemove }) => {
  if (!files.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {files.map((file, index) => (
        <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded border border-cardline bg-offwhite-100 py-1 pl-2 pr-1 text-xs text-charcoal/70">
          <FileText size={12} className="shrink-0 text-sage" />
          <span className="max-w-40 truncate" title={file.name}>{file.name}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-charcoal/45 hover:bg-[#8C3B2E]/10 hover:text-[#8C3B2E]"
            aria-label={`Remove ${file.name}`}
            title="Remove selected file"
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
};

export const appendSelectedFiles = (setter, selection) => {
  const incoming = Array.from(selection || []);
  if (incoming.length) setter((current) => [...current, ...incoming]);
};

export const removeSelectedFile = (setter, index) => setter((current) => current.filter((_, fileIndex) => fileIndex !== index));
