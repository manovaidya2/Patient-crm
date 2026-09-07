import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

const getSpeechRecognition = () =>
  typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;

const withSpace = (text, extra) => {
  const left = String(text || '').trimEnd();
  const right = String(extra || '').trim();
  if (!right) return left;
  return left ? `${left} ${right}` : right;
};

const DictationButton = ({ value, onChange, disabled = false, lang = 'en-IN', className = '' }) => {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const manualStopRef = useRef(false);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
    return () => {
      manualStopRef.current = true;
      recognitionRef.current?.stop?.();
    };
  }, []);

  const stopListening = () => {
    manualStopRef.current = true;
    recognitionRef.current?.stop?.();
    setListening(false);
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || disabled) {
      setSupported(false);
      return;
    }

    recognitionRef.current?.stop?.();
    manualStopRef.current = false;
    baseTextRef.current = value || '';
    finalTextRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalTextRef.current = withSpace(finalTextRef.current, transcript);
        } else {
          interimText = withSpace(interimText, transcript);
        }
      }
      onChange(withSpace(baseTextRef.current, withSpace(finalTextRef.current, interimText)));
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled || !supported}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        listening
          ? 'border-[#B42318]/30 bg-[#B42318]/10 text-[#B42318]'
          : 'border-cardline bg-offwhite-100 text-sage hover:bg-sage-muted/20'
      } disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      aria-label={listening ? 'Stop voice typing' : 'Start voice typing'}
      title={!supported ? 'Voice typing is not supported in this browser' : listening ? 'Stop voice typing' : 'Voice typing'}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
};

export default DictationButton;
