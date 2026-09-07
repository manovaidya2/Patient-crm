import { AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';

const styles = {
  success: { icon: CheckCircle2, classes: 'bg-sage text-offwhite-100' },
  error: { icon: XCircle, classes: 'bg-[#8C3B2E] text-offwhite-100' },
  confirm: { icon: AlertTriangle, classes: 'bg-offwhite-100 border border-cardline text-charcoal' },
};

const Toast = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 w-[calc(100%-2.5rem)] max-w-sm">
      {toasts.map((t) => {
        const { icon: Icon, classes } = styles[t.type] || styles.success;
        const handleAction = async () => {
          await t.onAction?.();
          onDismiss(t.id);
        };
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm font-medium shadow-card ${classes}`}
          >
            <Icon size={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{t.message}</p>
              {(t.actionLabel || t.cancelLabel) && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {t.cancelLabel && (
                    <button
                      type="button"
                      onClick={() => onDismiss(t.id)}
                      className="rounded-md px-3 py-1.5 text-xs font-bold text-charcoal/60 hover:bg-sage-muted/20 hover:text-charcoal"
                    >
                      {t.cancelLabel}
                    </button>
                  )}
                  {t.actionLabel && (
                    <button
                      type="button"
                      onClick={handleAction}
                      className="rounded-md bg-[#8C3B2E] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#763023]"
                    >
                      {t.actionLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
            {!t.persist && (
              <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Toast;
