import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Eye, Forward, MessageCircle, MessageSquarePlus, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS, ROLES } from '../../constants/roles.js';
import RaiseQueryModal from '../../components/teamChat/RaiseQueryModal.jsx';
import ChatThread, { when } from '../../components/teamChat/ChatThread.jsx';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2 text-sm';
const STATUS = { open: ['Open', 'bg-[#FFF1E6] text-[#C2410C]'], resolved: ['Resolved', 'bg-sky-50 text-sky-900'], closed: ['Closed', 'bg-[#E6F2EA] text-[#1F6B41]'] };
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const Avatar = ({ name, size = 'h-11 w-11 text-base' }) => <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-[#E9EFE9] font-bold text-sage`}>{initials(name)}</span>;

// Team Chat, WhatsApp style: every person in the team on the left (unread first, then by last message); on the right
// the running chat with the chosen person and the queries raised between the two of you. "Raise query" sits inside
// that chat and offers the query types for that person's role. Only the two of you see a chat; the admin can open
// any pair's conversation ("All conversations").
export default function TeamChat() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [params, setParams] = useSearchParams();
  const withId = params.get('with') || '';
  const queryId = params.get('q') || '';
  const pairKey = params.get('pair') || '';
  // From a PO's "Raise query": the query form opens inside the chat with the suggested person (Medicine Dept etc.).
  const poId = params.get('po') || '';
  const [poSuggest, setPoSuggest] = useState(null);
  const [people, setPeople] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [mode, setMode] = useState(pairKey ? 'pairs' : 'people');
  const [search, setSearch] = useState('');
  const [conv, setConv] = useState(null); // { person, chat, queries }
  const [query, setQuery] = useState(null); // the open query thread
  const [error, setError] = useState('');
  const [raise, setRaise] = useState(false);
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [saving, setSaving] = useState(false);
  // The chat fills the screen from where it starts down to the bottom (above the mobile tab bar), whatever the zoom.
  const shell = useRef(null);
  const [shellHeight, setShellHeight] = useState('calc(100vh - 6rem)');
  useEffect(() => {
    const fit = () => {
      if (!shell.current) return;
      const top = shell.current.getBoundingClientRect().top + window.scrollY;
      const tabBar = document.querySelector('nav[aria-label="Quick navigation"]');
      const bottom = tabBar && getComputedStyle(tabBar).display !== 'none' ? tabBar.getBoundingClientRect().height : 0;
      setShellHeight(`${Math.max(420, window.innerHeight - top - bottom - 12)}px`);
    };
    fit(); window.addEventListener('resize', fit);
    const t = setTimeout(fit, 300);
    return () => { window.removeEventListener('resize', fit); clearTimeout(t); };
  }, []);

  const loadPeople = useCallback(() => {
    api.get('/team-chat/people', { skipCache: true }).then(({ data }) => setPeople(data.people || [])).catch((err) => setError(err.response?.data?.message || 'Could not load the team'));
    if (isAdmin) api.get('/team-chat/pairs', { skipCache: true }).then(({ data }) => setPairs(data.pairs || [])).catch(() => {});
  }, [isAdmin]);
  const loadConv = useCallback(() => {
    if (pairKey && isAdmin) { api.get(`/team-chat/pair/${pairKey}`, { skipCache: true }).then(({ data }) => { const p = pairs.find((x) => x.pairKey === pairKey); setConv({ person: p ? { name: `${p.a.name} ↔ ${p.b.name}`, role: '', pair: true } : { name: 'Conversation', pair: true }, chat: data.chat, queries: data.queries }); setError(''); }).catch((err) => setError(err.response?.data?.message || 'Could not open')); return; }
    if (!withId) { setConv(null); return; }
    api.get(`/team-chat/with/${withId}`, { skipCache: true }).then(({ data }) => { setConv({ person: data.person, chat: data.chat, queries: data.queries }); setError(''); window.dispatchEvent(new Event('team-chat:read')); }).catch((err) => { setConv(null); setError(err.response?.data?.message || 'Could not open the chat'); });
  }, [withId, pairKey, isAdmin, pairs]);
  const loadQuery = useCallback(() => {
    if (!queryId) { setQuery(null); return; }
    api.get(`/team-chat/${queryId}`, { skipCache: true }).then(({ data }) => { setQuery(data.chat); window.dispatchEvent(new Event('team-chat:read')); }).catch((err) => { setQuery(null); setError(err.response?.data?.message || 'Query not found'); });
  }, [queryId]);
  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => {
    if (!poId) { setPoSuggest(null); return; }
    api.get('/team-chat/context', { params: { poId }, skipCache: true }).then(({ data }) => setPoSuggest(data.suggest || null)).catch(() => setPoSuggest(null));
  }, [poId]);
  // One person of the suggested role: open their chat straight away; several: the list shows that role to pick from.
  useEffect(() => {
    if (!poId || withId || !poSuggest || !people.length) return;
    const ofRole = people.filter((p) => p.role === poSuggest.role);
    if (ofRole.length === 1) setParams({ po: poId, with: ofRole[0].id });
  }, [poId, withId, poSuggest, people, setParams]);
  useEffect(() => { loadConv(); }, [loadConv]);
  useEffect(() => { loadQuery(); }, [loadQuery]);
  useLiveEvent('team-chat:changed', () => { loadPeople(); loadConv(); loadQuery(); });

  const openPerson = (id) => setParams(poId ? { po: poId, with: id } : { with: id });
  const openQuery = (id) => setParams({ ...(withId ? { with: withId } : {}), ...(pairKey ? { pair: pairKey } : {}), q: id });
  const closeQuery = () => setParams(withId ? { with: withId } : pairKey ? { pair: pairKey } : {});
  const act = async () => {
    setSaving(true); setError('');
    try { const { data } = await api.post(`/team-chat/${query.id}/action`, { action, note, assignedTo: forwardTo }); setQuery(data.chat); setAction(''); setNote(''); setForwardTo(''); loadConv(); loadPeople(); }
    catch (err) { setError(err.response?.data?.message || 'Could not do that'); } finally { setSaving(false); }
  };
  const [staff, setStaff] = useState([]);
  useEffect(() => { if (action === 'forward') api.get('/team-chat/staff', { skipCache: true }).then(({ data }) => setStaff(data.users || [])).catch(() => setStaff([])); }, [action]);

  const q = search.trim().toLowerCase();
  const shownPeople = useMemo(() => {
    const list = people.filter((p) => !q || p.name.toLowerCase().includes(q) || (ROLE_LABELS[p.role] || p.role).toLowerCase().includes(q));
    // Raising from a PO: the suggested role first.
    return poSuggest ? [...list].sort((a, b) => (b.role === poSuggest.role) - (a.role === poSuggest.role)) : list;
  }, [people, q, poSuggest]);
  const shownPairs = useMemo(() => pairs.filter((p) => !q || `${p.a.name} ${p.b.name}`.toLowerCase().includes(q)), [pairs, q]);
  const person = conv?.person;
  const chip = (active) => `rounded-full border px-3 py-1 text-xs font-bold ${active ? 'border-charcoal bg-charcoal text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`;

  return (
    <div ref={shell} style={{ height: shellHeight }} className="flex min-h-[420px] flex-col gap-3">
      <PageHeader icon={MessageCircle} title="Team Chat" eyebrow={undefined} subtitle={isAdmin ? 'Chat with anyone in the team; as admin you can also open any two people\'s conversation.' : 'Chat with anyone in the team. Only you and that person can read it (and the admin). Raise a query inside the chat when you need something done.'} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* People */}
        <aside className={`min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#E8DFCB] bg-white ${withId || pairKey ? 'hidden lg:flex' : 'flex'}`}>
          <div className="space-y-2 border-b border-cardline p-3">
            {poId && !withId && poSuggest && <p className="rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs font-semibold text-[#C2410C]">Pick the {ROLE_LABELS[poSuggest.role] || poSuggest.role} person this query goes to.</p>}
            {isAdmin && <div className="flex gap-1.5"><button type="button" className={chip(mode === 'people')} onClick={() => setMode('people')}><Users size={12} className="mr-1 inline" />My chats</button><button type="button" className={chip(mode === 'pairs')} onClick={() => setMode('pairs')}><Eye size={12} className="mr-1 inline" />All conversations</button></div>}
            <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-charcoal/40" /><input className={`${input} pl-8`} placeholder={mode === 'pairs' ? 'Search two people' : 'Search a person or role'} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-cardline overflow-y-auto">
            {mode === 'people' ? shownPeople.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => openPerson(p.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#F3F6F2] ${withId === p.id ? 'bg-[#F3F6F2]' : ''}`}>
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className={`truncate text-[15px] ${p.unread ? 'font-extrabold text-charcoal' : 'font-semibold text-charcoal'}`}>{p.name}</span><span className="shrink-0 text-[10px] text-charcoal/45">{p.lastAt ? when(p.lastAt) : ''}</span></span>
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-charcoal/60">{p.last ? `${p.last.senderName === user?.name ? 'You' : p.last.senderName}: ${p.last.preview || (p.last.kind === 'query' ? 'query' : 'file')}` : ROLE_LABELS[p.role] || p.role}</span><span className="flex shrink-0 gap-1">{p.openQueries > 0 && <span className="rounded-full bg-[#FFF1E6] px-1.5 text-[10px] font-bold text-[#C2410C]" title="Open queries">{p.openQueries} Q</span>}{p.unread > 0 && <span className="rounded-full bg-[#2F8F5B] px-1.5 text-[10px] font-bold text-white">{p.unread}</span>}</span></span>
                    {p.last && <span className="block truncate text-[10px] text-charcoal/40">{ROLE_LABELS[p.role] || p.role}</span>}
                  </span>
                </button>
              </li>
            )) : shownPairs.map((p) => (
              <li key={p.pairKey}>
                <button type="button" onClick={() => setParams({ pair: p.pairKey })} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F3F6F2] ${pairKey === p.pairKey ? 'bg-[#F3F6F2]' : ''}`}>
                  <span className="flex -space-x-2"><Avatar name={p.a.name} size="h-8 w-8 text-xs" /><Avatar name={p.b.name} size="h-8 w-8 text-xs" /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-charcoal">{p.a.name} ↔ {p.b.name}</span><span className="shrink-0 text-[10px] text-charcoal/45">{when(p.lastAt)}</span></span><span className="block truncate text-xs text-charcoal/55">{p.last ? `${p.last.senderName}: ${p.last.preview}` : ''}{p.openQueries ? ` · ${p.openQueries} open quer${p.openQueries === 1 ? 'y' : 'ies'}` : ''}</span></span>
                </button>
              </li>
            ))}
            {!(mode === 'people' ? shownPeople : shownPairs).length && <li className="py-8 text-center text-sm text-charcoal/50">{mode === 'pairs' ? 'No conversations yet.' : 'Nobody found.'}</li>}
          </ul>
        </aside>

        {/* Conversation */}
        <main className={`min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#E8DFCB] bg-white ${withId || pairKey ? 'flex' : 'hidden lg:flex'}`}>
          {!conv ? <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-charcoal/55"><MessageCircle size={28} className="text-charcoal/30" />Pick a person on the left to chat or raise a query.</div> : query ? (
            // One query, opened from the conversation.
            <>
              <header className="max-h-[45%] shrink-0 overflow-y-auto border-b border-cardline px-4 py-3">
                <button type="button" onClick={closeQuery} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><ArrowLeft size={13} />Back to chat with {person.name}</button>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-charcoal">{query.subject}<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${(STATUS[query.status] || STATUS.open)[1]}`}>{(STATUS[query.status] || STATUS.open)[0]}</span></h2>
                    <p className="text-xs text-charcoal/60">{query.kind === 'query' ? 'Query' : 'Discussion'} by {query.createdByName} → {query.assignedToName} · {when(query.createdAt)}</p>
                    {(query.patientName || query.context?.poNumber) && <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">{query.patientId ? <Link to={`/admin/patients/${query.patientId}`} className="inline-flex items-center gap-1 font-semibold text-sage hover:underline"><ExternalLink size={12} />{query.patientName}{query.patientCode ? ` (${query.patientCode})` : ''}</Link> : <span>{query.patientName}</span>}{query.context?.purchaseOrder && <Link to={`/admin/purchase-orders/${query.context.purchaseOrder}`} className="inline-flex items-center gap-1 font-mono font-semibold text-sage hover:underline"><ExternalLink size={12} />{query.context.poNumber}</Link>}{query.context?.medicineJob && <Link to={`/admin/medicine-jobs/${query.context.medicineJob}`} className="inline-flex items-center gap-1 font-semibold text-sage hover:underline"><ExternalLink size={12} />Medicine job</Link>}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {query.actions.includes('resolve') && <Button size="sm" onClick={() => { setAction('resolve'); setNote(''); }}><ShieldCheck size={14} />Resolve</Button>}
                    {query.actions.includes('close') && <Button size="sm" variant="outline" onClick={() => { setAction('close'); setNote(''); }}><Check size={14} />Close{query.status === 'resolved' ? ' (satisfied)' : ''}</Button>}
                    {query.actions.includes('reopen') && <Button size="sm" variant="outline" onClick={() => { setAction('reopen'); setNote(''); }}><RotateCcw size={14} />Reopen</Button>}
                    {query.actions.includes('forward') && <Button size="sm" variant="outline" onClick={() => { setAction('forward'); setNote(''); setForwardTo(''); }}><Forward size={14} />Forward</Button>}
                  </div>
                </div>
                {query.context?.summary && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-[#F3F6F2] px-3 py-2 font-body text-xs text-charcoal/75">{query.context.summary}</pre>}
                {query.resolution && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900"><b>Resolution</b> by {query.resolvedByName}, {when(query.resolvedAt)}: {query.resolution}{query.status === 'resolved' && query.actions.includes('close') ? ' - satisfied? Close the query, or reopen it.' : ''}</p>}
              </header>
              <ChatThread chat={query} onChanged={(c) => { setQuery(c); loadPeople(); }} placeholder="Reply in this query" />
            </>
          ) : (
            <>
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cardline px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setParams({})} className="lg:hidden" aria-label="Back"><ArrowLeft size={18} /></button>
                  <Avatar name={person.pair ? person.name.split(' ')[0] : person.name} />
                  <div className="min-w-0"><h2 className="truncate text-lg font-bold text-charcoal">{person.name}</h2><p className="text-[13px] text-charcoal/60">{person.pair ? 'Admin view of this conversation' : ROLE_LABELS[person.role] || person.role}</p></div>
                </div>
                {!person.pair && <Button size="sm" onClick={() => setRaise(true)}><MessageSquarePlus size={15} />Raise query</Button>}
              </header>
              {poId && !person.pair && <div className="max-h-[55%] shrink-0 overflow-y-auto"><RaiseQueryModal open inline poId={poId} person={person} initialType={poSuggest?.queryType || ''} onClose={() => setParams({ with: withId })} onCreated={(c) => { setParams({ with: withId, q: c.id }); loadConv(); loadPeople(); }} /></div>}
              {conv.queries.length > 0 && (
                <div className="shrink-0 border-b border-cardline bg-[#FBF7ED] px-4 py-2">
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/50">Queries between you {conv.queries.some((x) => x.status !== 'closed') ? '' : '(all closed)'}</p>
                  <ul className="flex gap-2 overflow-x-auto pb-1">
                    {conv.queries.map((x) => { const [label, tone] = STATUS[x.status] || STATUS.open; return (
                      <li key={x.id} className="shrink-0">
                        <button type="button" onClick={() => openQuery(x.id)} className="w-[230px] rounded-lg border border-cardline bg-white px-3 py-2 text-left hover:border-sage/60">
                          <p className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-charcoal">{x.subject}</span>{x.unread > 0 && <span className="shrink-0 rounded-full bg-[#2F8F5B] px-1.5 text-[10px] font-bold text-white">{x.unread}</span>}</p>
                          <p className="flex items-center justify-between gap-2 text-[10.5px] text-charcoal/55"><span className="truncate">{x.lastMessage ? `${x.lastMessage.senderName}: ${x.lastMessage.preview}` : ''}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 font-bold ${tone}`}>{label}</span></p>
                        </button>
                      </li>
                    ); })}
                  </ul>
                </div>
              )}
              {conv.chat ? <ChatThread chat={conv.chat} onChanged={(c) => { setConv((v) => ({ ...v, chat: c })); loadPeople(); }} placeholder={`Message ${person.pair ? '' : person.name}`} emptyText={person.pair ? 'These two have not chatted directly.' : `No messages with ${person.name} yet. Say hello, or raise a query.`} /> : <p className="p-6 text-center text-sm text-charcoal/50">These two have not chatted directly; see their queries above.</p>}
            </>
          )}
        </main>
      </div>

      {person && !person.pair && !poId && <RaiseQueryModal open={raise} onClose={() => setRaise(false)} person={person} onCreated={(c) => { loadConv(); loadPeople(); openQuery(c.id); }} />}
      <Modal open={Boolean(action)} onClose={() => !saving && setAction('')} title={{ resolve: 'Resolve this query', close: 'Close this query', reopen: 'Reopen this query', forward: 'Forward to someone else' }[action] || ''} className="max-w-lg">
        <div className="space-y-3">
          {action === 'forward' && <label className="block space-y-1 text-sm">Forward to *<select className={input} value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}><option value="">Select the person</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABELS[s.role] || s.role}</option>)}</select></label>}
          <label className="block space-y-1 text-sm">{{ resolve: 'Resolution / reason *', close: 'Note (optional)', reopen: 'Why is it reopened? *', forward: 'Note for them (optional)' }[action]}<textarea className={input} rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {action === 'close' && <p className="text-xs text-charcoal/60">Close it when you are satisfied with the answer. The full chat stays in history for both of you.</p>}
          <div className="flex gap-2"><Button disabled={saving || (['resolve', 'reopen'].includes(action) && !note.trim()) || (action === 'forward' && !forwardTo)} onClick={act}>{saving ? 'Saving...' : 'Confirm'}</Button><Button variant="outline" disabled={saving} onClick={() => setAction('')}>Cancel</Button></div>
        </div>
      </Modal>
    </div>
  );
}
