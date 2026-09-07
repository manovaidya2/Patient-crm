import { CheckCircle2, XCircle, X } from 'lucide-react';

const styles = {
  success: { icon: CheckCircle2, classes: 'bg-sage text-offwhite-100' },
  error: { icon: XCircle, classes: 'bg-[#8C3B2E] text-offwhite-100' },
};

const Toast = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 w-[calc(100%-2.5rem)] max-w-sm">
      {toasts.map((t) => {
        const { icon: Icon, classes } = styles[t.type] || styles.success;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm font-medium shadow-card ${classes}`}
          >
            <Icon size={17} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default Toast;
