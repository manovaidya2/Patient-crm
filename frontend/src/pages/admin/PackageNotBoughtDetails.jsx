import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, PackageCheck, Plus, RotateCcw, XCircle } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import PurchaseOrderForm from '../../components/postcounseling/PurchaseOrderForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { UserRound as PageTitleIcon } from 'lucide-react';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '-';

const fieldValue = (value) => value || '-';

const InfoCell = ({ label, value }) => (
  <div className="bg-offwhite-100 p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">{label}</p>
    <p className="mt-1 text-sm font-bold text-charcoal">{fieldValue(value)}</p>
  </div>
);

const PackageNotBoughtDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const canManageFollowUps = [ROLES.ADMIN, ROLES.POST_COUNSELOR].includes(user?.role);
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followForm, setFollowForm] = useState({ dateTime: '', notes: '' });
  const [followError, setFollowError] = useState('');
  const [savingFollow, setSavingFollow] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completionDetails, setCompletionDetails] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({});
  const [convertError, setConvertError] = useState('');
  const [savingConvert, setSavingConvert] = useState(false);
  // Converting is one step: the purchase order / payment paper. The patient's details come from post-counselling.
  const [convertMessage, setConvertMessage] = useState('');
  const [paper, setPaper] = useState(null);
  const [paperValues, setPaperValues] = useState({});
  const [feeInput, setFeeInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadRow = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/package-not-bought/${id}`);
      setRow(data.row);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load record.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRow();
  }, [id]);

  const submitFollowUp = async (e) => {
    e.preventDefault();
    setSavingFollow(true);
    setFollowError('');
    try {
      const { data } = await api.post(`/package-not-bought/${id}/followups`, followForm);
      setRow(data.row);
      setFollowForm({ dateTime: '', notes: '' });
    } catch (err) {
      setFollowError(err.response?.data?.message || 'Could not add follow-up.');
    } finally {
      setSavingFollow(false);
    }
  };

  const markFollowUpDone = async (e) => {
    e.preventDefault();
    if (!completeTarget) return;
    setCompleteError('');
    try {
      const { data } = await api.patch(`/package-not-bought/${id}/followups/${completeTarget.id}/complete`, {
        completionDetails,
      });
      setRow(data.row);
      setCompleteTarget(null);
      setCompletionDetails('');
    } catch (err) {
      setCompleteError(err.response?.data?.message || 'Could not complete follow-up.');
    }
  };

  const openConvert = () => {
    setConvertError('');
    setConvertForm({});
    setPaper(null); setPaperValues({}); setFeeInput('');
    setConvertOpen(true);
    api.get(`/package-not-bought/${id}/purchase-form`)
      .then(({ data }) => { setPaper(data); setPaperValues(data.values); setConvertForm(data.prefill || {}); })
      .catch((err) => setConvertError(err.response?.data?.message || 'The purchase order paper could not be loaded.'));
  };
  const setConvert = (key) => (event) => setConvertForm((current) => ({ ...current, [key]: event.target.value }));
  const setPaperValue = (key, value) => setPaperValues((current) => ({ ...current, [key]: value }));
  const approvedFee = paper?.feeKnown ? Number(paper.fee) : Number(String(feeInput).replace(/,/g, '')) || 0;
  const needs = paper?.needs || [];

  const markConverted = async () => {
    setConvertError('');
    if (!paper) return;
    if (!(approvedFee > 0)) { setConvertError('Enter the approved program fee'); return; }
    if (!paperValues.mode) { setConvertError('Select the payment mode to convert'); return; }
    const asked = Object.fromEntries(needs.map((key) => [key, convertForm[key] || '']));
    if (needs.some((key) => !String(asked[key] || '').trim())) { setConvertError('Fill the patient details asked above'); return; }
    setSavingConvert(true);
    try {
      const { data } = await api.patch(`/package-not-bought/${id}/convert`, { ...asked, purchase: paperValues, ...(paper.feeKnown ? {} : { approvedProgramFee: approvedFee }) });
      setRow(data.row);
      setConvertOpen(false);
      setConvertMessage(`Converted to patient. Purchase order ${data.poNumber || ''} is sent to In Transit for verification.`);
    } catch (err) {
      setConvertError(err.response?.data?.message || 'Could not convert this record.');
    } finally {
      setSavingConvert(false);
    }
  };

  const isConverted = row?.status === 'converted';
  const isClosed = row?.status === 'closed';
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('Not interested');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  // Not interested: close with a reason (kept for reference); a closed record can be reopened.
  const closeRecord = async () => {
    setClosing(true); setCloseError('');
    try { const { data } = await api.patch(`/package-not-bought/${id}/close`, { reason: closeReason }); setRow(data.row); setCloseOpen(false); }
    catch (err) { setCloseError(err.response?.data?.message || 'Could not close this record'); } finally { setClosing(false); }
  };
  const reopenRecord = async () => {
    setClosing(true); setCloseError('');
    try { const { data } = await api.patch(`/package-not-bought/${id}/reopen`); setRow(data.row); }
    catch (err) { setCloseError(err.response?.data?.message || 'Could not reopen this record'); } finally { setClosing(false); }
  };

  return (
    <div>
      <Link to="/admin/package-not-bought" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal">
        <ArrowLeft size={15} /> Package Not Bought
      </Link>

      {loading ? (
        <Card className="py-10 text-center text-sm text-charcoal/55">Loading record...</Card>
      ) : error ? (
        <Card className="py-10 text-center text-sm font-semibold text-[#8C3B2E]">{error}</Card>
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-charcoal"><PageTitleIcon size={20} aria-hidden="true" />{row.patientName}</h1>
                  <Badge tone={isConverted ? 'teal' : isClosed ? 'inactive' : 'amber'}>{isConverted ? 'Converted' : isClosed ? 'Closed' : 'Open'}</Badge>
                </div>
                <p className="mt-1 text-sm text-charcoal/60">
                  Added by {row.createdByName || '-'} on {formatDateTime(row.createdAt)}
                </p>
                {convertMessage && <p className="mt-1 text-xs font-semibold text-emerald-800">{convertMessage}</p>}
                {isClosed && <p className="mt-1 text-xs font-semibold text-charcoal/60">Closed by {row.closedByName || '-'} on {formatDateTime(row.closedAt)}{row.closeReason ? ` · ${row.closeReason}` : ''}</p>}
                {closeError && <p className="mt-1 text-xs font-semibold text-[#8C3B2E]">{closeError}</p>}
                {isConverted && (
                  <p className="mt-1 text-xs font-semibold text-sage">
                    Converted by {row.convertedByName || '-'} on {formatDateTime(row.convertedAt)}
                    {row.convertedPatientId && <> · <Link to={`/admin/patients/${row.convertedPatientId}`} className="underline">Open patient</Link></>}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!isConverted && !isClosed && (
                  <Button onClick={openConvert}>
                    <PackageCheck size={16} /> Convert to Patient
                  </Button>
                )}
                {!isConverted && !isClosed && <Button variant="outline" disabled={closing} onClick={() => { setCloseReason('Not interested'); setCloseError(''); setCloseOpen(true); }}><XCircle size={16} /> Close</Button>}
                {isClosed && <Button variant="outline" disabled={closing} onClick={reopenRecord}><RotateCcw size={16} /> {closing ? 'Reopening...' : 'Reopen'}</Button>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-cardline bg-cardline sm:grid-cols-3 lg:grid-cols-4">
              <InfoCell label="Parent / Guardian" value={row.parentName} />
              <InfoCell label="Father's Number" value={row.fatherNumber} />
              <InfoCell label="Mother's Number" value={row.motherNumber} />
              <InfoCell label="Age" value={row.age} />
              <InfoCell label="Program" value={row.program} />
              <InfoCell label="Reason" value={row.reason} />
              <InfoCell label="Next Follow-up" value={formatDateTime(row.followUpDate)} />
              <InfoCell label="Updated By" value={row.updatedByName} />
            </div>

            {(row.notes || row.conversionDetails) && (
              <div className="grid gap-px border-t border-cardline bg-cardline lg:grid-cols-2">
                <div className="bg-offwhite-100 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Notes</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-charcoal">{fieldValue(row.notes)}</p>
                </div>
                <div className="bg-offwhite-100 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Conversion Details</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-charcoal">{fieldValue(row.conversionDetails)}</p>
                </div>
              </div>
            )}
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            {canManageFollowUps && !isConverted && (
              <Card>
                <div className="flex items-center gap-2">
                  <Plus size={18} className="text-sage" />
                  <h2 className="font-display text-lg font-bold text-charcoal">Create Follow-up</h2>
                </div>
                {followError && <div className="mt-4 rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{followError}</div>}
                <form onSubmit={submitFollowUp} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="pnb-follow-datetime" className="mb-1.5 block text-sm font-medium text-charcoal">Date & Time</label>
                    <input
                      id="pnb-follow-datetime"
                      type="datetime-local"
                      value={followForm.dateTime}
                      onChange={(e) => setFollowForm((current) => ({ ...current, dateTime: e.target.value }))}
                      className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="pnb-follow-notes" className="mb-1.5 block text-sm font-medium text-charcoal">Follow-up Note</label>
                    <textarea
                      id="pnb-follow-notes"
                      rows={4}
                      value={followForm.notes}
                      onChange={(e) => setFollowForm((current) => ({ ...current, notes: e.target.value }))}
                      className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                    />
                  </div>
                  <Button type="submit" disabled={savingFollow}>{savingFollow ? 'Saving...' : 'Create Follow-up'}</Button>
                </form>
              </Card>
            )}

            {row.packageDetails && (
              <Card className="lg:col-span-2">
                <h2 className="font-display text-base font-bold text-charcoal">Package offered{row.patientId ? ` · ${row.patientId}` : ''}</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[['Reference value', row.packageDetails.referenceValue], ['Concession', row.packageDetails.concession], ['Approved fee', row.packageDetails.approvedProgramFee], ['Received', row.packageDetails.amountReceivedNow]].map(([label, value]) => (
                    <div key={label}><p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">{label}</p><p className="text-sm font-bold text-charcoal">Rs {Number(value || 0).toLocaleString('en-IN')}</p></div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-charcoal/60">Plan: {row.packageDetails.paymentPlan || '-'} · Decision: {row.packageDetails.decision || '-'}{row.packageDetails.poNo ? ` · PO ${row.packageDetails.poNo}` : ''}</p>
                <ul className="mt-3 divide-y divide-cardline rounded-lg border border-cardline">
                  {(row.packageDetails.components || []).map((item) => <li key={item.name} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{item.name}</span><span className="font-semibold">{item.price ? `Rs ${Number(item.price).toLocaleString('en-IN')}` : '-'}</span></li>)}
                </ul>
              </Card>
            )}
            <Card className={canManageFollowUps && !isConverted ? '' : 'lg:col-span-2'}>
              <div className="flex items-center gap-2">
                <CalendarClock size={18} className="text-sage" />
                <h2 className="font-display text-lg font-bold text-charcoal">Follow-ups</h2>
              </div>
              <div className="mt-4 space-y-3">
                {!row.followUps?.length ? (
                  <div className="rounded-lg border border-cardline bg-offwhite-200 px-4 py-8 text-center text-sm text-charcoal/55">
                    No follow-ups added yet.
                  </div>
                ) : (
                  row.followUps.map((followUp) => (
                    <div key={followUp.id} className="rounded-lg border border-cardline bg-offwhite-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {followUp.status === 'completed' ? <CheckCircle2 size={17} className="text-sage" /> : <Clock size={17} className="text-[#9C6B2E]" />}
                            <p className="font-bold text-charcoal">{formatDateTime(followUp.dateTime)}</p>
                            <Badge tone={followUp.status === 'completed' ? 'teal' : 'amber'}>{followUp.status === 'completed' ? 'Done' : 'Scheduled'}</Badge>
                          </div>
                          {followUp.notes && <p className="mt-2 whitespace-pre-line text-sm text-charcoal/70">{followUp.notes}</p>}
                          <p className="mt-2 text-xs text-charcoal/45">Created by {followUp.createdByName || '-'}</p>
                          {followUp.completionDetails && (
                            <p className="mt-2 whitespace-pre-line rounded-md bg-offwhite-100 px-3 py-2 text-sm text-charcoal">
                              {followUp.completionDetails}
                            </p>
                          )}
                          {followUp.completedAt && (
                            <p className="mt-2 text-xs text-sage">
                              Completed by {followUp.completedByName || '-'} on {formatDateTime(followUp.completedAt)}
                            </p>
                          )}
                        </div>
                        {canManageFollowUps && followUp.status !== 'completed' && !isConverted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCompleteTarget(followUp);
                              setCompletionDetails('');
                              setCompleteError('');
                            }}
                          >
                            Mark Done
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal open={!!completeTarget} onClose={() => setCompleteTarget(null)} title="Mark Follow-up Done">
        <form onSubmit={markFollowUpDone} className="space-y-4">
          {completeError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{completeError}</div>}
          <div>
            <label htmlFor="pnb-completion-details" className="mb-1.5 block text-sm font-medium text-charcoal">Completion Note</label>
            <textarea
              id="pnb-completion-details"
              rows={5}
              value={completionDetails}
              onChange={(e) => setCompletionDetails(e.target.value)}
              required
              placeholder="Write what happened in this follow-up..."
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button type="submit">Mark Done</Button>
          </div>
        </form>
      </Modal>

      <Modal open={closeOpen} onClose={() => !closing && setCloseOpen(false)} title="Close - not interested">
        <div className="space-y-3">
          <p className="text-sm text-charcoal/75">{row?.patientName} leaves the open list and the follow-up reminders. The record stays here (filter "Closed") and can be reopened any time.</p>
          <Input label="Reason" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="e.g. Not interested, chose another clinic" />
          {closeError && <p className="text-sm font-semibold text-[#8C3B2E]">{closeError}</p>}
          <div className="flex gap-2"><Button disabled={closing || !closeReason.trim()} onClick={closeRecord}><XCircle size={15} /> {closing ? 'Closing...' : 'Close record'}</Button><Button variant="outline" disabled={closing} onClick={() => setCloseOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>
      <Modal open={convertOpen} onClose={() => !savingConvert && setConvertOpen(false)} title="Convert to Patient · Purchase order" className="max-w-4xl">
        <div className="space-y-5">
          {convertError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{convertError}</div>}
          {!paper && !convertError && <p className="py-6 text-center text-sm text-charcoal/55">Loading...</p>}
          {paper && (
            <>
              <p className="text-sm text-charcoal/65">The patient is created from the post-counselling details. Fill the purchase order paper: the payment details go to the Phase 1 package, and a PO number with a payment starts In Transit.</p>
              {(needs.length > 0 || !paper.feeKnown) && (
                <div className="grid gap-3 rounded-lg border border-cardline bg-white/60 p-3 sm:grid-cols-2">
                  <p className="text-xs font-semibold text-charcoal/70 sm:col-span-2">This record does not have these yet:</p>
                  {needs.includes('patientCode') && <Input label="Patient ID *" value={convertForm.patientCode || ''} onChange={setConvert('patientCode')} />}
                  {needs.includes('category') && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-charcoal">Category *</label>
                      <select value={convertForm.category || ''} onChange={setConvert('category')} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
                        <option value="">Select category</option>
                        <option value="autism_adhd">Autism / ADHD</option>
                        <option value="mental_health">Mental Health</option>
                      </select>
                    </div>
                  )}
                  {needs.includes('age') && <Input label="Age *" value={convertForm.age || ''} onChange={setConvert('age')} />}
                  {needs.includes('number') && <Input label="Father's number *" value={convertForm.number || ''} onChange={setConvert('number')} />}
                  {needs.includes('guardianName') && <Input label="Father / Mother name *" value={convertForm.guardianName || ''} onChange={setConvert('guardianName')} />}
                  {!paper.feeKnown && <Input label="Approved program fee (Rs) *" inputMode="decimal" value={feeInput} onChange={(event) => setFeeInput(event.target.value)} />}
                </div>
              )}
              <PurchaseOrderForm defs={paper.definitions} values={paperValues} onChange={setPaperValue} fee={approvedFee} contacts={paper.registration} editable showEmi={false} onError={setConvertError} onUploading={setUploading} />
            </>
          )}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-cardline bg-offwhite-100 pt-3">
            <Button type="button" variant="ghost" onClick={() => setConvertOpen(false)} disabled={savingConvert}>Cancel</Button>
            <Button type="button" onClick={markConverted} disabled={!paper || savingConvert || uploading}>{savingConvert ? 'Converting...' : 'Convert to Patient'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PackageNotBoughtDetails;
