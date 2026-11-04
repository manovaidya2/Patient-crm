import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { applyCorrections, getSpeechRecognition, joinWithSpace } from './ui/DictationButton.jsx';

// Voice typing on every form, page-wide: whichever note / text box is in use gets a small mic in its corner. Speak and
// the words are written into that box (the box's own onChange runs, so the form saves them as if typed). English
// (India) or Hindi, remembered per browser. Works in Chrome / Edge; elsewhere nothing shows. A box opts out with
// data-dictation="off" (on it or a parent); boxes that already have their own mic button are skipped.
const LANG_KEY = 'voiceTyping:lang';
const LANGS = { 'en-IN': 'EN', 'hi-IN': 'हि' };
const TEXT_INPUTS = ['text', 'search'];
const NO_INPUT_MODES = ['numeric', 'decimal', 'tel', 'email', 'url'];

const eligible = (el) => {
  if (!el || el.disabled || el.readOnly) return false;
  const isArea = el.tagName === 'TEXTAREA';
  const isText = el.tagName === 'INPUT' && TEXT_INPUTS.includes(el.type) && !NO_INPUT_MODES.includes(el.inputMode);
  if (!isArea && !isText) return false;
  if (el.closest('[data-dictation="off"]')) return false;
  if (el.parentElement?.querySelector('[data-dictation-button]')) return false;
  return true;
};

// Writes into a React-controlled field: the native setter plus an input event, so React's onChange fires.
const writeInto = (el, text) => {
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const value = text.length > max ? text.slice(0, max) : text;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const readLang = () => { try { return localStorage.getItem(LANG_KEY) === 'hi-IN' ? 'hi-IN' : 'en-IN'; } catch { return 'en-IN'; } };

export default function VoiceTyping() {
  const [supported] = useState(() => Boolean(getSpeechRecognition()));
  const [target, setTarget] = useState(null);
  const [box, setBox] = useState(null);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState(readLang);
  const targetRef = useRef(null);
  const listeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);
  const restartRef = useRef(null);
  const baseRef = useRef('');
  const priorRef = useRef('');
  const sessionRef = useRef('');

  const place = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) { setBox(null); return; }
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height, area: el.tagName === 'TEXTAREA' });
  }, []);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    window.clearTimeout(restartRef.current);
    try { recognitionRef.current?.stop?.(); } catch { /* already stopped */ }
    listeningRef.current = false;
    setListening(false);
  }, []);

  // Follow the field in use.
  useEffect(() => {
    if (!supported) return undefined;
    const onFocusIn = (e) => {
      const el = e.target;
      if (el === targetRef.current) return;
      if (listeningRef.current) stop();
      if (eligible(el)) { targetRef.current = el; setTarget(el); place(); }
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (listeningRef.current) return;
        if (document.activeElement !== targetRef.current) { targetRef.current = null; setTarget(null); setBox(null); }
      }, 150);
    };
    const onKey = (e) => { if (e.key === 'Escape' && listeningRef.current) stop(); };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [supported, place, stop]);

  // A textarea the user resizes, or a modal that moves: keep the mic on its corner; stop if the field is gone.
  useEffect(() => {
    if (!target) return undefined;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(target);
    const timer = window.setInterval(() => { if (!target.isConnected) { stop(); targetRef.current = null; setTarget(null); setBox(null); } else place(); }, 500);
    return () => { ro?.disconnect(); window.clearInterval(timer); };
  }, [target, place, stop]);

  useEffect(() => () => { manualStopRef.current = true; try { recognitionRef.current?.abort?.(); } catch { /* ignore */ } }, []);

  const push = (spoken) => { const el = targetRef.current; if (el?.isConnected) writeInto(el, joinWithSpace(baseRef.current, applyCorrections(spoken))); };

  const start = () => {
    const SpeechRecognition = getSpeechRecognition();
    const el = targetRef.current;
    if (!SpeechRecognition || !el) return;
    baseRef.current = String(el.value || '').trimEnd();
    priorRef.current = ''; sessionRef.current = ''; manualStopRef.current = false;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let final = ''; let interim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) final = joinWithSpace(final, text.trim()); else interim = joinWithSpace(interim, text);
      }
      sessionRef.current = final;
      push(joinWithSpace(joinWithSpace(priorRef.current, final), interim));
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { manualStopRef.current = true; listeningRef.current = false; setListening(false); }
    };
    recognition.onend = () => {
      priorRef.current = joinWithSpace(priorRef.current, sessionRef.current);
      sessionRef.current = '';
      push(priorRef.current);
      if (manualStopRef.current) { listeningRef.current = false; setListening(false); return; }
      // Chrome ends a session now and then: carry on until the user stops.
      restartRef.current = window.setTimeout(() => { try { recognition.start(); } catch { listeningRef.current = false; setListening(false); } }, 150);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); listeningRef.current = true; setListening(true); } catch { listeningRef.current = false; setListening(false); }
  };

  const switchLang = () => {
    const next = lang === 'en-IN' ? 'hi-IN' : 'en-IN';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* not remembered */ }
    if (listeningRef.current) stop();
  };

  if (!supported || !target || !box) return null;
  // Bottom-right corner of a text box; middle-right of a one-line field.
  const top = box.area ? box.top + box.height - 34 : box.top + (box.height - 28) / 2;
  const left = box.left + box.width - (box.area ? 66 : 64);
  const keepFocus = (e) => e.preventDefault();
  return (
    <div className="fixed z-[1000] flex items-center gap-1" style={{ top, left }} onMouseDown={keepFocus}>
      <button type="button" onMouseDown={keepFocus} onClick={switchLang} title={lang === 'en-IN' ? 'Speaking English - switch to Hindi' : 'Speaking Hindi - switch to English'}
        className="h-7 w-7 rounded-md border border-cardline bg-white text-[10.5px] font-bold text-charcoal/70 shadow-sm hover:bg-[#FBF7ED]">{LANGS[lang]}</button>
      <button type="button" onMouseDown={keepFocus} onClick={() => (listening ? stop() : start())}
        aria-label={listening ? 'Stop voice typing' : 'Start voice typing'} title={listening ? 'Listening... click (or Esc) to stop' : 'Voice typing: speak and it is written here'}
        className={`flex h-7 w-7 items-center justify-center rounded-md border shadow-sm transition ${listening ? 'animate-pulse border-[#B42318]/40 bg-[#B42318] text-white' : 'border-cardline bg-white text-sage hover:bg-[#F3F6F2]'}`}>
        {listening ? <Square size={12} /> : <Mic size={14} />}
      </button>
    </div>
  );
}
