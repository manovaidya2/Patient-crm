import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

// Record a voice message in the browser (microphone): Record -> Stop -> listen to it before sending, record again or
// remove it. `onChange({ file, seconds } | null)` hands the recording to the form (a File ready for FormData).
// `existingUrl`: a recording already saved (played here until it is replaced or removed with `onRemoveExisting`).
// `autoStart`: start recording as soon as it shows (opened from a "Record" button).
const pickType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
};
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MAX_SECONDS = 10 * 60;

export default function VoiceRecorder({ value, onChange, existingUrl = '', onRemoveExisting, disabled = false, autoStart = false }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const supported = typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    if (!value?.file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(value.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  useEffect(() => () => { window.clearInterval(timerRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const stop = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };
  const autoStarted = useRef(false);
  useEffect(() => { if (autoStart && supported && !autoStarted.current) { autoStarted.current = true; start(); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setError('');
    try {
      // Speech only: one channel, with echo / noise cleaning, so the file stays small (the server compresses it again).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const type = pickType();
      const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24000 });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        window.clearInterval(timerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const plain = (recorder.mimeType || type || 'audio/webm').split(';')[0];
        const ext = plain.includes('mp4') ? 'm4a' : plain.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: plain });
        const took = (Date.now() - startedRef.current) / 1000;
        if (blob.size) onChange({ file: new File([blob], `voice-advice.${ext}`, { type: plain }), seconds: took });
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setSeconds(0);
      recorder.start(1000);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = (Date.now() - startedRef.current) / 1000;
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Allow the microphone in the browser to record.' : 'The microphone could not be started.');
    }
  };

  if (!supported) return <p className="text-xs text-charcoal/55">Voice recording needs Chrome, Edge or Safari with a microphone.</p>;
  return (
    <div className="rounded-lg border border-cardline bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-[#B42318] px-3 py-2 text-sm font-semibold text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /><Square size={13} />Stop · {clock(seconds)}
          </button>
        ) : (
          <button type="button" disabled={disabled} onClick={start} className="inline-flex items-center gap-2 rounded-lg border border-sage/50 bg-sage/10 px-3 py-2 text-sm font-semibold text-sage hover:bg-sage/20 disabled:opacity-50">
            <Mic size={15} />{value || existingUrl ? 'Record again' : 'Record voice'}
          </button>
        )}
        {!recording && value && <span className="text-xs text-charcoal/60">New recording · {clock(value.seconds || 0)}</span>}
        {!recording && (value || existingUrl) && (
          <button type="button" disabled={disabled} onClick={() => (value ? onChange(null) : onRemoveExisting?.())} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#9F1D1D] hover:bg-[#FDE2E1]">
            <Trash2 size={13} />Remove
          </button>
        )}
      </div>
      {!recording && (previewUrl || existingUrl) && <audio controls preload="metadata" src={previewUrl || existingUrl} className="mt-2 h-10 w-full" />}
      {recording && <p className="mt-1.5 text-xs text-charcoal/55">Recording... speak now, then press Stop to listen before sending.</p>}
      {error && <p className="mt-1.5 text-xs text-[#9F1D1D]">{error}</p>}
    </div>
  );
}
