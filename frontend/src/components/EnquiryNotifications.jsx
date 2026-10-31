import { useEffect, useRef, useState } from 'react';
import { Bell, MessageCircle, Volume2, VolumeX, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function EnquiryNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // On a phone the buttons sit above the tab bar; on the Team Chat page itself they would cover the message box.
  const onChatPage = pathname.startsWith('/admin/team-chat');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  // Unread team chat messages (the small chat button next to the bell).
  const [chatTotal, setChatTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(() => localStorage.getItem('enquiry-sound') !== 'off');
  const [error, setError] = useState('');
  const audio = useRef(null);
  const enabled = useRef(sound);
  enabled.current = sound;
  useEffect(() => {
    if (!user) return undefined;
    let stopped = false;
    let busy = false;
    let initialized = false;
    const seen = new Set();
    const unlock = () => {
      if (!audio.current) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio.current = new Audio(); }
      audio.current?.resume().catch(() => {});
    };
    const beep = () => {
      const context = audio.current;
      if (!enabled.current || context?.state !== 'running') return;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value = 740; gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    };
    async function refresh() {
      if (busy || stopped) return;
      busy = true;
      try {
        const [{ data }, chatRes] = await Promise.all([api.get('/enquiries/notifications', { skipCache: true }), api.get('/team-chat/unread', { skipCache: true }).catch(() => ({ data: { items: [], total: 0 } }))]);
        if (stopped) return;
        // Team chat: one line per thread with unread messages (keyed by thread + its last message time).
        const chatItems = (chatRes.data.items || []).map((c) => ({ id: `chat:${c.id}:${c.lastAt}`, chatId: c.id, withId: c.withId, message: `Team chat: ${c.unread} new from ${c.lastFrom}${c.patientName ? ` · ${c.patientName}` : ''} - ${c.subject}`, createdAt: c.lastAt }));
        const all = [...chatItems, ...data.items];
        const fresh = all.some((item) => !seen.has(item.id));
        if (initialized && fresh) { beep(); window.dispatchEvent(new Event('enquiries:refresh')); }
        all.forEach((item) => seen.add(item.id)); initialized = true;
        setItems(all); setTotal(data.total + (chatRes.data.total || 0)); setChatTotal(chatRes.data.total || 0); setError('');
      } catch { if (!stopped) setError('Notifications unavailable. Retrying...'); }
      finally { busy = false; }
    }
    setItems([]); setTotal(0); setOpen(false);
    const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, ''), { auth: { token: localStorage.getItem('crm_token') } });
    socket.on('connect', refresh);
    socket.on('enquiry:changed', () => { refresh(); window.dispatchEvent(new Event('enquiries:refresh')); });
    socket.on('team-chat:changed', refresh);
    window.addEventListener('team-chat:read', refresh);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('enquiries:read', refresh);
    refresh(); const interval = setInterval(refresh, 30000);
    return () => { stopped = true; socket.disconnect(); clearInterval(interval); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('enquiries:read', refresh); window.removeEventListener('team-chat:read', refresh); audio.current?.close().catch(() => {}); audio.current = null; };
  }, [user?.id, user?._id]);
  if (!user) return null;
  return <div className={`enquiry-bell fixed bottom-1.5 right-2 z-40 flex flex-col items-end max-md:bottom-[92px] ${onChatPage ? 'max-md:hidden' : ''}`}>
    {open && <section aria-label="Enquiry notifications" className="mb-2 w-[340px] max-w-[calc(100vw-32px)] rounded-lg border border-cardline bg-offwhite-100 shadow-lg"><header className="flex items-center justify-between border-b border-cardline p-3"><strong className="text-sm">Updates ({total})</strong><div className="flex gap-2"><button aria-label={sound ? 'Mute enquiry sound' : 'Enable enquiry sound'} title={sound ? 'Mute enquiry sound' : 'Enable enquiry sound'} onClick={() => { setSound(!sound); localStorage.setItem('enquiry-sound', sound ? 'off' : 'on'); }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17} /></button></div></header><div className="max-h-80 overflow-y-auto">{error && <p role="status" className="p-3 text-xs text-red-700">{error}</p>}{!items.length && <p className="p-4 text-sm text-charcoal/65">No unread chats or enquiry updates.</p>}{items.map((item) => <button key={item.id} className="block w-full border-b border-cardline p-3 text-left text-sm hover:bg-sage/10" onClick={() => { if (item.chatId) { navigate(`/admin/team-chat?${item.withId ? `with=${item.withId}&` : ''}q=${item.chatId}`); setOpen(false); return; } api.post(`/enquiries/${item.enquiryId}/read`).then(() => window.dispatchEvent(new Event('enquiries:read'))).catch(() => {}); navigate(`/admin/enquiries?id=${item.enquiryId}`); setOpen(false); }}><span className="block break-words">{item.message}</span><small className="mt-1 block text-charcoal/65">{new Date(item.createdAt).toLocaleString('en-IN')}</small></button>)}</div></section>}
    <div className="flex items-center"><button type="button" aria-label={`Team chat${chatTotal ? `, ${chatTotal} unread` : ''}`} title="Team chat" onClick={() => navigate('/admin/team-chat')} className="relative mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-sage shadow-md ring-1 ring-sage/40"><MessageCircle size={15} />{chatTotal > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#F97316] px-1 text-[10px] font-bold leading-4 text-white">{chatTotal > 99 ? '99+' : chatTotal}</span>}</button>
    <button aria-label="Enquiry notifications" aria-expanded={open} title="Enquiry notifications" onClick={() => setOpen(!open)} className="relative ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-sage text-white shadow-md"><Bell size={15} />{total > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-700 px-1 text-[10px] leading-4 font-bold">{total > 99 ? '99+' : total}</span>}</button></div>
  </div>;
}
