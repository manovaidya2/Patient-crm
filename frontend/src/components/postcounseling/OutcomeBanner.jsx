import { Link } from 'react-router-dom';

// The decision that was made for a patient: converted, or moved to Package Not Bought. `result` is what a button
// press just returned (shown straight away); `outcome` is what is saved on the record.
const OutcomeBanner = ({ outcome, result }) => {
  if (!outcome && !result) return null;
  const converted = outcome ? outcome.kind === 'converted' : result.kind === 'convert';
  const patientId = outcome?.patientId || result?.patientId;
  const pnbId = outcome?.packageNotBoughtId || result?.packageNotBoughtId;
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <b>{converted ? 'Converted to patient' : 'Moved to Package Not Bought'}</b>
      {outcome?.byName && <span> by {outcome.byName}</span>}
      {result?.poNumber && <span className="ml-2 rounded bg-emerald-200 px-2 py-0.5 text-xs font-semibold">{result.poNumber} sent to In Transit</span>}
      {patientId && <> · <Link className="font-semibold underline" to={`/admin/patients/${patientId}`}>Open patient</Link></>}
      {pnbId && <> · <Link className="font-semibold underline" to={`/admin/package-not-bought/${pnbId}`}>Open Package Not Bought</Link></>}
    </div>
  );
};

export default OutcomeBanner;
