import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, PackageCheck, Plus } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

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
  const [conversionDetails, setConversionDetails] = useState('');
  const [convertError, setConvertError] = useState('');
  const [savingConvert, setSavingConvert] = useState(false);

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

  const markConverted = async (e) => {
    e.preventDefault();
    setSavingConvert(true);
    setConvertError('');
    try {
      const { data } = await api.patch(`/package-not-bought/${id}/convert`, { conversionDetails });
      setRow(data.row);
      setConvertOpen(false);
      setConversionDetails('');
    } catch (err) {
      setConvertError(err.response?.data?.message || 'Could not mark converted.');
    } finally {
      setSavingConvert(false);
    }
  };

  const isConverted = row?.status === 'converted';

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
                  <h1 className="font-display text-2xl font-bold text-charcoal">{row.patientName}</h1>
                  <Badge tone={isConverted ? 'teal' : 'amber'}>{isConverted ? 'Converted' : 'Open'}</Badge>
                </div>
                <p className="mt-1 text-sm text-charcoal/60">
                  Added by {row.createdByName || '-'} on {formatDateTime(row.createdAt)}
                </p>
                {isConverted && (
                  <p className="mt-1 text-xs font-semibold text-sage">
                    Converted by {row.convertedByName || '-'} on {formatDateTime(row.convertedAt)}
                  </p>
                )}
              </div>
              {!isConverted && (
                <Button onClick={() => setConvertOpen(true)}>
                  <PackageCheck size={16} /> Mark Converted
                </Button>
              )}
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

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Mark Converted">
        <form onSubmit={markConverted} className="space-y-4">
          {convertError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{convertError}</div>}
          <div>
            <label htmlFor="pnb-conversion-details" className="mb-1.5 block text-sm font-medium text-charcoal">Conversion Details</label>
            <textarea
              id="pnb-conversion-details"
              rows={5}
              value={conversionDetails}
              onChange={(e) => setConversionDetails(e.target.value)}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingConvert}>{savingConvert ? 'Saving...' : 'Mark Converted'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PackageNotBoughtDetails;
