import { AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';

const styles = {
  success: { icon: CheckCircle2, classes: 'bg-sage text-offwhite-100' },
  error: { icon: XCircle, classes: 'bg-[#8C3B2E] text-offwhite-100' },
  confirm: { icon: AlertTriangle, classes: 'bg-offwhite-100 border border-cardline text-charcoal' },
};

const Toast = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed right-4 top-24 z-[100] flex w-[calc(100%-2rem)] max-w-md flex-col gap-3 sm:right-6 md:top-20">
      {toasts.map((t) => {
        const { icon: Icon, classes } = styles[t.type] || styles.success;
        const handleAction = async () => {
          await t.onAction?.();
          onDismiss(t.id);
        };
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-3xl px-5 py-4 text-sm font-medium shadow-card ring-1 ring-black/5 ${classes}`}
          >
            <Icon size={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {t.title && <p className="font-bold leading-5">{t.title}</p>}
              <p className={`${t.title ? 'mt-1 text-charcoal/75' : ''} leading-5`}>{t.message}</p>
              {(t.actionLabel || t.cancelLabel) && (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {t.cancelLabel && (
                    <button
                      type="button"
                      onClick={() => onDismiss(t.id)}
                      className="rounded-xl px-3 py-2 text-xs font-bold text-charcoal/55 hover:bg-sage-muted/20 hover:text-charcoal"
                    >
                      {t.cancelLabel}
                    </button>
                  )}
                  {t.actionLabel && (
                    <button
                      type="button"
                      onClick={handleAction}
                      className="rounded-xl bg-[#8C3B2E] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#763023]"
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
