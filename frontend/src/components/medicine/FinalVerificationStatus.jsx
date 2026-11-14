const when = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export default function FinalVerificationStatus({ verification, showFinal = true }) {
  if (!verification) return null;
  return (
    <span className="block space-y-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11.5px] text-emerald-900">
      {showFinal && <span className="block"><b>Final verification check: {verification.result}</b><span className="block">{verification.doneByName} · {when(verification.doneAt)}</span></span>}
    </span>
  );
}
