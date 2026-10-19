import { useEffect, useState } from 'react';
import { Check, FileText, Paperclip, X } from 'lucide-react';
import api from '../../api/axios.js';

const inputClass = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/35 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-60';
const serverBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
export const rupees = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const SectionTitle = ({ letter, children, hint }) => (
  <div className="border-l-4 border-sage bg-sage/10 px-4 py-2.5"><h3 className="text-sm font-bold uppercase tracking-wide text-charcoal">{letter}. {children}</h3>{hint && <p className="text-xs text-charcoal/55">{hint}</p>}</div>
);
const Chip = ({ active, disabled, onClick, children }) => (
  <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60'} disabled:opacity-60`}>{active && <Check size={12} />}{children}</button>
);
const Auto = ({ label, value }) => (
  <div><p className="mb-1 text-xs font-semibold text-charcoal/70">{label} <span className="font-normal text-charcoal/45">(auto)</span></p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{value}</p></div>
);

// The purchase order / payment paper (sections F, G, H). Used after post-counselling and when converting from Package Not Bought.
// It only shows and edits `values`; saving and converting belong to the screen that uses it.
const PurchaseOrderForm = ({ defs, values, onChange, fee, contacts = {}, editable, showEmi = false, onError, onUploading }) => {
  const [banks, setBanks] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get('/banks', { params: { active: 'true' } }).then(({ data }) => setBanks(data.banks || [])).catch(() => setBanks([]));
  }, []);
  useEffect(() => { onUploading?.(uploading); }, [uploading, onUploading]);

  const received = Number(values.amountReceivedNow || 0);
  const card = values.mode === 'Card (+3%)' ? Math.round(received * defs.cardRate * 100) / 100 : 0;
  const outstanding = Math.max(Number(fee || 0) - received, 0);
  const visible = (field) => (!field.onlyFor || field.onlyFor.includes(values.mode)) && (!field.hideFor || !field.hideFor.includes(values.mode));

  // Each upload field keeps its own list: the PO paper image and the payment screenshots must never mix.
  const uploadFiles = (key) => async (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    if (!chosen.length) return;
    setUploading(true); onError?.('');
    try {
      const body = new FormData();
      chosen.forEach((file) => body.append('screenshot', file));
      const { data } = await api.post('/post-counseling/upload', body);
      onChange(key, [...(values[key] || []), ...data.files]);
    } catch (err) { onError?.(err.response?.data?.message || 'Screenshot could not be uploaded'); }
    finally { setUploading(false); }
  };

  const renderField = (field) => {
    if (!visible(field)) return null;
    const wrap = field.wide ? 'md:col-span-2' : '';
    if (field.type === 'bank') {
      return (
        <div key={field.key} className={wrap}>
          <p className="mb-1 text-xs font-semibold text-charcoal/70">{field.label}</p>
          <select disabled={!editable} value={values[field.key] || ''} onChange={(event) => onChange(field.key, event.target.value)} className={inputClass}>
            <option value="">Select bank</option>
            {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.displayName || bank.name}</option>)}
          </select>
        </div>
      );
    }
    if (field.type === 'files') {
      const files = values[field.key] || [];
      return (
        <div key={field.key} className={wrap}>
          <p className="mb-1 text-xs font-semibold text-charcoal/70">{field.label}</p>
          <div className="space-y-2">
            {editable && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-semibold text-sage hover:border-sage/60">
                <Paperclip size={14} />{uploading ? 'Uploading...' : field.key === 'paperImages' ? 'Attach PO paper image' : 'Attach screenshots'}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={uploadFiles(field.key)} />
              </label>
            )}
            {files.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <li key={file.url} className="inline-flex items-center gap-1 rounded-full border border-cardline bg-white px-3 py-1 text-xs">
                    <FileText size={12} className="text-sage" />
                    <a href={`${serverBase}${file.url}`} target="_blank" rel="noreferrer" className="max-w-[180px] truncate font-semibold text-sage hover:underline">{file.fileName}</a>
                    {editable && <button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => onChange(field.key, files.filter((item) => item.url !== file.url))} className="text-charcoal/50 hover:text-red-700"><X size={12} /></button>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-charcoal/45">{field.key === 'paperImages' ? 'No PO paper image attached' : 'No screenshot attached'}</p>}
          </div>
        </div>
      );
    }
    if (field.type === 'check') return <label key={field.key} className={`flex items-center gap-2 pt-6 text-sm font-semibold text-charcoal ${wrap}`}><input type="checkbox" disabled={!editable} checked={Boolean(values[field.key])} onChange={(event) => onChange(field.key, event.target.checked)} className="h-4 w-4 accent-sage" />{field.label}</label>;
    return (
      <div key={field.key} className={wrap}>
        <p className="mb-1 text-xs font-semibold text-charcoal/70">{field.label}{field.key === 'poNo' || field.key === 'mode' ? ' *' : ''}</p>
        {field.type === 'single'
          ? <div className="flex flex-wrap gap-1.5">{field.options.map((option) => <Chip key={option} disabled={!editable} active={values[field.key] === option} onClick={() => onChange(field.key, values[field.key] === option ? '' : option)}>{option}</Chip>)}</div>
          : <input disabled={!editable} type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} inputMode={field.type === 'money' ? 'decimal' : undefined} value={values[field.key] ?? ''} onChange={(event) => onChange(field.key, event.target.value)} className={inputClass} />}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <Auto label="Approved program fee" value={rupees(fee)} />
        <Auto label="Amount received now" value={rupees(received)} />
        <Auto label="Outstanding balance" value={rupees(outstanding)} />
      </div>

      <section className="space-y-3">
        <SectionTitle letter="F" hint="Payment collection & approved instalment plan">Payment collection</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {defs.sectionF.map(renderField)}
          {values.mode === 'Card (+3%)' && <Auto label="3% card charge (Rs)" value={rupees(card)} />}
          <Auto label="Outstanding balance (Rs)" value={rupees(outstanding)} />
        </div>
      </section>

      {(values.mode === 'EMI' || showEmi) && (
        <section className="space-y-3">
          <SectionTitle letter="G" hint="If applicable">EMI details</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">{defs.sectionG.map(renderField)}</div>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle letter="H" hint="The PO number starts In Transit once a payment is recorded">Purchase order &amp; patient / guardian consent</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {defs.sectionH.map(renderField)}
          <Auto label="PO value (Rs)" value={rupees(fee)} />
          <Auto label="Part payment (Rs)" value={rupees(received)} />
          <Auto label="Balance (Rs)" value={rupees(outstanding)} />
          <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Father's contact no.</p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">{contacts.fatherNumber || '-'}</p></div>
          <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Mother's contact no.</p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">{contacts.motherNumber || '-'}</p></div>
        </div>
      </section>
    </div>
  );
};

export default PurchaseOrderForm;
