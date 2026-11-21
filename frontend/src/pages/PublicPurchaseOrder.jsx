import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Loader2, PenLine, Send } from 'lucide-react';
import DigitalPoPaper, { whenText } from '../components/digitalPo/DigitalPoPaper.jsx';
import SignaturePad from '../components/digitalPo/SignaturePad.jsx';
import { compressImage } from '../utils/compressImage.js';

// The parent's page for a digital purchase order (no login): read the purchase order, tick the consent, sign with a
// finger (or upload a photo of the signature) and submit. It talks only to the two public routes of this one link
// and never sends a staff login, so nothing else of the CRM can be reached from here.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const call = async (path, options = {}) => {
  const response = await fetch(`${API}/digital-po/public/${path}`, { credentials: 'omit', cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Please try again.'), { status: response.status });
  return data;
};

function Screen({ tone = 'info', title, children }) {
  const Icon = tone === 'done' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-[#D9E2DC] bg-white p-6 text-center shadow-sm">
      <img src="/manovaidya-logo.jfif" alt="Manovaidya" className="mx-auto h-12 w-12 rounded-lg object-cover" />
      <Icon size={36} className={`mx-auto mt-4 ${tone === 'done' ? 'text-[#1F5F4A]' : 'text-[#B45309]'}`} />
      <h1 className="mt-2 font-display text-lg font-bold text-charcoal">{title}</h1>
      <div className="mt-2 space-y-1 text-[14px] text-charcoal/70">{children}</div>
    </div>
  );
}

export default function PublicPurchaseOrder() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [ticks, setTicks] = useState([]);
  const [signerName, setSignerName] = useState('');
  const [relation, setRelation] = useState('');
  const [mode, setMode] = useState('draw');
  const [hasInk, setHasInk] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const pad = useRef(null);
  const errorBox = useRef(null);

  // Not for search engines; a plain title on the phone's tab.
  useEffect(() => {
    document.title = 'Purchase Order · Manovaidya';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let live = true;
    call(encodeURIComponent(token || ''))
      .then((data) => { if (!live) return; setState({ data }); if (data.snapshot?.patient?.parent) setSignerName(data.snapshot.patient.parent); })
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [token]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const show = (message) => { setError(message); window.setTimeout(() => errorBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };
  const data = state.data;
  const items = data?.consentItems || [];
  const allTicked = items.length > 0 && items.every((item) => ticks.includes(item.key));

  const pickPhoto = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { show('Please choose a photo (JPG / PNG) · कृपया photo चुनें'); return; }
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setError('');
  };

  const submit = async () => {
    setError('');
    if (!allTicked) { show('Please tick every consent point · सभी सहमति बिंदु टिक करें'); return; }
    if (signerName.trim().length < 2) { show('Please write your full name · अपना पूरा नाम लिखें'); return; }
    if (!relation) { show('Please choose who is signing · कौन sign कर रहा है चुनें'); return; }
    let file = null;
    if (mode === 'draw') {
      if (!hasInk) { show('Please sign in the box · box में sign करें'); return; }
      file = await pad.current.toBlob();
    } else {
      if (!photo) { show('Please upload a photo of your signature · signature की photo डालें'); return; }
      file = await compressImage(photo);
    }
    if (!file) { show('Could not read the signature, please try again'); return; }
    const form = new FormData();
    form.append('consents', JSON.stringify(ticks));
    form.append('signerName', signerName.trim());
    form.append('relation', relation);
    form.append('kind', mode === 'draw' ? 'drawn' : 'photo');
    // The version on this screen: if the clinic updated it meanwhile, the parent reads the new one first.
    form.append('version', String(data.version || 1));
    form.append('signature', file, mode === 'draw' ? 'signature.png' : (file.name || 'signature.jpg'));
    setSending(true);
    try {
      setDone(await call(`${encodeURIComponent(token)}/sign`, { method: 'POST', body: form }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { show(e.message); } finally { setSending(false); }
  };

  const page = (content) => <main className="min-h-screen bg-[#EEF3F0] px-3 py-5 sm:px-6 sm:py-8">{content}</main>;
  if (state.loading) return page(<p className="mt-16 flex items-center justify-center gap-2 text-sm text-charcoal/60"><Loader2 size={16} className="animate-spin" />Opening the purchase order…</p>);
  if (state.error) return page(<Screen title="Link not valid · Link सही नहीं है"><p>{state.error}</p></Screen>);
  if (done) {
    return page(
      <Screen tone="done" title="Thank you! Submitted · धन्यवाद! जमा हो गया">
        <p>Your consent and signature for purchase order <b>{done.ref}</b> reached Manovaidya on {whenText(done.signedAt)}.</p>
        <p>आपकी सहमति और signature clinic तक पहुँच गए हैं। अब यह page बंद कर सकते हैं।</p>
      </Screen>,
    );
  }
  if (data.status === 'signed') return page(<Screen tone="done" title="Already signed · पहले ही sign हो चुका है"><p>This purchase order ({data.ref}) was signed on {whenText(data.signedAt)}. For a copy, please ask the clinic.</p></Screen>);
  if (data.status === 'expired') return page(<Screen title="Link expired · Link की अवधि ख़त्म"><p>Please ask the clinic for a new link.</p><p>कृपया clinic से नया link माँगें।</p></Screen>);
  if (data.status === 'deleted') return page(<Screen title="Link not active · Link चालू नहीं है"><p>This purchase order link is no longer active. Please contact the clinic.</p><p>यह link अब चालू नहीं है, कृपया clinic से संपर्क करें।</p></Screen>);
  if (data.status === 'replaced') return page(<Screen title="A newer link was sent · नया link भेजा गया है"><p>Please open the latest link the clinic sent you.</p><p>कृपया clinic का भेजा हुआ नया link खोलें।</p></Screen>);

  return page(
    <>
      <p className="mx-auto mb-3 max-w-3xl rounded-xl bg-white/70 px-3 py-2 text-[13px] text-charcoal/70">कृपया purchase order ध्यान से पढ़ें, नीचे सहमति पर टिक करें और sign करके <b>Submit</b> करें। · Please read the purchase order, tick the consent below, sign and submit.</p>
      <DigitalPoPaper snapshot={data.snapshot} refNo={data.ref}>
        <h2 className="mb-2 mt-6 flex items-baseline gap-2 border-b border-[#D9E2DC] pb-1 font-display text-[15px] font-bold text-[#173F33]"><span className="text-[#1F5F4A]">4.</span>Parent acknowledgement &amp; consent · सहमति</h2>
        <div className="space-y-2">
          {items.map((item) => {
            const on = ticks.includes(item.key);
            return (
              <label key={item.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${on ? 'border-[#1F5F4A] bg-[#F2F7F4]' : 'border-[#D9E2DC] bg-white'}`}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F5F4A]" checked={on} onChange={() => setTicks((t) => (on ? t.filter((k) => k !== item.key) : [...t, item.key]))} />
                <span className="text-[14px] leading-snug">{item.en}<span className="mt-0.5 block text-[13px] text-charcoal/65">{item.hi}</span></span>
              </label>
            );
          })}
          {items.length > 1 && <button type="button" onClick={() => setTicks(allTicked ? [] : items.map((i) => i.key))} className="text-[13px] font-bold text-[#1F5F4A] underline">{allTicked ? 'Untick all' : 'Tick all · सब पर टिक करें'}</button>}
        </div>

        <h2 className="mb-2 mt-6 flex items-baseline gap-2 border-b border-[#D9E2DC] pb-1 font-display text-[15px] font-bold text-[#173F33]"><span className="text-[#1F5F4A]">5.</span>Signature · हस्ताक्षर</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px] font-bold">Your full name · आपका पूरा नाम
            <input value={signerName} maxLength={80} onChange={(e) => setSignerName(e.target.value)} className="mt-1 w-full rounded-xl border border-[#C9D5CD] bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[#1F5F4A]" autoComplete="name" />
          </label>
          <div>
            <p className="text-[13px] font-bold">Who is signing · आप कौन हैं</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(data.relations || []).map((r) => (
                <button key={r} type="button" aria-pressed={relation === r} onClick={() => setRelation(r)} className={`rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition ${relation === r ? 'border-[#1F5F4A] bg-[#1F5F4A] text-white' : 'border-[#C9D5CD] bg-white text-charcoal/80'}`}>{r}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 rounded-xl bg-[#F2F5F3] p-1">
          {[['draw', 'Sign with finger · उँगली से sign', PenLine], ['photo', 'Upload signature photo · photo डालें', Camera]].map(([key, label, Icon]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setError(''); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-bold transition sm:text-[13px] ${mode === key ? 'bg-white text-[#173F33] shadow-sm' : 'text-charcoal/60'}`}><Icon size={15} className="shrink-0" />{label}</button>
          ))}
        </div>
        <div className="mt-3">
          {mode === 'draw' ? <SignaturePad ref={pad} onChange={setHasInk} disabled={sending} /> : (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#9DB3A6] bg-white px-3 py-6 text-[14px] font-bold text-[#1F5F4A]">
                <Camera size={18} />{photo ? 'Choose another photo · दूसरी photo' : 'Take / choose a photo of your signature'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <p className="text-[12px] text-charcoal/55">सफ़ेद कागज़ पर sign करके उसकी साफ़ photo लें। · Sign on white paper and take a clear photo.</p>
              {photoUrl && <img src={photoUrl} alt="Signature photo" className="mx-auto max-h-48 rounded-lg border border-[#D9E2DC] object-contain" />}
            </div>
          )}
        </div>

        <div ref={errorBox}>{error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13.5px] font-semibold text-[#8A1C25]"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}{/reload/i.test(error) && <button type="button" onClick={() => window.location.reload()} className="mt-1 block rounded-lg bg-[#8A1C25] px-3 py-1.5 text-[13px] font-bold text-white">Reload · दोबारा खोलें</button>}</span></p>}</div>
        <button type="button" onClick={submit} disabled={sending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1F5F4A] px-4 py-3.5 text-[16px] font-bold text-white shadow-sm transition hover:bg-[#184D3C] disabled:opacity-60">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{sending ? 'Submitting… · जमा हो रहा है' : 'Submit · जमा करें'}
        </button>
        <p className="mt-2 text-center text-[11.5px] text-charcoal/50">Submitting records your consent, signature, name and the time. · Submit करने पर आपकी सहमति, signature, नाम और समय दर्ज होते हैं।</p>
      </DigitalPoPaper>
    </>,
  );
}
