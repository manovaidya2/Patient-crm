import { X } from 'lucide-react';

const Drawer = ({ open, onClose, title, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-charcoal/35 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm bg-offwhite-100 border-l border-cardline shadow-card h-full overflow-y-auto p-6">
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

export default Drawer;
