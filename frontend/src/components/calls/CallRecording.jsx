import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import api from '../../api/axios.js';

// A call recording from the staff phones: fetched with the login (it is not public), then played from memory; a
// download saves it. url: the API path (Calls page: /phone-calls/:id/recording; a care session: its own route).
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`);
const extOf = (type = '') => (type.includes('webm') ? 'webm' : type.includes('mp4') ? 'm4a' : type.includes('mpeg') ? 'mp3' : type.includes('wav') ? 'wav' : 'audio');

export default function CallRecording({ url, size = 0, fileName = 'Call-recording' }) {
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const audio = useRef(null);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const fetchBlob = async () => (await api.get(url, { responseType: 'blob', skipCache: true })).data;
  const play = async () => {
    if (src) { if (audio.current?.paused) audio.current.play(); else audio.current?.pause(); return; }
    setBusy(true); setError('');
    try { setSrc(URL.createObjectURL(await fetchBlob())); } catch { setError('Could not load the recording'); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setError('');
    try {
      const blob = await fetchBlob();
      const link = document.createElement('a');
      const href = URL.createObjectURL(blob);
      link.href = href; link.download = `${fileName}.${extOf(blob.type)}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch { setError('Could not download the recording'); } finally { setBusy(false); }
  };
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={play} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#1F5F4A] px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#173F33] disabled:opacity-50">
          {playing ? <Pause size={13} /> : <Play size={13} />}{busy && !src ? 'Loading…' : playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={download} disabled={busy} title="Download the recording" aria-label="Download the recording" className="inline-flex items-center rounded-lg border border-cardline bg-white p-1.5 text-charcoal/70 hover:border-sage disabled:opacity-50"><Download size={14} /></button>
        {size > 0 && <span className="text-[11px] text-charcoal/45">{kb(size)}</span>}
      </div>
      {src && <audio ref={audio} src={src} controls autoPlay onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="mt-1.5 h-8 w-full max-w-[280px]" />}
      {error && <p className="mt-1 text-[11.5px] font-semibold text-[#8A1C25]">{error}</p>}
    </div>
  );
}
