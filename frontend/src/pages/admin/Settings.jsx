import { useEffect, useState } from 'react';
import { FileText, Save, Settings as SettingsIcon } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

// Admin settings. "Who will make treatment paper": the one PCC who gets every treatment-paper request (fulfilment
// step 9). Until one is chosen, no PCC gets them.
function TreatmentPaperMaker() {
  const [data, setData] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/treatment-papers/setting', { skipCache: true }).then(({ data: d }) => { setData(d); setPick(d.pcc?.id || ''); }).catch(() => setMsg('Could not load the setting')); }, []);
  const save = async () => {
    setBusy(true); setMsg('');
    try { const { data: d } = await api.put('/treatment-papers/setting', { pccId: pick }); setData((o) => ({ ...o, pcc: d.pcc })); setMsg(d.pcc ? `Saved: treatment-paper requests now go to ${d.pcc.name} only.` : 'Saved: no PCC chosen.'); }
    catch (err) { setMsg(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-[14px] border border-[#E8DFCB] bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-charcoal"><FileText size={17} className="text-sage" />Who will make treatment paper</h2>
      <p className="mt-1 text-sm text-charcoal/65">Every treatment-paper request (fulfilment step 9, after the quality check) goes only to the PCC chosen here, on their Make Treatment Paper page. No other PCC gets it.</p>
      {!data ? <p className="mt-3 text-sm text-charcoal/55">{msg || 'Loading...'}</p> : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 space-y-1 text-sm font-medium text-charcoal">
            <span>PCC (Patient Care Coordinator)</span>
            <select className="w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select the PCC</option>
              {data.pccs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Button onClick={save} disabled={busy || pick === (data.pcc?.id || '')}><Save size={15} />{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      )}
      {data && <p className={`mt-2 text-sm ${data.pcc ? 'text-charcoal/70' : 'font-semibold text-[#C2410C]'}`}>{data.pcc ? <>Now: <b>{data.pcc.name}</b> makes the treatment papers.</> : 'No PCC chosen: the requests wait and no PCC gets them until one is chosen.'}</p>}
      {msg && data && <p className="mt-1 text-sm font-semibold text-sage">{msg}</p>}
    </section>
  );
}

export default function Settings() {
  return (
    <div className="space-y-4">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Who does what in the CRM." />
      <TreatmentPaperMaker />
    </div>
  );
}
