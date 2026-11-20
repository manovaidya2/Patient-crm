import { History, Laptop, Pencil, Smartphone, Trash2, UserRound } from 'lucide-react';
import Card from '../ui/Card.jsx';
import InventorySoftCopy from '../InventorySoftCopy.jsx';

// The device tabs of Clinic inventory: one row per mobile / laptop, no stock count.
export const DEVICE_FIELDS = {
  mobile: [
    { key: 'brand', label: 'Mobile brand', required: true, placeholder: 'Samsung, Vivo, Apple...' },
    { key: 'simCompany', label: 'SIM company', placeholder: 'Jio, Airtel, Vi...' },
    { key: 'phoneNumber', label: 'Mobile number', type: 'tel', placeholder: '10-digit number' },
    { key: 'imei1', label: 'IMEI number 1', inputMode: 'numeric', maxLength: 17, placeholder: '15 digits' },
    { key: 'imei2', label: 'IMEI number 2', inputMode: 'numeric', maxLength: 17, placeholder: '15 digits' },
    { key: 'assignee', label: 'Assignee', placeholder: 'Who uses this mobile' },
  ],
  laptop: [
    { key: 'deviceId', label: 'Device ID', required: true, placeholder: 'Device ID / serial number' },
    { key: 'brand', label: 'Laptop brand', required: true, placeholder: 'Dell, HP, Lenovo...' },
    { key: 'assignee', label: 'Assignee', placeholder: 'Who uses this laptop' },
  ],
};
export const DEVICE_LABEL = { mobile: 'mobile', laptop: 'laptop' };
export const emptyDevice = { brand: '', simCompany: '', phoneNumber: '', imei1: '', imei2: '', deviceId: '', assignee: '' };

const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const Action = ({ label, onClick, children }) => <button type="button" title={label} aria-label={label} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cardline bg-offwhite-100 text-charcoal/65 transition-colors hover:border-sage hover:bg-sage-muted/15 hover:text-charcoal">{children}</button>;

export default function DeviceRegister({ kind, items, loading, error, canDelete, onEdit, onHistory, onDelete, onSaved }) {
  const columns = DEVICE_FIELDS[kind];
  const Icon = kind === 'mobile' ? Smartphone : Laptop;
  const span = columns.length + 2;
  return (
    <Card className="mt-6 overflow-hidden" padded={false}>
      <div className="border-b border-cardline bg-offwhite-200/60 px-5 py-4">
        <h2 className="text-lg font-bold text-charcoal">{kind === 'mobile' ? 'Mobiles' : 'Laptops'}</h2>
        <p className="mt-0.5 text-xs text-charcoal/55">Each {DEVICE_LABEL[kind]} with its details and who has it. The history button shows every assignee it had.</p>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-center text-sm ${kind === 'mobile' ? 'min-w-[1180px]' : 'min-w-[820px]'}`}>
          <thead className="bg-[#56695D] text-[11px] font-bold uppercase tracking-[0.12em] text-white">
            <tr>
              {columns.map((c) => <th key={c.key} className="px-4 py-3.5">{c.key === 'brand' ? 'Brand' : c.label}</th>)}
              <th className="px-4 py-3.5">Soft copy</th>
              <th className="px-4 py-3.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cardline-soft">
            {loading && <tr><td colSpan={span} className="px-5 py-14 text-charcoal/55">Loading {DEVICE_LABEL[kind]}s...</td></tr>}
            {!loading && error && <tr><td colSpan={span} className="px-5 py-14 text-[#8C3B2E]">{error}</td></tr>}
            {!loading && !error && !items.length && (
              <tr><td colSpan={span} className="px-5 py-16"><Icon size={28} className="mx-auto text-charcoal/30" /><p className="mt-2 font-semibold text-charcoal">No {DEVICE_LABEL[kind]}s yet</p><p className="mt-1 text-sm text-charcoal/55">Add a {DEVICE_LABEL[kind]} to keep its details here.</p></td></tr>
            )}
            {!loading && !error && items.map((item, index) => (
              <tr key={item.id} className={`${index % 2 ? 'bg-offwhite-200/35' : 'bg-offwhite-100'} hover:bg-sage-muted/10`}>
                {columns.map((c) => (
                  <td key={c.key} className="border-r border-cardline-soft px-4 py-4 align-middle">
                    {c.key === 'assignee'
                      ? (item.device.assignee ? <span className="inline-flex items-center gap-1 rounded-md bg-sage/10 px-2 py-1 text-xs font-semibold text-sage"><UserRound size={12} />{item.device.assignee}</span> : <span className="text-xs text-charcoal/45">Not assigned</span>)
                      : <span className={`${c.key === 'brand' || c.key === 'deviceId' ? 'font-bold text-charcoal' : 'text-charcoal/80'} ${/imei|phone|deviceId/i.test(c.key) ? 'font-mono text-[13px] tracking-wide' : ''}`}>{item.device[c.key] || '-'}</span>}
                    {c.key === columns[0].key && <p className="mt-1 text-[11px] text-charcoal/45">Added {stamp(item.createdAt)} by {item.createdByName || '-'}</p>}
                    {c.key === columns[0].key && item.notes && <p className="mx-auto mt-1 max-w-[220px] truncate text-xs text-charcoal/55">{item.notes}</p>}
                  </td>
                ))}
                <td className="border-r border-cardline-soft px-4 py-4 align-middle"><InventorySoftCopy item={item} onSaved={onSaved} /></td>
                <td className="px-4 py-4 align-middle">
                  <div className="flex justify-center gap-1.5">
                    <Action label="Assignee history" onClick={() => onHistory(item)}><History size={15} /></Action>
                    <Action label={`Edit ${DEVICE_LABEL[kind]}`} onClick={() => onEdit(item)}><Pencil size={15} /></Action>
                    {canDelete && <Action label={`Delete ${DEVICE_LABEL[kind]}`} onClick={() => onDelete(item)}><Trash2 size={15} className="text-red-700" /></Action>}
                  </div>
                  {item.editedByName && <p className="mt-1 text-[11px] text-charcoal/45">Edited by {item.editedByName}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// The assignee history of one device, newest first.
export function AssigneeHistory({ item }) {
  if (!item.assignments?.length) return <p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-6 text-center text-sm text-charcoal/55">No assignee recorded yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-cardline">
      <table className="min-w-full text-center text-sm">
        <thead className="bg-[#56695D] text-xs uppercase text-white"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Assigned to</th><th className="px-3 py-3">Changed by</th></tr></thead>
        <tbody className="divide-y divide-cardline-soft">
          {item.assignments.map((a, index) => (
            <tr key={`${a.assignedAt}-${index}`}>
              <td className="px-3 py-3 text-charcoal/65">{stamp(a.assignedAt)}</td>
              <td className="px-3 py-3 font-semibold">{a.assignee || <span className="font-normal text-charcoal/50">Not assigned (taken back)</span>}{index === 0 && <span className="ml-2 rounded bg-sage/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sage">Current</span>}</td>
              <td className="px-3 py-3">{a.assignedByName || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
