import { FileText, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const fileList = (files = [], fallbackUrl, fallbackName) =>
  files?.length ? files : fallbackUrl ? [{ url: fallbackUrl, fileName: fallbackName || 'Attachment' }] : [];

export const CompactAttachments = ({ files = [], fallbackUrl, fallbackName, label = 'Files', className = '' }) => {
  const list = fileList(files, fallbackUrl, fallbackName);
  if (!list.length) return null;

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/45">{label}</span>
      {list.map((file, index) => (
        <a
          key={`${file.url}-${index}`}
          href={`${SERVER_BASE}${file.url}`}
          target="_blank"
          rel="noreferrer"
          title={file.fileName || `${label} ${index + 1}`}
          aria-label={`Open ${file.fileName || `${label} ${index + 1}`} in a new tab`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-cardline bg-offwhite-100 px-1 text-sage hover:border-sage hover:text-charcoal"
        >
          <FileText size={13} />
        </a>
      ))}
      {list.length > 1 && <span className="text-xs font-semibold text-sage">{list.length}</span>}
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
