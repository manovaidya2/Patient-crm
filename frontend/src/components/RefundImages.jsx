import { useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { SelectedAttachments } from './ui/Attachments.jsx';

export default function RefundImages({ files, onChange, disabled = false }) {
  const [error, setError] = useState('');
  const select = (event) => {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length + incoming.length > 10) return setError('Select up to 10 images.');
    if (incoming.some((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      return setError('Select images up to 5 MB each.');
    }
    setError('');
    onChange([...files, ...incoming]);
  };
  return <div>
    <p className="mb-2 text-sm text-charcoal">Refund images (optional)</p>
    <div className="flex flex-wrap gap-2">
      <label className="relative inline-flex items-center gap-2 rounded-md border border-cardline px-3 py-2 text-xs font-semibold text-sage focus-within:ring-2 focus-within:ring-sage">
        <Upload size={15} />Upload images
        <input type="file" accept="image/*" multiple disabled={disabled} onChange={select} aria-label="Upload refund images" className="absolute inset-0 w-full cursor-pointer opacity-0" />
      </label>
      <label className="relative inline-flex items-center gap-2 rounded-md border border-cardline px-3 py-2 text-xs font-semibold text-sage focus-within:ring-2 focus-within:ring-sage">
        <Camera size={15} />Camera
        <input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={select} aria-label="Take refund photo" className="absolute inset-0 w-full cursor-pointer opacity-0" />
      </label>
    </div>
    <SelectedAttachments files={files} onRemove={(index) => !disabled && onChange(files.filter((_, i) => i !== index))} />
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}
