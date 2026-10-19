import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Save } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

const inputClass = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/35 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-60';
const rupees = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const SectionTitle = ({ letter, children }) => (
  <div className="border-l-4 border-sage bg-sage/10 px-4 py-2.5"><h3 className="text-sm font-bold uppercase tracking-wide text-charcoal">{letter}. {children}</h3></div>
);

const Chip = ({ active, disabled, onClick, children }) => (
  <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60'} disabled:opacity-60`}>
    {active && <Check size={12} />}{children}
  </button>
);

// Same rule the server uses, so the totals shown here always match what is saved.
const calculate = (record, defs) => {
  const selected = record.components.selected;
  const reference = defs.components.reduce((sum, component) => {
    if (!selected.includes(component.key)) return sum;
    return sum + (component.key === defs.customPriceKey ? Number(record.components.ayurvedicPrice || 0) : Number(component.price || 0));
  }, 0);
  return { reference, approved: Math.max(reference - Number(record.e.concession || 0), 0) };
};

const PostCounselingRecordModal = ({ patient, onClose, onSaved, readOnly = false }) => {
  const [data, setData] = useState(null);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!patient) return undefined;
    let live = true;
    setData(null); setRecord(null); setError(''); setNotice(''); setSaved(false);
    api.get(`/post-counseling/patients/${patient.id}/record`, { skipCache: true })
      .then((response) => { if (!live) return; setData(response.data); setRecord(response.data.record); setSaved(response.data.saved); })
      .catch((err) => live && setError(err.response?.data?.message || 'Could not load the record'));
    return () => { live = false; };
  }, [patient]);

  const defs = data?.definitions;
  const totals = useMemo(() => (record && defs ? calculate(record, defs) : { reference: 0, approved: 0 }), [record, defs]);
  const editable = Boolean(data?.canEdit) && !readOnly;

  const change = (updater) => { setRecord((current) => updater(structuredClone(current))); setSaved(false); setNotice(''); };
  const toggleChoice = (key, option) => change((next) => {
    const choices = next.a[key].choices;
    next.a[key].choices = choices.includes(option) ? choices.filter((item) => item !== option) : [...choices, option];
    return next;
  });
  const setA = (key, note) => change((next) => { next.a[key].note = note; return next; });
  const setB = (key, value) => change((next) => { next.b[key] = value; return next; });
  const setE = (key, value) => change((next) => { next.e[key] = value; return next; });
  const toggleComponent = (key) => change((next) => {
    const selected = next.components.selected;
    next.components.selected = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
    if (!next.components.selected.includes(defs.customPriceKey)) next.components.ayurvedicPrice = '';
    return next;
  });

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.put(`/post-counseling/patients/${patient.id}/record`, { record });
      setData(response.data); setRecord(response.data.record); setSaved(true); setNotice('Saved'); onSaved?.();
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={Boolean(patient)} onClose={onClose} title="Post-counselling record" className="max-w-5xl">
      {!record && !error && <p className="py-10 text-center text-sm text-charcoal/55">Loading...</p>}
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {record && defs && (
        <div className="space-y-6">
          <div className="rounded-lg border border-sage/40 bg-sage/10 px-3 py-2 text-sm">
            <span className="text-charcoal/60">Patient</span> <b className="ml-1 text-charcoal">{patient.patientName}</b> <span className="ml-2 font-semibold text-sage">{patient.patientId}</span>
            {data.savedAt && <span className="ml-3 text-xs text-charcoal/50">Last saved {new Date(data.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{data.savedByName ? ` by ${data.savedByName}` : ''}</span>}
            {!editable && <span className="ml-3 text-xs font-semibold text-amber-800">View only</span>}
          </div>

          {readOnly && data.registration && (
            <details className="rounded-lg border border-cardline bg-white/60 p-3" open>
              <summary className="cursor-pointer text-sm font-bold text-charcoal">Registration details <span className="font-normal text-charcoal/50">· consultation {data.registration.consultationDate || '-'} · {data.registration.postCounselorName}</span></summary>
              <div className="mt-3 space-y-3">
                {data.registration.groups.map(([groupKey, groupLabel]) => {
                  const items = data.registration.fieldDefs.filter((definition) => definition.group === groupKey && (!definition.onlyFor || definition.onlyFor === data.registration.fields.category));
                  return (
                    <div key={groupKey}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-sage">{groupLabel}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{items.map((definition) => <div key={definition.key}><p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/45">{definition.label}</p><p className="break-words text-sm font-semibold text-charcoal">{(definition.key === 'category' ? definition.optionLabels?.[data.registration.fields[definition.key]] : data.registration.fields[definition.key]) || '-'}</p></div>)}</div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <section className="space-y-3">
            <SectionTitle letter="A">Guided post-counselling questions (tick + note)</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {defs.sectionA.map((question) => (
                <div key={question.key} className="rounded-lg border border-cardline bg-white/60 p-3">
                  <p className="mb-2 text-sm font-semibold text-charcoal">{question.label}</p>
                  <div className="flex flex-wrap gap-1.5">{question.options.map((option) => <Chip key={option} disabled={!editable} active={record.a[question.key].choices.includes(option)} onClick={() => toggleChoice(question.key, option)}>{option}</Chip>)}</div>
                  <input disabled={!editable} value={record.a[question.key].note} onChange={(event) => setA(question.key, event.target.value)} placeholder="Note" maxLength={1000} className={`${inputClass} mt-2`} />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle letter="B">Decision readiness &amp; counselling conclusion</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {defs.sectionB.map((field) => (
                <div key={field.key} className={field.wide ? 'md:col-span-2' : ''}>
                  {field.type === 'check' ? (
                    <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-charcoal"><input type="checkbox" disabled={!editable} checked={Boolean(record.b[field.key])} onChange={(event) => setB(field.key, event.target.checked)} className="h-4 w-4 accent-sage" />{field.label}</label>
                  ) : (
                    <>
                      <p className="mb-1 text-xs font-semibold text-charcoal/70">{field.label}</p>
                      {field.type === 'single'
                        ? <div className="flex flex-wrap gap-1.5">{field.options.map((option) => <Chip key={option} disabled={!editable} active={record.b[field.key] === option} onClick={() => setB(field.key, record.b[field.key] === option ? '' : option)}>{option}</Chip>)}</div>
                        : <input disabled={!editable} type={field.type === 'date' ? 'date' : 'text'} value={record.b[field.key] || ''} onChange={(event) => setB(field.key, event.target.value)} maxLength={field.wide ? 1000 : 200} className={inputClass} />}
                    </>
                  )}
                </div>
              ))}
              <div>
                <p className="mb-1 text-xs font-semibold text-charcoal/70">Approved program fee <span className="font-normal text-charcoal/45">(auto, from section E)</span></p>
                <p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{rupees(totals.approved)}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle letter="C">Customized treatment &amp; support components</SectionTitle>
            <div className="overflow-hidden rounded-lg border border-cardline">
              <div className="grid grid-cols-[1fr_auto] gap-3 bg-[#56695D] px-4 py-2 text-xs font-semibold text-white"><span>Component</span><span className="w-36 text-right">Value (Rs.)</span></div>
              {defs.components.map((component) => {
                const active = record.components.selected.includes(component.key);
                const custom = component.key === defs.customPriceKey;
                return (
                  <div key={component.key} className={`grid grid-cols-[1fr_auto] items-center gap-3 border-t border-cardline px-4 py-2.5 ${active ? 'bg-sage/10' : 'bg-white/50'}`}>
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-charcoal"><input type="checkbox" disabled={!editable} checked={active} onChange={() => toggleComponent(component.key)} className="h-4 w-4 accent-sage" />{component.label}</label>
                    <div className="w-36 text-right text-sm font-semibold text-charcoal">
                      {custom
                        ? <input disabled={!editable || !active} inputMode="decimal" value={record.components.ayurvedicPrice} onChange={(event) => change((next) => { next.components.ayurvedicPrice = event.target.value; return next; })} placeholder={active ? 'Enter price' : 'Fill after selecting'} className={`${inputClass} text-right`} />
                        : component.price ? component.price.toLocaleString('en-IN') : <span className="font-normal text-charcoal/35">-</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-charcoal/70">Other doctor-recommended component</p>
              <input disabled={!editable} value={record.otherComponent} onChange={(event) => change((next) => { next.otherComponent = event.target.value; return next; })} maxLength={300} className={inputClass} />
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle letter="E">Program value &amp; approved payment structure</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Selected components reference value <span className="font-normal text-charcoal/45">(auto)</span></p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{rupees(totals.reference)}</p></div>
              <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Program fee before concession <span className="font-normal text-charcoal/45">(auto)</span></p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{rupees(totals.reference)}</p></div>
              <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Approved concession / adjustment (Rs)</p><input disabled={!editable} inputMode="decimal" value={record.e.concession} onChange={(event) => setE('concession', event.target.value)} className={inputClass} /></div>
              <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Approved program fee <span className="font-normal text-charcoal/45">(auto)</span></p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{rupees(totals.approved)}</p></div>
              <div className="md:col-span-2">
                <p className="mb-1 text-xs font-semibold text-charcoal/70">Payment plan</p>
                <div className="flex flex-wrap gap-1.5">{defs.paymentPlans.map((plan) => <Chip key={plan} disabled={!editable} active={record.e.paymentPlan === plan} onClick={() => setE('paymentPlan', record.e.paymentPlan === plan ? '' : plan)}>{plan}</Chip>)}</div>
              </div>
              {[1, 2, 3].map((part) => (
                <div key={part} className="grid grid-cols-2 gap-2 md:col-span-1">
                  <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Part {part} (Rs)</p><input disabled={!editable} inputMode="decimal" value={record.e[`part${part}Amount`]} onChange={(event) => setE(`part${part}Amount`, event.target.value)} className={inputClass} /></div>
                  <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Due</p><input disabled={!editable} value={record.e[`part${part}Due`]} onChange={(event) => setE(`part${part}Due`, event.target.value)} maxLength={100} className={inputClass} /></div>
                </div>
              ))}
              <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Other approved plan / note</p><input disabled={!editable} value={record.e.otherPlan} onChange={(event) => setE('otherPlan', event.target.value)} maxLength={500} className={inputClass} /></div>
            </div>
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-cardline bg-offwhite-100 pt-3">
            {notice && <span className="mr-auto text-sm font-semibold text-sage">{notice}</span>}
            <Button variant="outline" onClick={onClose}>Close</Button>
            {editable && <Button onClick={save} disabled={busy}><Save size={15} />{busy ? 'Saving...' : 'Save'}</Button>}
            {saved && !readOnly && <Button onClick={() => setNotice('The next step will be added soon')}>Next <ArrowRight size={15} /></Button>}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PostCounselingRecordModal;
