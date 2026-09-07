import { useEffect, useState } from 'react';
import { Info, PhoneIncoming, PhoneOutgoing, Play, RefreshCcw } from 'lucide-react';
import api from '../api/axios.js';
import Card from './ui/Card.jsx';
import Badge from './ui/Badge.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

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

const formatDuration = (seconds = 0, fallback = '') => {
  const total = Number(seconds || 0);
  if (!total) return fallback || '0s';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
};

const getRecordingSource = (call) => {
  if (call.recordingFileUrl) return `${SERVER_BASE}${call.recordingFileUrl}`;
  return '';
};

const isIncoming = (type = '') => type.toLowerCase().includes('incoming');

const PatientCallHistory = ({ patientId }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openCallId, setOpenCallId] = useState(null);

  const loadCalls = async () => {
    if (!patientId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/patients/${patientId}/calls`);
      setCalls(data.callLogs || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load call history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, [patientId]);

  return (
    <Card className="mt-5" padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-cardline px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-charcoal">Call History</h2>
          <p className="mt-0.5 text-xs text-charcoal/55">Calls received from the calling webhook will be listed here by time.</p>
        </div>
        <button
          type="button"
          onClick={loadCalls}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
          aria-label="Refresh call history"
          title="Refresh"
        >
          <RefreshCcw size={15} />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-charcoal/55">Loading calls...</div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-sm font-medium text-[#8C3B2E]">{error}</div>
      ) : calls.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-charcoal/55">No calls received yet.</div>
      ) : (
        <div className="divide-y divide-cardline">
          {calls.map((call) => {
            const recordingSource = getRecordingSource(call);
            const expanded = openCallId === call.id;
            const IncomingIcon = isIncoming(call.callType) ? PhoneIncoming : PhoneOutgoing;

            return (
              <div key={call.id} className="px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-charcoal/65">
                      <IncomingIcon size={18} className={isIncoming(call.callType) ? 'text-sage' : 'text-[#9C6B2E]'} />
                      <Badge tone={isIncoming(call.callType) ? 'teal' : 'amber'}>{call.callType}</Badge>
                      <span className="font-semibold text-charcoal">{formatDuration(call.durationSeconds, call.durationText)}</span>
                      <span className="text-charcoal/45">({formatDateTime(call.actionCreationTime)})</span>
                      <Info size={14} className="text-charcoal/35" />
                    </div>
                    {call.callAction && <p className="mt-1 truncate text-xs text-charcoal/55">{call.callAction}</p>}
                  </div>

                  {recordingSource ? (
                    <button
                      type="button"
                      onClick={() => setOpenCallId(expanded ? null : call.id)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-offwhite-300 text-charcoal hover:bg-sage-muted/30"
                      aria-label={expanded ? 'Hide recording player' : 'Play recording'}
                      title={expanded ? 'Hide recording' : 'Play recording'}
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-charcoal/35">Recording pending</span>
                  )}
                </div>

                {expanded && recordingSource && (
                  <div className="mt-3 rounded-full bg-offwhite-300 px-2 py-1">
                    <audio controls src={recordingSource} className="h-9 w-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default PatientCallHistory;
