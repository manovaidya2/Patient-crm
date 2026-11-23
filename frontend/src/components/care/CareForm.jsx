import { AlertTriangle, CalendarClock, Info, MessageSquareQuote, PhoneOff, ShieldAlert } from 'lucide-react';
import { contextValue, fillScript, indexOf, responseOptions, visible } from './formRules.js';

// A follow-up / family session / tracker form (the clinic's MV-FU / MV-FS paper, careTemplates/ on the backend),
// filled along with the call. `answers` are kept by block id; CRM values (`from`) are shown already filled and can be
// corrected. readOnly: the saved form of a done session, every field as it was filled.
const TONE = {
  rule: 'border-[#1F5F4A]/30 bg-[#F2F7F4] text-[#1F4F3D]',
  info: 'border-[#3B6EA8]/25 bg-[#F1F6FC] text-[#24476F]',
  warn: 'border-[#C2780C]/30 bg-[#FFF7E8] text-[#7A4A06]',
  danger: 'border-[#B4232F]/30 bg-[#FDF0F0] text-[#8A1C25]',
};
const inputCls = 'w-full rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[13px] text-charcoal outline-none focus:border-sage disabled:bg-[#F7F5EF] disabled:text-charcoal/80';

function Chips({ options, value, multi = false, disabled, onChange, tone = 'sage' }) {
  const on = (opt) => (multi ? Array.isArray(value) && value.includes(opt) : value === opt);
  const toggle = (opt) => {
    if (disabled) return;
    if (!multi) return onChange(value === opt ? '' : opt);
    const list = Array.isArray(value) ? value : [];
    onChange(list.includes(opt) ? list.filter((v) => v !== opt) : [...list, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button key={opt} type="button" disabled={disabled && !on(opt)} onClick={() => toggle(opt)} aria-pressed={on(opt)}
          className={`rounded-lg border px-2.5 py-1 text-left text-[12.5px] font-semibold transition ${on(opt)
            ? tone === 'red' ? 'border-[#B4232F] bg-[#B4232F] text-white' : 'border-[#1F5F4A] bg-[#1F5F4A] text-white'
            : 'border-cardline bg-white text-charcoal/75 hover:border-[#1F5F4A]/50'} ${disabled ? 'cursor-default' : ''} ${disabled && !on(opt) ? 'opacity-40' : ''}`}>
          {multi && <span className="mr-1">{on(opt) ? '☑' : '☐'}</span>}{opt}
        </button>
      ))}
    </div>
  );
}

const Label = ({ children, req }) => (children ? <p className="mb-1 text-[12.5px] font-bold text-charcoal">{children}{req && <span className="ml-0.5 text-[#B4232F]">*</span>}</p> : null);

function OtherBox({ block, answers, set, disabled }) {
  const value = answers[block.id];
  const open = block.other && (Array.isArray(value) ? value.includes(block.other) : value === block.other);
  if (!open) return null;
  return <input className={`${inputCls} mt-1.5 max-w-md`} placeholder={`${block.other}: लिखें`} value={answers[`${block.id}Other`] || ''} disabled={disabled} onChange={(e) => set(`${block.id}Other`, e.target.value)} />;
}

