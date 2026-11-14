export default function RecordUploadStatus({ record }) {
  if (!record?.uploadStatus) return null;
  const overdue = record.uploadStatus === 'overdue';
  const uploaded = record.uploadStatus === 'uploaded';
  return <span className={`mt-1 block text-xs font-semibold ${overdue ? 'text-red-700' : uploaded ? 'text-emerald-800' : 'text-amber-800'}`}>
    {overdue ? `Upload overdue · ${record.overdueDays} day(s)` : uploaded ? 'Papers uploaded' : 'Upload due today'}
    {!uploaded && record.uploadDueAt && <span className="block text-[11px] font-normal">Due: {new Date(record.uploadDueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST</span>}
  </span>;
}
