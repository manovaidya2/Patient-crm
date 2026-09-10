import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

// Native browser speech-to-text (Chrome / Edge). One engine only — whatever the
// recognizer finalizes is appended and never rewritten, so text does not flicker
// or get deleted. Language is pinned so it can't drift into another script.
const getSpeechRecognition = () =>
  typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;

const joinWithSpace = (left, right) => {
  const a = String(left || '').trimEnd();
  const b = String(right || '').trimStart();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
};

// Small clinic-vocabulary fixes for common mis-hearings.
const crmPhraseCorrections = [
  [/\b(siyaram|siya ram|see ram|sea ram|c ram|see rm|serum|scrum)\b/gi, 'CRM'],
  [/\bfollow ups\b/gi, 'follow-ups'],
  [/\bfollowup\b/gi, 'follow-up'],
  [/\bassis?tent\b/gi, 'assistant'],
  [/\bphyscologist\b/gi, 'psychologist'],
  [/\bpayemnt\b/gi, 'payment'],
  [/\bmedic?ne\b/gi, 'medicine'],
  [/\bcoure?ir\b/gi, 'courier'],
];

const applyCorrections = (text = '') => {
  let next = String(text || '').replace(/\s+/g, ' ');
  crmPhraseCorrections.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, replacement);
  });
  return next;
};

const DictationButton = ({ value, onChange, disabled = false, className = '', lang = 'en-IN' }) => {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);
  const restartTimerRef = useRef(null);
  // Text that was already in the field when dictation started.
  const baseTextRef = useRef('');
  // Finalized speech from earlier recognition sessions (Chrome ends a session
  // every so often; we restart it and keep appending).
  const priorFinalRef = useRef('');
  // Finalized speech from the currently running session.
  const sessionFinalRef = useRef('');
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  const stopRef = useRef(() => {});

  useEffect(() => {
    if (disabled && listening) stopRef.current();
  }, [disabled, listening]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
    return () => {
      manualStopRef.current = true;
      window.clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const pushText = (spoken) => {
    onChangeRef.current(joinWithSpace(baseTextRef.current, applyCorrections(spoken)));
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || disabled || listening) return;

    baseTextRef.current = String(valueRef.current || '').trimEnd();
    priorFinalRef.current = '';
    sessionFinalRef.current = '';
    manualStopRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let sessionFinal = '';
      let interim = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          sessionFinal = joinWithSpace(sessionFinal, transcript.trim());
        } else {
          interim = joinWithSpace(interim, transcript);
        }
      }
      sessionFinalRef.current = sessionFinal;
      const spoken = joinWithSpace(joinWithSpace(priorFinalRef.current, sessionFinal), interim);
      pushText(spoken);
    };

    recognition.onerror = (event) => {
      // Permission problems are fatal; everything else (no-speech, network,
      // aborted) is handled by onend restarting the session.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        manualStopRef.current = true;
        window.clearTimeout(restartTimerRef.current);
        setListening(false);
      }
    };

    recognition.onend = () => {
      priorFinalRef.current = joinWithSpace(priorFinalRef.current, sessionFinalRef.current);
      sessionFinalRef.current = '';
      pushText(priorFinalRef.current);

      if (manualStopRef.current) {
        setListening(false);
        return;
      }
      // Keep it going until the user presses stop.
      restartTimerRef.current = window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      }, 150);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    manualStopRef.current = true;
    window.clearTimeout(restartTimerRef.current);
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    setListening(false);
  };

  stopRef.current = stopListening;

  const toggleRecording = () => {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  };

  return (
    <button
      type="button"
      onClick={toggleRecording}
      disabled={disabled || !supported}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        listening
          ? 'border-[#B42318]/30 bg-[#B42318]/10 text-[#B42318]'
          : 'border-cardline bg-offwhite-100 text-sage hover:bg-sage-muted/20'
      } disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      aria-label={listening ? 'Stop voice typing' : 'Start voice typing'}
      title={
        !supported
          ? 'Voice typing is not supported in this browser (use Chrome or Edge)'
          : listening
            ? 'Stop voice typing'
            : 'Voice typing'
      }
    >
      {listening ? <Square size={14} /> : <Mic size={16} />}
    </button>
  );
};

export default DictationButton;
