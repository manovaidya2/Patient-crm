import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Lock, Paperclip, Send } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { ROLE_LABELS } from '../../constants/roles.js';

const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const fileUrl = (url) => (/^https?:/.test(url || '') ? url : `${SERVER_BASE}${url}`);
const input = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2 text-sm';
export const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const dayOf = (v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// The messages of one thread (the direct chat with a person, or a query) as chat bubbles, with the composer.
// `chat` is the full thread view; `onChanged(chat)` gets the thread back after a send.
export default function ChatThread({ chat, onChanged, placeholder = 'Message', emptyText = 'No messages yet. Say hello.', className = '' }) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [chat?.id, chat?.messages?.length]);
  const send = async (e) => {
    e.preventDefault();
    if (!message.trim() && !files.length) return;
    setSending(true); setError('');
    try {
      const body = new FormData(); body.append('message', message); files.forEach((f) => body.append('files', f));
      const { data } = await api.post(`/team-chat/${chat.id}/messages`, body);
      setMessage(''); setFiles([]); onChanged?.(data.chat);
    } catch (err) { setError(err.response?.data?.message || 'Could not send'); } finally { setSending(false); }
  };
  if (!chat) return null;
  let lastDay = '';
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#FBF7ED] px-4 py-3">
        {!chat.messages.length && <p className="py-8 text-center text-sm text-charcoal/50">{emptyText}</p>}
        {chat.messages.map((m) => {
          const d = dayOf(m.createdAt); const showDay = d !== lastDay; lastDay = d;
          return (
            <div key={m.id}>
              {showDay && <p className="my-2 text-center text-[11px] font-semibold text-charcoal/45">{d}</p>}
              {m.kind === 'event' ? <p className="mx-auto w-fit max-w-[90%] rounded-full bg-white px-3 py-1 text-center text-[11.5px] text-charcoal/65">{m.body} <span className="text-charcoal/45">· {m.senderName}, {when(m.createdAt)}</span></p> : (
                <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${m.mine ? 'rounded-br-sm bg-[#DCEBDD] text-charcoal' : 'rounded-bl-sm bg-white text-charcoal'}`}>
                    {!m.mine && <p className="text-[11px] font-bold text-sage">{m.senderName} <span className="font-normal text-charcoal/50">· {ROLE_LABELS[m.senderRole] || m.senderRole}</span></p>}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.files?.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{m.files.map((f, i) => /\.(png|jpe?g|webp|gif)$/i.test(f.url) ? <a key={i} href={fileUrl(f.url)} target="_blank" rel="noreferrer"><img src={fileUrl(f.url)} alt={f.fileName} className="h-24 w-24 rounded-md object-cover" /></a> : <a key={i} href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-offwhite-200 px-2 py-1 text-xs font-semibold text-sage"><Paperclip size={12} />{f.fileName}</a>)}</div>}
                    <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${m.mine ? 'text-charcoal/55' : 'text-charcoal/45'}`}>{when(m.createdAt)}{m.mine && (m.seenBy?.length ? <CheckCheck size={12} className="text-sky-700" title={`Seen ${when(m.seenBy[0])}`} /> : <Check size={12} />)}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {chat.actions?.includes('message') ? (
        <form onSubmit={send} className="shrink-0 border-t border-cardline bg-white p-3">
          {error && <p className="mb-1 text-xs text-red-700">{error}</p>}
          {files.length > 0 && <ul className="mb-1.5 flex flex-wrap gap-1.5">{files.map((f, i) => <li key={i} className="inline-flex items-center gap-1 rounded-full bg-offwhite-200 px-2 py-0.5 text-xs">{f.name}<button type="button" aria-label="Remove" onClick={() => setFiles((l) => l.filter((_, n) => n !== i))}>×</button></li>)}</ul>}
          <div className="flex items-end gap-2">
            <label className="cursor-pointer rounded-lg border border-cardline p-2 text-sage hover:bg-[#F3F6F2]" title="Attach images / PDF"><Paperclip size={16} /><input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { setFiles((l) => [...l, ...e.target.files].slice(0, 5)); e.target.value = ''; }} /></label>
            <textarea className={`${input} resize-none text-[15px]`} rows={2} maxLength={4000} placeholder={placeholder} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
            <Button type="submit" disabled={sending || (!message.trim() && !files.length)}><Send size={15} />{sending ? '...' : 'Send'}</Button>
          </div>
        </form>
      ) : <p className="border-t border-cardline p-3 text-center text-xs text-charcoal/55"><Lock size={12} className="mr-1 inline" />This chat is closed{chat.closedByName ? ` by ${chat.closedByName}, ${when(chat.closedAt)}` : ''}.</p>}
    </div>
  );
}
