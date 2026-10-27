import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';
import { Field, Value } from '../AppointmentForm.jsx';
import { columnSection } from '../../utils/appointmentSections.js';

const selectClass = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
// Set by the arrival step / Patient ID generator, so they are shown here but not edited here.
const LOCKED_COLUMNS = new Set(['6ab7c235bf916b34dfda543c', '6aba53547172140c6badaf14', '6abb6329297d3a5387593670']);

// Step 2: registration details (sales details come in pre-filled) and "Registration complete" -> choose Post Counselor.
const RegistrationModal = ({ row, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [fields, setFields] = useState({});
  const [counselors, setCounselors] = useState([]);
  const [counselorId, setCounselorId] = useState('');
  const [step, setStep] = useState('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!row) return undefined;
    let live = true;
    setData(null); setStep('form'); setError(''); setNotice(''); setCounselorId('');
    setForm(null); setDetails({});
    Promise.all([api.get(`/sales-sheet/management/${row.id}/registration`), api.get('/sales-sheet/post-counselors'), api.get(`/sales-sheet/forms/management/${row.id}`, { skipCache: true })])
      .then(([registration, list, formResponse]) => {
        if (!live) return;
        setData(registration.data.registration);
        setFields(registration.data.registration.fields);
        setCounselors(list.data.counselors || []);
        setForm(formResponse.data);
        setDetails(formResponse.data.values || {});
      })
      .catch((err) => live && setError(err.response?.data?.message || 'Registration could not be loaded'));
    return () => { live = false; };
  }, [row]);

  const set = (key) => (event) => setFields((current) => ({ ...current, [key]: event.target.value }));
  const sent = data?.status === 'sent';
  const visibleDefs = (data?.fieldDefs || []).filter((definition) => !definition.onlyFor || definition.onlyFor === fields.category);
  const missing = visibleDefs.filter((definition) => definition.required && !String(fields[definition.key] || '').trim()).map((definition) => definition.label);

  const detailColumns = (form?.columns || []).filter((column) => columnSection(column) === 'details');
  // Reception details are saved one field at a time, only the ones that changed.
  const saveDetails = async () => {
    for (const column of detailColumns) {
      if (LOCKED_COLUMNS.has(column.id)) continue;
      const before = form.values?.[column.id] || '';
      const next = details[column.id] || '';
      if (before === next) continue;
      await api.patch(`/sales-sheet/forms/management/${row.id}/field`, { columnId: column.id, source: 'reception', previousValue: before, value: next });
      setForm((old) => ({ ...old, values: { ...old.values, [column.id]: next } }));
    }
  };

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await saveDetails(); await api.put(`/sales-sheet/management/${row.id}/registration`, { fields }); setNotice('Saved'); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const complete = () => {
    if (missing.length) { setError(`Please fill: ${missing.join(', ')}`); return; }
    setError(''); setStep('send');
  };
  const send = async () => {
    if (!counselorId) { setError('Choose a Post Counselor'); return; }
    setBusy(true); setError('');
    try {
      await saveDetails();
      const response = await api.post(`/sales-sheet/management/${row.id}/registration/send`, { fields, postCounselorId: counselorId });
      setData(response.data.registration); setStep('done'); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Could not send'); }
    finally { setBusy(false); }
  };

  const isMental = fields.category === 'mental_health';
  return (
    <Modal open={Boolean(row)} onClose={onClose} title="Registration details" className="max-w-3xl">
      {!data && !error && <p className="py-8 text-center text-sm text-charcoal/55">Loading...</p>}
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && step === 'done' && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-charcoal/70">Registration complete. <b>{fields.patientName}</b> ({data.patientId}) was sent to <b>{data.postCounselorName}</b>.</p>
          <Button onClick={onClose} className="w-full">Okay</Button>
        </div>
      )}
      {data && step === 'send' && (
        <div className="space-y-4">
          <p className="text-sm text-charcoal/70">Send <b>{fields.patientName}</b> ({data.patientId}) to which Post Counselor?</p>
          <select value={counselorId} onChange={(event) => setCounselorId(event.target.value)} className={selectClass}>
            <option value="">Select Post Counselor</option>
            {counselors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setStep('form')}>Back</Button><Button onClick={send} disabled={busy}>{busy ? 'Sending...' : 'Send to Post Counselor'}</Button></div>
        </div>
      )}
      {data && step === 'form' && (
        <div className="space-y-4">
          {sent && <div className="rounded border border-sage/40 bg-sage/10 px-3 py-2 text-sm text-charcoal">Already sent to <b>{data.postCounselorName}</b>. These details can no longer be changed here.</div>}
          <div className="rounded-lg border border-sage/40 bg-sage/10 px-3 py-2 text-sm"><span className="text-charcoal/60">Patient ID</span> <b className="ml-1 text-base text-charcoal">{data.patientId}</b><span className="ml-3 text-xs text-charcoal/50">Appointment {data.appointmentCode}{data.meta?.tokenNumber ? ` · Token ${data.meta.tokenNumber}` : ''}{data.meta?.arrivalTime ? ` · Arrived ${data.meta.arrivalTime}` : ''}</span></div>
          {data.existingPatient && (
            <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              <b>Existing patient</b> · old Patient ID kept, no new ID was made. Details below come from the patient's record where they were empty.
              {data.existingPatient.nextPhase ? <> This visit's purchase will go into <b>Phase {data.existingPatient.nextPhase}</b>.</> : <> <b>All phases are already in use.</b></>}
            </div>
          )}
          {(data.groups || []).map(([groupKey, groupLabel]) => {
            const defs = visibleDefs.filter((definition) => definition.group === groupKey);
            if (!defs.length) return null;
            return (
              <fieldset key={groupKey} disabled={sent || busy} className="space-y-2">
                <legend className="text-sm font-bold text-charcoal">{groupLabel}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {defs.map((definition) => {
                    const label = `${definition.label}${definition.required ? ' *' : ''}`;
                    if (definition.type === 'select') {
                      return (
                        <div key={definition.key}>
                          <label className="mb-1.5 block text-sm font-medium text-charcoal">{label}</label>
                          <select value={fields[definition.key] || ''} onChange={set(definition.key)} className={selectClass}>
                            <option value="">Select</option>
                            {definition.options.map((option) => <option key={option} value={option}>{definition.optionLabels?.[option] || option}</option>)}
                          </select>
                        </div>
                      );
                    }
                    return <Input key={definition.key} label={label} type={definition.type === 'date' ? 'date' : 'text'} inputMode={definition.type === 'tel' ? 'tel' : undefined} value={fields[definition.key] || ''} onChange={set(definition.key)} maxLength={definition.max} />;
                  })}
                </div>
              </fieldset>
            );
          })}
          {detailColumns.length > 0 && (
            <div className="space-y-3 border-t border-cardline pt-4">
              <div><p className="text-sm font-bold text-charcoal">Reception details</p><p className="text-xs text-charcoal/55">Kept at reception. Only the registration details above go to the Post Counselor.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {detailColumns.map((column) => (
                  <div key={column.id} className="min-w-0">
                    <p className="mb-1 text-xs font-semibold text-charcoal/80">{column.label}{column.required ? ' *' : ''}</p>
                    {sent || busy || LOCKED_COLUMNS.has(column.id) || !form.canEdit
                      ? <Value column={column} value={details[column.id] || ''} />
                      : <Field column={column} value={details[column.id] || ''} onChange={(next) => setDetails((old) => ({ ...old, [column.id]: next }))} onError={setError} onUploading={setUploading} />}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!sent && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {notice && <span className="mr-auto text-sm font-semibold text-sage">{notice}</span>}
              <Button variant="outline" onClick={save} disabled={busy || uploading}>Save</Button>
              <Button onClick={complete} disabled={busy || uploading}>Registration complete</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default RegistrationModal;