function Cell({ column, value, disabled, onChange }) {
  if (column.type === 'one') {
    return (
      <select className={inputCls} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(column.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (column.type === 'check') return <input type="checkbox" className="h-4 w-4 accent-[#1F5F4A]" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
  if (column.type === 'date') return <input type="date" className={inputCls} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  return <input className={inputCls} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

const TASK_COLUMNS = [
  { id: 'issue', label: 'Unresolved Issue' }, { id: 'owner', label: 'Responsible Person / Dept' }, { id: 'due', label: 'Due Date', type: 'date' },
  { id: 'type', label: 'Task Type' }, { id: 'status', label: 'Status', type: 'one', options: ['Open', 'In Progress', 'Resolved'] }, { id: 'evidence', label: 'Completion Evidence' },
];

function Block({ block, answers, set, context, disabled, onAction, code }) {
  const value = answers[block.id];
  const put = (v) => set(block.id, v);
  switch (block.t) {
    case 'say':
      return (
        <div className="rounded-r-lg border-l-4 border-[#1F5F4A] bg-[#EEF3F0] px-3 py-2">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-[#1F5F4A]"><MessageSquareQuote size={12} />काउंसलर बोले</p>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-charcoal">{fillScript(block.text, context)}</p>
        </div>
      );
    case 'note':
      return (
        <div className={`rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${TONE[block.tone] || TONE.rule}`}>
          {block.label && <b className="mr-1">{block.label}:</b>}<span className="whitespace-pre-line">{block.text}</span>
        </div>
      );
    case 'info':
      return (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          <table className="w-full min-w-[520px] text-left text-[12.5px]">
            {block.head && <thead className="bg-[#EEF3F0] text-[#1F4F3D]"><tr>{block.head.map((h) => <th key={h} className="px-3 py-1.5 font-bold">{h}</th>)}</tr></thead>}
            <tbody className="divide-y divide-cardline">{(block.rows || []).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="px-3 py-1.5 align-top text-charcoal/80">{fillScript(cell, context)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'response': {
      const options = responseOptions(block);
      return (
        <div>
          <Label req={block.req}>{block.label || 'Response'}</Label>
          <Chips options={options} value={value} disabled={disabled} onChange={put} />
          {!disabled && value && value !== options[0] && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#C2780C]/30 bg-[#FFF7E8] px-3 py-2 text-[12.5px] text-[#7A4A06]">
              {/not connected/i.test(value)
                ? <><PhoneOff size={14} />Call not connected — record the call attempt (the session stays open).<button type="button" onClick={() => onAction?.('attempt')} className="font-bold underline">Record call attempt</button></>
                : /guardian/i.test(value)
                  ? <><Info size={14} />First verify the authorization; then choose Available and go on.</>
                  : <><CalendarClock size={14} />The parent cannot talk now — reschedule to a new date / time.<button type="button" onClick={() => onAction?.('reschedule')} className="font-bold underline">Reschedule</button></>}
            </div>
          )}
        </div>
      );
    }
    case 'one': case 'final':
      return (
        <div className={block.t === 'final' ? 'rounded-lg border border-[#1F5F4A]/30 bg-[#F6FAF7] p-2.5' : ''}>
          <Label req={block.req}>{block.label}</Label>
          <Chips options={block.options || []} value={value} disabled={disabled} onChange={put} />
          <OtherBox block={block} answers={answers} set={set} disabled={disabled} />
        </div>
      );
    case 'many':
      return (
        <div>
          <Label req={block.req}>{block.label}</Label>
          <Chips multi options={block.options || []} value={value} disabled={disabled} onChange={put} />
          <OtherBox block={block} answers={answers} set={set} disabled={disabled} />
        </div>
      );
    case 'triage':
      return (
        <div className="rounded-lg border border-[#B4232F]/25 bg-[#FFFAFA] p-2.5">
          <Label req={block.req}><span className="inline-flex items-center gap-1"><ShieldAlert size={13} className="text-[#B4232F]" />{block.label || 'Triage Level'}</span></Label>
          <div className="space-y-1.5">
            {(block.levels || []).map((level) => {
              const on = value === level.value;
              return (
                <button key={level.value} type="button" disabled={disabled && !on} onClick={() => !disabled && put(on ? '' : level.value)}
                  className={`grid w-full gap-1 rounded-lg border px-2.5 py-1.5 text-left sm:grid-cols-[170px_190px_1fr] ${on ? 'border-[#B4232F] bg-[#FDECEC]' : 'border-cardline bg-white'} ${disabled && !on ? 'opacity-40' : ''}`}>
                  <span className="text-[12.5px] font-bold text-charcoal">{on ? '☑' : '☐'} {level.value}</span>
                  <span className="text-[11.5px] text-charcoal/65">{level.timing}</span>
                  <span className="text-[11.5px] text-charcoal/75">{level.action}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'text':
      return (
        <div>
          <Label req={block.req}>{block.label}</Label>
          {block.long
            ? <textarea rows={3} className={inputCls} value={value || ''} placeholder={block.hint || ''} disabled={disabled} onChange={(e) => put(e.target.value)} />
            : <input className={inputCls} value={value || ''} placeholder={block.hint || ''} disabled={disabled} onChange={(e) => put(e.target.value)} />}
        </div>
      );
    case 'date': case 'time':
      return <div className="max-w-xs"><Label req={block.req}>{block.label}</Label><input type={block.t} className={inputCls} value={value || ''} disabled={disabled} onChange={(e) => put(e.target.value)} /></div>;
    case 'check':
      return (
        <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-charcoal">
          <input type="checkbox" className="h-4 w-4 accent-[#1F5F4A]" checked={Boolean(value)} disabled={disabled} onChange={(e) => put(e.target.checked)} />{block.label}{block.req && <span className="text-[#B4232F]">*</span>}
        </label>
      );
    case 'list': {
      const list = Array.isArray(value) ? value : [];
      return (
        <div>
          <Label req={block.req}>{block.label}</Label>
          <div className="grid gap-1 sm:grid-cols-2">
            {(block.items || []).map((item) => (
              <label key={item} className="flex items-start gap-2 text-[12.5px] text-charcoal">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F5F4A]" checked={list.includes(item)} disabled={disabled} onChange={(e) => put(e.target.checked ? [...list, item] : list.filter((v) => v !== item))} />{item}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case 'auto':
      return (
        <div>
          <Label>{block.label} {block.hint && <span className="ml-1 rounded bg-charcoal/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-charcoal/55">{block.hint}</span>}</Label>
          {block.long
            ? <textarea rows={Math.min(6, Math.max(2, String(value || '').split('\n').length))} className={inputCls} value={value || ''} placeholder={context?.none || ''} disabled={disabled} onChange={(e) => put(e.target.value)} />
            : <input className={inputCls} value={value || ''} placeholder={context?.none || ''} disabled={disabled} onChange={(e) => put(e.target.value)} />}
        </div>
      );
    case 'facts': {
      const rows = value && typeof value === 'object' ? value : {};
      return (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          {block.label && <p className="border-b border-cardline bg-[#EEF3F0] px-3 py-1.5 text-[12px] font-bold text-[#1F4F3D]">{block.label}</p>}
          <table className="w-full min-w-[520px] text-[12.5px]">
            <tbody className="divide-y divide-cardline">
              {(block.rows || []).map((row) => (
                <tr key={row.id}>
                  <td className="w-[34%] bg-[#FAF8F2] px-3 py-1.5 align-top font-semibold text-charcoal">{row.label}</td>
                  <td className="px-2 py-1 align-top">
                    {String(rows[row.id] || '').includes('\n')
                      ? <textarea rows={Math.min(6, String(rows[row.id]).split('\n').length)} className={inputCls} value={rows[row.id] || ''} placeholder={context?.none || ''} disabled={disabled} onChange={(e) => put({ ...rows, [row.id]: e.target.value })} />
                      : <input className={inputCls} value={rows[row.id] || ''} placeholder={context?.none || ''} disabled={disabled} onChange={(e) => put({ ...rows, [row.id]: e.target.value })} />}
                  </td>
                  <td className="w-[110px] px-2 py-1.5 align-top text-[10.5px] text-charcoal/50">{row.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'grid': {
      const rows = value && typeof value === 'object' ? value : {};
      return (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          {block.label && <p className="border-b border-cardline bg-[#EEF3F0] px-3 py-1.5 text-[12px] font-bold text-[#1F4F3D]">{block.label}</p>}
          <table className="w-full min-w-[520px] text-[12.5px]">
            <tbody className="divide-y divide-cardline">
              {(block.rows || []).map((row) => (
                <tr key={row.id}>
                  <td className="w-[34%] bg-[#FAF8F2] px-3 py-1.5 align-top font-semibold text-charcoal">{row.label}</td>
                  <td className="px-2 py-1.5"><Chips options={row.options || []} value={rows[row.id]} multi={row.multi} disabled={disabled} onChange={(v) => put({ ...rows, [row.id]: v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'matrix': {
      const rows = value && typeof value === 'object' ? value : {};
      const cols = block.columns || [];
      return (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          {block.label && <p className="border-b border-cardline bg-[#EEF3F0] px-3 py-1.5 text-[12px] font-bold text-[#1F4F3D]">{block.label}</p>}
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead className="bg-[#FAF8F2] text-left text-[11.5px] text-charcoal/70"><tr><th className="px-3 py-1.5" />{cols.map((c) => <th key={c.id} className="px-2 py-1.5 font-bold">{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-cardline">
              {(block.rows || []).map((row) => (
                <tr key={row.id}>
                  <td className="w-[24%] bg-[#FAF8F2] px-3 py-1.5 align-top font-semibold text-charcoal">{row.label}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="px-2 py-1 align-top">
                      <Cell column={c} value={rows[row.id]?.[c.id]} disabled={disabled} onChange={(v) => put({ ...rows, [row.id]: { ...(rows[row.id] || {}), [c.id]: v } })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'tasks': {
      const list = Array.isArray(value) ? value : [];
      const count = Math.max(block.rows || 3, list.length);
      const setRow = (i, key, v) => { const next = Array.from({ length: count }, (_, k) => ({ ...(list[k] || {}) })); next[i][key] = v; put(next); };
      return (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          <p className="border-b border-cardline bg-[#EEF3F0] px-3 py-1.5 text-[12px] font-bold text-[#1F4F3D]">{block.label || 'CRM Task Register'}</p>
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead className="bg-[#FAF8F2] text-left text-[11.5px] text-charcoal/70"><tr><th className="px-2 py-1.5">Task ID</th>{TASK_COLUMNS.map((c) => <th key={c.id} className="px-2 py-1.5 font-bold">{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-cardline">
              {Array.from({ length: count }, (_, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-mono text-[11px] text-charcoal/60">{code}-T{i + 1}</td>
                  {TASK_COLUMNS.map((c) => <td key={c.id} className="px-1.5 py-1"><Cell column={c} value={list[i]?.[c.id]} disabled={disabled} onChange={(v) => setRow(i, c.id, v)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && count < 10 && <button type="button" onClick={() => put([...Array.from({ length: count }, (_, k) => list[k] || {}), {}])} className="w-full border-t border-cardline px-3 py-1.5 text-left text-[12px] font-bold text-[#1F5F4A] hover:bg-[#F6FAF7]">+ Add task</button>}
        </div>
      );
    }
    case 'link': {
      const info = context?.sessions?.[block.code];
      return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cardline bg-white px-3 py-2">
          <span className="min-w-[180px] text-[12.5px] font-bold text-charcoal">{block.label}</span>
          <Chips options={block.options || ['Scheduled', 'Pending']} value={value} disabled={disabled} onChange={put} />
          <span className="text-[12px] text-charcoal/70">तारीख:</span>
          <input className={`${inputCls} max-w-[220px]`} value={answers[`${block.id}Date`] ?? ''} placeholder={info?.at || info?.date || ''} disabled={disabled} onChange={(e) => set(`${block.id}Date`, e.target.value)} />
          {info && <span className="text-[11px] text-charcoal/50">Schedule: {[info.status, info.at || info.date].filter(Boolean).join(' · ')}</span>}
        </div>
      );
    }
    default:
      return null;
  }
}

// Fill the CRM values into the answers the first time a form is opened (the saved record keeps what was shown).
export function withContext(template, context, answers = {}) {
  const out = { ...answers };
  (template?.sections || []).forEach((section) => (section.blocks || []).forEach((block) => {
    if (block.t === 'auto' && out[block.id] == null) out[block.id] = contextValue(context, block.from) || '';
    if (block.t === 'facts') {
      const rows = { ...(out[block.id] || {}) };
      (block.rows || []).forEach((row) => { if (rows[row.id] == null && row.from) rows[row.id] = contextValue(context, row.from) || ''; });
      out[block.id] = rows;
    }
    if (block.t === 'link' && out[`${block.id}Date`] == null) {
      const info = context?.sessions?.[block.code];
      out[`${block.id}Date`] = info ? info.at || info.date || '' : '';
      if (out[block.id] == null && info) out[block.id] = info.scheduled ? (block.options || ['Scheduled'])[0] : '';
    }
  }));
  return out;
}

export default function CareForm({ template, context, answers, onChange, readOnly = false, missing = new Set(), onAction, code }) {
  const byId = indexOf(template);
  const set = (id, value) => onChange?.({ ...answers, [id]: value });
  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-[#1F5F4A] bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#1F5F4A]">MANOVAIDYA · {template.key}</p>
        <h3 className="font-display text-lg font-bold leading-tight text-[#1F4F3D]">{template.title}</h3>
        {template.subtitle && <p className="text-[12.5px] text-charcoal/65">{template.subtitle}</p>}
        {template.meta?.length > 0 && (
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
            {template.meta.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="min-w-[120px] font-semibold text-charcoal/60">{k}</dt><dd className="text-charcoal">{v}</dd></div>)}
          </dl>
        )}
        {template.basic && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#FFF7E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#7A4A06]"><AlertTriangle size={13} />इस session का पूरा template अभी नहीं आया है — तब तक यह छोटा form।</p>}
      </div>
      {(template.sections || []).map((section, si) => {
        const shown = (section.blocks || []).filter((block) => visible(block, answers, byId));
        if (!shown.length) return null;
        return (
          <section key={`${si}-${section.title}`} className="overflow-hidden rounded-xl border border-cardline bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1F5F4A] px-3 py-1.5 text-white">
              <h4 className="text-[13px] font-bold">{section.title}</h4>
              {section.time && <span className="text-[11px] font-semibold text-white/80">{section.time}</span>}
            </div>
            <div className="space-y-2.5 p-3">
              {shown.map((block, bi) => (
                <div key={block.id || `${si}-${bi}`} className={block.id && missing.has(block.id) ? 'rounded-lg ring-2 ring-[#B4232F]/60 ring-offset-2' : ''}>
                  <Block block={block} answers={answers} set={set} context={context} disabled={readOnly} onAction={onAction} code={code || template.code} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
