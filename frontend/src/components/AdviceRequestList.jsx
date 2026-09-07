import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Inbox, MessageSquareText, Pencil, RefreshCw, Send } from 'lucide-react';
import api from '../api/axios.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import Modal from './ui/Modal.jsx';
import Badge from './ui/Badge.jsx';
import DictationButton from './ui/DictationButton.jsx';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const roleLabel = (role = '') =>
  role
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const AdviceRequestList = ({ mode }) => {
  const isGiven = mode === 'given';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchRows = async () => {
      if (!rows.length) setLoading(true);
      setError('');
      try {
        const { data } = await api.get(isGiven ? '/advice/given' : '/advice/requests');
        setRows(data.rows || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load advice records.');
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
    const intervalId = window.setInterval(fetchRows, 10000);
    return () => window.clearInterval(intervalId);
  }, [isGiven, reloadKey, rows.length]);

  const openReply = (row) => {
    setReplyTarget(row);
    setReply(row.status === 'advice_given' ? row.advice || '' : '');
    setReplyError('');
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) {
      setReplyError('Advice is required');
      return;
    }
    setSaving(true);
    setReplyError('');
    try {
      const endpoint = replyTarget.status === 'advice_given' ? `/advice/${replyTarget.id}/advice` : `/advice/${replyTarget.id}/respond`;
      await api.patch(endpoint, { advice: reply });
      setReplyTarget(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setReplyError(err.response?.data?.message || 'Could not save advice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Doctor Advice</p>
          <h1 className="font-display text-2xl font-bold text-charcoal">{isGiven ? 'Advice Given' : 'Request for Advice'}</h1>
          <p className="mt-1 text-sm text-charcoal/55">
            {isGiven ? 'Completed advice records from doctors.' : 'New patient queries waiting for doctor advice.'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="mt-5 flex items-center gap-2 text-sm text-[#8C3B2E]">
          <AlertTriangle size={18} /> {error}
        </Card>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <Card className="py-10 text-center text-sm text-charcoal/55">Loading advice records...</Card>
        ) : rows.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox size={24} className="text-charcoal/35" />
              <p className="text-sm font-semibold text-charcoal">{isGiven ? 'No advice given yet' : 'No advice requests yet'}</p>
              <p className="max-w-md text-sm text-charcoal/55">
                {isGiven ? 'Doctor replies will appear here after advice is submitted.' : 'Advice requests from patient details will appear here.'}
              </p>
            </div>
          </Card>
        ) : (
          rows.map((row) => (
            <Card key={row.id} className={`overflow-hidden ${row.isUrgent && !isGiven ? 'border-[#B42318] bg-[#B42318]/10' : ''}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/patients/${row.patientId}`} className="font-display text-lg font-bold text-charcoal hover:text-sage">
                      {row.patientName || 'Patient'}
                    </Link>
                    {row.patientCode && <Badge tone="default">{row.patientCode}</Badge>}
                    {row.stage && <Badge tone="teal">Stage {row.stage}</Badge>}
                    {row.isUrgent && <Badge tone="danger">Emergency</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-charcoal/50">
                    Requested by {row.requestedByName || 'Unknown'} {row.requestedByRole ? `(${roleLabel(row.requestedByRole)})` : ''} on {formatDateTime(row.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={row.isUrgent && !isGiven ? 'danger' : isGiven ? 'teal' : 'amber'}>{isGiven ? 'Advice Given' : row.isUrgent ? 'Urgent Pending' : 'Pending'}</Badge>
                  {!isGiven && (
                    <Button size="sm" onClick={() => openReply(row)}>
                      <Send size={14} /> Give Advice
                    </Button>
                  )}
                  {isGiven && (
                    <Button size="sm" variant="outline" onClick={() => openReply(row)}>
                      <Pencil size={14} /> Edit
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className={`rounded-lg border p-3.5 ${row.isUrgent && !isGiven ? 'border-[#B42318]/35 bg-white/70' : 'border-cardline bg-offwhite-200'}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                    <MessageSquareText size={13} /> Query
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-charcoal">{row.query}</p>
                </div>
                <div className={`rounded-lg border p-3.5 ${row.isUrgent && !isGiven ? 'border-[#B42318]/35 bg-white/70' : 'border-cardline bg-offwhite-200'}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                    {isGiven ? <CheckCircle2 size={13} /> : <Clock size={13} />} Advice
                  </p>
                  {row.advice ? (
                    <>
                      <p className="mt-2 whitespace-pre-line text-sm text-charcoal">{row.advice}</p>
                      <p className="mt-2 text-xs text-charcoal/50">
                        By {row.adviceGivenByName || 'Doctor'} on {formatDateTime(row.adviceGivenAt)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-charcoal/45">Waiting for doctor advice.</p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={!!replyTarget} onClose={() => setReplyTarget(null)} title={replyTarget?.status === 'advice_given' ? 'Edit Advice' : 'Give Advice'}>
        <form onSubmit={submitReply} className="space-y-4">
          {replyError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{replyError}</div>}
          {replyTarget && (
            <div className="rounded-lg border border-cardline bg-offwhite-200 p-3 text-sm text-charcoal/70">
              <p className="font-semibold text-charcoal">{replyTarget.patientName}</p>
              <p className="mt-1 whitespace-pre-line">{replyTarget.query}</p>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Advice</label>
            <div className="relative">
              <textarea
                rows={6}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write doctor's advice..."
                className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 pr-12 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
              />
              <DictationButton value={reply} onChange={setReply} className="absolute bottom-2 right-2" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReplyTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : replyTarget?.status === 'advice_given' ? 'Save Advice' : 'Submit Advice'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default AdviceRequestList;
