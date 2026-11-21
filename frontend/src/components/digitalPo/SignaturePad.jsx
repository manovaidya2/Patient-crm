import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const INK = '#16233A';

// A box to sign in with a finger (or a mouse / stylus). ref: clear(), isEmpty(), toBlob() -> PNG on white.
// Turning the phone (the box changes width) clears it, so the lines never come out stretched.
const SignaturePad = forwardRef(function SignaturePad({ onChange, disabled = false }, ref) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const width = useRef(0);
  const [empty, setEmpty] = useState(true);
  // Kept in a ref: a new onChange from the page must not clear the box.
  const tell = useRef(onChange);
  tell.current = onChange;

  const setup = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    width.current = c.clientWidth;
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = c.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    setEmpty(true);
    tell.current?.(false);
  }, []);

  useEffect(() => {
    setup();
    const onResize = () => { if (canvas.current && canvas.current.clientWidth !== width.current) setup(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setup]);

  const point = (event) => { const r = canvas.current.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
  const inked = () => { if (empty) { setEmpty(false); tell.current?.(true); } };
  const down = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvas.current.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    const ctx = canvas.current.getContext('2d');
    ctx.beginPath();
    ctx.fillStyle = INK;
    ctx.arc(last.current.x, last.current.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    inked();
  };
  const move = (event) => {
    if (!drawing.current || disabled) return;
    event.preventDefault();
    const p = point(event);
    const ctx = canvas.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    inked();
  };
  const up = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    clear: setup,
    isEmpty: () => empty,
    toBlob: () => new Promise((resolve) => canvas.current.toBlob(resolve, 'image/png')),
  }), [empty, setup]);

  return (
    <div>
      <canvas
        ref={canvas}
        aria-label="Signature box: sign here with your finger"
        className={`block h-48 w-full touch-none rounded-xl border-2 border-dashed bg-white ${empty ? 'border-[#9DB3A6]' : 'border-[#1F5F4A]'} ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-charcoal/55">{empty ? 'ऊपर box में उँगली से sign करें · Sign above with your finger' : 'Signed ✓'}</span>
        <button type="button" onClick={setup} disabled={disabled || empty} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-[#8A1C25] hover:bg-[#FDF0F0] disabled:opacity-40"><Eraser size={14} />Clear</button>
      </div>
    </div>
  );
});

export default SignaturePad;
