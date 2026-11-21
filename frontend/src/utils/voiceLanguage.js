import { useCallback, useEffect, useState } from 'react';

// The language of voice typing, shared by every mic in the app (the page-wide one on every text box and the mic
// buttons beside some boxes) and remembered per browser. Hinglish is the default: Hindi speech is recognised and
// written in Roman letters ("aap kaise hain"); English words stay as they are. English and Hindi (Devanagari) can be
// picked instead with the small language button next to any mic.
const KEY = 'voiceTyping:language';
const EVENT = 'crm:voice-language';
export const VOICE_LANGS = {
  hinglish: { short: 'HiEn', name: 'Hinglish', recognition: 'hi-IN' },
  'en-IN': { short: 'EN', name: 'English', recognition: 'en-IN' },
  'hi-IN': { short: 'हि', name: 'Hindi', recognition: 'hi-IN' },
};
const ORDER = ['hinglish', 'en-IN', 'hi-IN'];

export const readVoiceLang = () => {
  try { const saved = localStorage.getItem(KEY); return VOICE_LANGS[saved] ? saved : 'hinglish'; } catch { return 'hinglish'; }
};
export const nextVoiceLang = (lang) => ORDER[(ORDER.indexOf(lang) + 1) % ORDER.length];
export const voiceLangTitle = (lang) => `Voice typing in ${VOICE_LANGS[lang]?.name || 'Hinglish'} - click to switch to ${VOICE_LANGS[nextVoiceLang(lang)].name}`;

// [lang, setLang]: every mic follows a change made at any one of them.
export function useVoiceLanguage() {
  const [lang, setLangState] = useState(readVoiceLang);
  useEffect(() => {
    const follow = (event) => setLangState(VOICE_LANGS[event.detail] ? event.detail : readVoiceLang());
    window.addEventListener(EVENT, follow);
    return () => window.removeEventListener(EVENT, follow);
  }, []);
  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(KEY, next); } catch { /* not remembered */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);
  return [lang, setLang];
}

// ---- Devanagari -> Hinglish (Roman letters, the way people type Hindi in chat) ----
const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
};
// With a nukta dot: क़ ख़ ग़ ज़ ड़ ढ़ फ़.
const WITH_NUKTA = { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f', 'य': 'y' };
const VOWELS = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
const SIGNS = { 'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
const VIRAMA = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CHANDRABINDU = 'ँ';
const VISARGA = 'ः';
// Everyday words, written the usual Hinglish way.
const WORDS = {
  'में': 'mein', 'मैं': 'main', 'हैं': 'hain', 'है': 'hai', 'नहीं': 'nahi', 'नही': 'nahi', 'क्या': 'kya', 'यह': 'yeh', 'वह': 'woh',
  'ये': 'ye', 'वो': 'wo', 'और': 'aur', 'हूँ': 'hoon', 'हूं': 'hoon', 'ठीक': 'theek', 'हाँ': 'haan', 'हां': 'haan', 'जी': 'ji',
};
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9', '।': '.', '॥': '.' };

const hasVowel = (u) => (u.v === null ? !u.drop : u.v !== '');

function wordToHinglish(word) {
  const known = WORDS[word.normalize('NFC')];
  if (known) return known;
  const chars = [...word.normalize('NFD')];
  // One unit per letter: { c: consonant, v: null (the inherent "a") | '' (half letter) | vowel, nasal, h }.
  const units = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const last = units[units.length - 1];
    if (CONSONANTS[ch] !== undefined) {
      let c = CONSONANTS[ch];
      if (chars[i + 1] === NUKTA) { c = WITH_NUKTA[ch] || c; i += 1; }
      units.push({ c, v: null });
    } else if (SIGNS[ch]) {
      if (last && last.c && last.v === null) last.v = SIGNS[ch]; else units.push({ c: '', v: SIGNS[ch], sign: true });
    } else if (ch === VIRAMA) {
      if (last) last.v = '';
    } else if (VOWELS[ch]) {
      units.push({ c: '', v: VOWELS[ch], independent: true });
    } else if (ch === ANUSVARA || ch === CHANDRABINDU) {
      if (last) last.nasal = ch; else units.push({ c: 'n', v: '' });
    } else if (ch === VISARGA) {
      if (last) last.h = true;
    } else if (ch !== NUKTA) {
      units.push({ c: '', v: '', raw: ch });
    }
  }
  // The inherent "a" is not said at the end of a word (कमल -> kamal) or between two sounded letters (करना -> karna).
  const end = units.length - 1;
  if (units.length > 1 && units[end].c && units[end].v === null && !units[end].nasal) units[end].drop = true;
  for (let i = end - 1; i >= 1; i -= 1) {
    const u = units[i];
    if (!u.c || u.v !== null || u.nasal) continue;
    const prev = units[i - 1];
    const next = units[i + 1];
    if (next.c && hasVowel(prev) && hasVowel(next)) u.drop = true;
  }
  // A long "aa" is written "aa" in one-syllable words (baat, kaam) and "a" otherwise (khana, dava).
  const syllables = units.filter(hasVowel).length;
  return units.map((u, i) => {
    if (u.raw) return u.raw;
    let vowel = u.v === null ? (u.drop ? '' : 'a') : u.v;
    if (vowel === 'aa' && !u.independent && syllables > 1) vowel = 'a';
    let nasal = '';
    if (u.nasal) {
      const nextC = units[i + 1]?.c || '';
      nasal = u.nasal === CHANDRABINDU && i === end ? '' : /^[pbm]/.test(nextC) ? 'm' : 'n';
    }
    return `${u.c}${vowel}${nasal}${u.h ? 'h' : ''}`;
  }).join('');
}

// Devanagari words in a text written in Roman letters; anything else (English words, numbers) is left as it is.
export const toHinglish = (text = '') => String(text)
  .replace(/[ऀ-ॣ॰-ॿ]+/g, (word) => wordToHinglish(word))
  .replace(/[०-९।॥]/g, (ch) => DIGITS[ch]);

// What a mic writes for this language.
export const spokenText = (lang, text) => (lang === 'hinglish' ? toHinglish(text) : text);
