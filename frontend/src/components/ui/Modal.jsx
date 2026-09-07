import { X } from 'lucide-react';

const Modal = ({ open, onClose, title, children, className = 'max-w-md' }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-charcoal/35 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`relative w-full bg-offwhite-100 border border-cardline rounded-xl2 shadow-card p-4 sm:p-6 max-h-[92vh] overflow-y-auto ${className}`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-charcoal">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-charcoal/55 hover:text-charcoal hover:bg-sage-muted/20 rounded-md p-1 transition"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
