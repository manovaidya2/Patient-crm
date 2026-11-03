import { useId } from 'react';
import { Camera, Paperclip } from 'lucide-react';
import { SelectedAttachments, appendSelectedFiles, removeSelectedFile } from './Attachments.jsx';

// Payment proof / photos: pick files, or take a picture with the phone camera right here. Both add to the same list.
// `setFiles` is a state setter (functional updates).
export default function ProofPicker({ label, required = false, files, setFiles, accept = 'image/*,application/pdf', className = '' }) {
  const id = useId();
  const button = 'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-semibold text-sage hover:border-sage';
  return (
    <div className={className}>
      {label && <p className="mb-1 text-sm font-medium text-charcoal">{label}{required && <span className="text-red-700"> *</span>}</p>}
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-files`} className={button}><Paperclip size={14} />Choose files</label>
        <input id={`${id}-files`} type="file" multiple accept={accept} className="hidden" onChange={(e) => { appendSelectedFiles(setFiles, e.target.files); e.target.value = ''; }} />
        <label htmlFor={`${id}-camera`} className={button}><Camera size={14} />Take photo</label>
        <input id={`${id}-camera`} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { appendSelectedFiles(setFiles, e.target.files); e.target.value = ''; }} />
      </div>
      <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
    </div>
  );
}
