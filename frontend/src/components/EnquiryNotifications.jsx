import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2, VolumeX, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function EnquiryNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
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
        const { data } = await api.get('/enquiries/notifications', { skipCache: true });
        if (stopped) return;
        const fresh = data.items.some((item) => !seen.has(item.id));
        if (initialized && fresh) { beep(); window.dispatchEvent(new Event('enquiries:refresh')); }
        data.items.forEach((item) => seen.add(item.id)); initialized = true;
        setItems(data.items); setTotal(data.total); setError('');
      } catch { if (!stopped) setError('Notifications unavailable. Retrying...'); }
      finally { busy = false; }
    }
    setItems([]); setTotal(0); setOpen(false);
    const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, ''), { auth: { token: localStorage.getItem('crm_token') } });
    socket.on('connect', refresh);
    socket.on('enquiry:changed', () => { refresh(); window.dispatchEvent(new Event('enquiries:refresh')); });
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('enquiries:read', refresh);
    refresh(); const interval = setInterval(refresh, 30000);
    return () => { stopped = true; socket.disconnect(); clearInterval(interval); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('enquiries:read', refresh); audio.current?.close().catch(() => {}); audio.current = null; };
  }, [user?.id, user?._id]);
  if (!user) return null;
  return <div className="fixed bottom-4 right-4 z-40">
    {open && <section aria-label="Enquiry notifications" className="mb-2 w-[340px] max-w-[calc(100vw-32px)] rounded-lg border border-cardline bg-offwhite-100 shadow-lg"><header className="flex items-center justify-between border-b border-cardline p-3"><strong className="text-sm">Enquiry updates ({total})</strong><div className="flex gap-2"><button aria-label={sound ? 'Mute enquiry sound' : 'Enable enquiry sound'} title={sound ? 'Mute enquiry sound' : 'Enable enquiry sound'} onClick={() => { setSound(!sound); localStorage.setItem('enquiry-sound', sound ? 'off' : 'on'); }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17} /></button></div></header><div className="max-h-80 overflow-y-auto">{error && <p role="status" className="p-3 text-xs text-red-700">{error}</p>}{!items.length && <p className="p-4 text-sm text-charcoal/65">No unread enquiry updates.</p>}{items.map((item) => <button key={item.id} className="block w-full border-b border-cardline p-3 text-left text-sm hover:bg-sage/10" onClick={() => { api.post(`/enquiries/${item.enquiryId}/read`).then(() => window.dispatchEvent(new Event('enquiries:read'))).catch(() => {}); navigate(`/admin/enquiries?id=${item.enquiryId}`); setOpen(false); }}><span className="block break-words">{item.message}</span><small className="mt-1 block text-charcoal/65">{new Date(item.createdAt).toLocaleString('en-IN')}</small></button>)}</div></section>}
    <button aria-label="Enquiry notifications" aria-expanded={open} title="Enquiry notifications" onClick={() => setOpen(!open)} className="relative ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-sage text-white shadow-lg"><Bell size={20} />{total > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-700 px-1.5 text-[11px] font-bold">{total > 99 ? '99+' : total}</span>}</button>
  </div>;
}
