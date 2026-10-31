import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Plus } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import useLiveEvent from '../../api/useLiveEvent.js';
import { useAuth } from '../../context/AuthContext.jsx';

const STATUS = { open: ['Open', 'bg-[#FFF1E6] text-[#C2410C]'], resolved: ['Resolved - waiting for close', 'bg-sky-50 text-sky-900'], closed: ['Closed', 'bg-[#E6F2EA] text-[#1F6B41]'] };
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// The team chats about one purchase order (or one medicine job) with "Raise query". Only threads the signed-in person
// is in are listed (the admin: all of them).
export default function ChatQueries({ poId = '', jobId = '', patient = null, compact = false }) {
  const { user } = useAuth();
  const me = String(user?.id || user?._id || '');
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();
  const load = useCallback(() => {
    api.get('/team-chat', { params: poId ? { poId } : { jobId }, skipCache: true }).then(({ data }) => setRows(data.rows || [])).catch(() => setRows([]));
  }, [poId, jobId]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent('team-chat:changed', load);
  return (
    <section className={`rounded-[14px] border border-[#E8DFCB] bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[13.5px] font-bold text-charcoal"><MessageCircle size={16} className="text-sage" />Team chat & queries{rows.length ? <span className="rounded-full bg-offwhite-200 px-2 py-0.5 text-[11px] text-charcoal/60">{rows.length}</span> : null}</h3>
        {poId && <Button size="sm" variant="outline" onClick={() => navigate(`/admin/team-chat?po=${poId}`)}><Plus size={14} />Raise query</Button>}
      </div>
      {!rows.length ? <p className="text-xs text-charcoal/55">{poId ? 'No query on this PO yet. Raise one when something is stuck (e.g. medicine overdue) - it goes to one person with the patient and PO details.' : 'No query about this request.'}</p> : (
        <ul className="divide-y divide-cardline">
          {rows.map((r) => {
            const [label, tone] = STATUS[r.status] || STATUS.open;
            return (
              <li key={r.id} className="py-2">
                <Link to={`/admin/team-chat?with=${r.createdById === me ? r.assignedToId : r.createdById}&q=${r.id}`} className="block rounded-md px-1 py-0.5 hover:bg-[#F3F6F2]">
                  <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-charcoal">{r.subject}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>{r.unread > 0 && <span className="rounded-full bg-[#9F1D1D] px-1.5 text-[10px] font-bold text-white">{r.unread} new</span>}</p>
                  <p className="text-xs text-charcoal/55">{r.createdByName} → {r.assignedToName} · {when(r.lastMessageAt)}{r.lastMessage ? ` · ${r.lastMessage.senderName}: ${r.lastMessage.preview}` : ''}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
