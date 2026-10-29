import { useEffect, useMemo } from 'react';
import { Camera, ImagePlus, Plus, Trash2, Undo2, X } from 'lucide-react';
import { poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const fileUrl = (url) => (/^https?:/.test(url || '') ? url : `${SERVER_BASE}${url}`);

const Thumbs = ({ files, word = 'p.' }) => (
  <div className="flex flex-wrap gap-2">
    {files.map((f, i) => (
      <a key={f.url || i} href={fileUrl(f.url)} target="_blank" rel="noreferrer" title={f.fileName || `${word} ${i + 1}`} className="block overflow-hidden rounded-md border border-cardline bg-white">
        <img src={fileUrl(f.url)} alt={f.fileName || `${word} ${i + 1}`} className="h-20 w-16 object-cover" loading="lazy" />
        <span className="block px-1 text-center text-[10px] text-charcoal/60">{word} {i + 1}</span>
      </a>
    ))}
  </div>
);

// Chosen (not yet uploaded) images, with a remove button each.
function Picked({ files, onRemove }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="relative block overflow-hidden rounded-md border-2 border-sage/50 bg-white">
          <img src={urls[i]} alt={f.name} className="h-20 w-16 object-cover" />
          <span className="block px-1 text-center text-[10px] text-charcoal/60">p. {i + 1}</span>
          <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => onRemove(i)} className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 text-[#8C3B2E] shadow"><X size={12} /></button>
        </span>
      ))}
    </div>
  );
}

// Camera (one page at a time, added to the list) and multiple-image upload.
const Pickers = ({ onAdd }) => (
  <div className="flex gap-1.5">
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sage bg-sage px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sage/90"><Camera size={13} />Camera<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onAdd([...e.target.files]); e.target.value = ''; }} /></label>
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-xs font-semibold text-sage hover:border-sage/60"><ImagePlus size={13} />Upload images<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onAdd([...e.target.files]); e.target.value = ''; }} /></label>
  </div>
);

export const MAX_NEW_PAPERS = 10;

// Step 9: the photo of all medicines together (required), then papers the department adds itself (name + pages).
// files: { photoA: File[], paper_<i>: File[] }; rows: [{ name }] for paper_<i>; removed: names of earlier papers to drop.
export function DosePaperUpload({ job, files, setFiles, rows, setRows, removed, setRemoved, disabled }) {
  const add = (key, list) => setFiles((o) => ({ ...o, [key]: [...(o[key] || []), ...list] }));
  const drop = (key, i) => setFiles((o) => ({ ...o, [key]: (o[key] || []).filter((_, n) => n !== i) }));
  const overview = files.photoA || [];
  const before = job.photos?.overview || [];
  const earlier = job.photos?.paperSets || [];
  const removeRow = (i) => {
    setRows((list) => list.filter((_, n) => n !== i));
    // Later rows move up one slot, and their pages with them.
    setFiles((o) => {
      const next = { photoA: o.photoA || [] };
      rows.forEach((_, n) => { if (n < i) next[`paper_${n}`] = o[`paper_${n}`] || []; if (n > i) next[`paper_${n - 1}`] = o[`paper_${n}`] || []; });
      return next;
    });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-cardline bg-white/70 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-charcoal">All medicines together<span className="text-red-700"> *</span></p><p className="text-xs text-charcoal/55">One photo, every medicine name / code visible{before.length && !overview.length ? ` · ${before.length} uploaded before` : ''}</p></div>
          {!disabled && <Pickers onAdd={(list) => add('photoA', list)} />}
        </div>
        {overview.length ? <Picked files={overview} onRemove={(i) => drop('photoA', i)} /> : before.length ? <Thumbs files={before} word="photo" /> : <p className="text-xs text-[#9C6B2E]">No photo yet.</p>}
      </div>

      {earlier.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-charcoal/55">Papers uploaded before</p>
          {earlier.map((p) => {
            const gone = removed.includes(p.name);
            return (
              <div key={p.name} className={`rounded-lg border p-3 ${gone ? 'border-[#8C3B2E]/30 bg-[#8C3B2E]/5 opacity-70' : 'border-cardline bg-white/70'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`text-sm font-bold text-charcoal ${gone ? 'line-through' : ''}`}>{p.name} <span className="font-normal text-charcoal/55">· {p.files.length} page{p.files.length === 1 ? '' : 's'}</span></p>
                  {!disabled && (gone
                    ? <button type="button" onClick={() => setRemoved((l) => l.filter((n) => n !== p.name))} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><Undo2 size={13} />Keep</button>
                    : <button type="button" onClick={() => setRemoved((l) => [...l, p.name])} className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C3B2E] hover:underline"><Trash2 size={13} />Remove</button>)}
                </div>
                {!gone && <Thumbs files={p.files} />}
              </div>
            );
          })}
        </div>
      )}

      {rows.map((row, i) => {
        const pages = files[`paper_${i}`] || [];
        return (
          <div key={i} className="rounded-lg border-2 border-sage/30 bg-white/80 p-3">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <label className="min-w-[220px] flex-1"><span className="mb-1 block text-xs font-semibold text-charcoal/70">Paper name <span className="text-red-700">*</span></span>
                <input className={poInput} value={row.name} disabled={disabled} onChange={(e) => setRows((list) => list.map((r, n) => (n === i ? { ...r, name: e.target.value } : r)))} placeholder="e.g. Medicine Paper (दवा-निर्देश), Diet Plan" />
              </label>
              {!disabled && <div className="flex items-center gap-1.5"><Pickers onAdd={(list) => add(`paper_${i}`, list)} /><button type="button" aria-label="Remove this paper" onClick={() => removeRow(i)} className="rounded-lg border border-cardline bg-white p-2 text-[#8C3B2E] hover:border-[#8C3B2E]/40"><X size={14} /></button></div>}
            </div>
            <p className="mb-1.5 text-xs text-charcoal/55">Every page of this paper{pages.length ? ` · ${pages.length} page${pages.length === 1 ? '' : 's'}` : ''}</p>
            {pages.length ? <Picked files={pages} onRemove={(n) => drop(`paper_${i}`, n)} /> : <p className="text-xs text-[#9C6B2E]">No page yet.</p>}
          </div>
        );
      })}

      {!disabled && rows.length < MAX_NEW_PAPERS && (
        <button type="button" onClick={() => setRows((list) => [...list, { name: '' }])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-sage px-3 py-2 text-sm font-semibold text-sage hover:bg-sage/5"><Plus size={15} />Add paper</button>
      )}
    </div>
  );
}

// The uploaded photos and papers, read-only (done step 9, and the doctor's step 10).
export function DosePapersView({ job }) {
  const overview = job.photos?.overview || [];
  const sets = job.photos?.paperSets || [];
  const older = job.photos?.papers || [];
  if (!overview.length && !sets.length && !older.length) return <p className="text-xs text-charcoal/55">No photos uploaded.</p>;
  return (
    <div className="space-y-2.5">
      {overview.length > 0 && <div><p className="mb-1 text-xs font-bold text-charcoal">All medicines together</p><Thumbs files={overview} word="photo" /></div>}
      {sets.map((p) => <div key={p.name}><p className="mb-1 text-xs font-bold text-charcoal">{p.name} <span className="font-normal text-charcoal/55">· {p.files.length} page{p.files.length === 1 ? '' : 's'}</span></p><Thumbs files={p.files} /></div>)}
      {older.length > 0 && <div><p className="mb-1 text-xs font-bold text-charcoal">Treatment papers (older photo)</p><Thumbs files={older} /></div>}
    </div>
  );
}
