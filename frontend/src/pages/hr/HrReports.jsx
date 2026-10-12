import { useEffect, useState } from 'react';
import { BarChart3, Calculator, CalendarRange, Download, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { todayInput } from './hrOptions.js';

const modules = [['kpis','Team KPIs'],['performance','Performance'],['appraisals','Appraisals'],['pip','PIP'],['grievances','Grievances'],['payroll','Payroll'],['exits','Exit Management']];
const periods = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
const countLabels = { applications: 'Applications', qualified: 'Qualified', interviewsScheduled: 'Interviews scheduled', interviewsAttended: 'Attended', selected: 'Selected', offersIssued: 'Offers issued', offersAccepted: 'Offers accepted', joined: 'Joined' };

const displayResult = (metric) => {
  if (metric.value === null) return 'Not available';
  if (metric.unit === 'percent') return `${metric.value}%`;
  if (metric.unit === 'currency') return `Rs ${Number(metric.value).toLocaleString('en-IN')}`;
  return `${metric.value} days`;
};

export default function HrReports() {
  const [summary, setSummary] = useState({});
  const [report, setReport] = useState(null);
  const [module, setModule] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [anchor, setAnchor] = useState(todayInput());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [summaryResponse, metricsResponse] = await Promise.all([
        api.get('/hr/lifecycle/summary'),
        api.get('/hr/lifecycle/reports/metrics', { params: { period, date: anchor } }),
      ]);
      setSummary(summaryResponse.data.summary || {});
      setReport(metricsResponse.data.report || null);
      setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'HR reports could not be loaded'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period, anchor]);

  const download = async (calculated = false) => {
    try {
      const response = await api.get(calculated ? '/hr/lifecycle/reports/metrics/export' : '/hr/lifecycle/reports/export', { params: calculated ? { period, date: anchor } : { module }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = calculated ? `HR-Calculated-${period}.csv` : 'HR-Lifecycle-Records.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Report could not be exported'); }
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">HR Analytics</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><BarChart3 size={23} /> HR Reports</h1><p className="mt-1 text-sm text-charcoal/60">Daily, weekly and monthly recruitment and people metrics calculated from CRM records.</p></div><Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</Button></header>

    <section className="border border-cardline bg-offwhite-100">
      <div className="flex flex-col gap-4 border-b border-cardline p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-semibold uppercase text-charcoal/50">Report period</p><div className="inline-flex overflow-hidden rounded-md border border-cardline bg-white">{periods.map(([value,label]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`px-4 py-2 text-sm font-semibold ${period === value ? 'bg-sage text-white' : 'text-charcoal/60 hover:bg-offwhite-200'}`}>{label}</button>)}</div></div><label className="block text-xs font-semibold uppercase text-charcoal/50">Anchor date<input type="date" className="mt-1 block rounded-md border border-cardline bg-white px-3 py-2 text-sm font-normal text-charcoal" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></label></div>
        <Button onClick={() => download(true)}><Download size={16} /> Export calculated report</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm"><span className="inline-flex items-center gap-2 font-semibold text-sage"><CalendarRange size={16} /> {report ? `${report.range.from} to ${report.range.to}` : 'Calculating range'}</span><span className="text-charcoal/55">India calendar time; weekly reports run Monday to Sunday.</span></div>
    </section>

    {error && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {loading && <div className="border border-cardline bg-offwhite-100 p-10 text-center text-sm text-charcoal/50">Calculating HR report...</div>}

    {!loading && report && <>
      <section className="grid border border-cardline bg-offwhite-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{Object.entries(countLabels).map(([key,label]) => <div key={key} className="border-b border-r border-cardline px-4 py-3"><p className="text-xs font-semibold uppercase text-charcoal/50">{label}</p><p className="mt-1 text-2xl font-bold">{report.counts[key] || 0}</p></div>)}</section>
      <section><div className="mb-3 flex items-center gap-2"><Calculator size={18} className="text-sage" /><div><h2 className="font-semibold">Calculated performance</h2><p className="text-xs text-charcoal/50">Results update automatically from the selected report period.</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.metrics.map((metric) => <article key={metric.key} className="border border-cardline bg-offwhite-100 p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-charcoal/65">{metric.label}</h3><span className={`text-xs font-semibold ${metric.value === null ? 'text-charcoal/40' : 'text-sage'}`}>{metric.value === null ? 'No denominator' : 'Calculated'}</span></div><p className="mt-2 text-3xl font-bold text-charcoal">{displayResult(metric)}</p><p className="mt-3 border-t border-cardline pt-3 text-xs font-semibold text-charcoal/60">{metric.formula}</p><p className="mt-1 text-xs text-charcoal/45">Numerator {metric.numerator} | Denominator {metric.denominator}</p></article>)}</div></section>
      <section className="overflow-hidden border border-cardline bg-offwhite-100"><div className="border-b border-cardline px-4 py-3"><h2 className="font-semibold">Calculation rules and exceptions</h2><p className="text-xs text-charcoal/50">These rules prevent cancelled or incomplete records from distorting reports.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr><th className="px-4 py-3">Report</th><th className="px-4 py-3">Formula</th><th className="px-4 py-3">Applied rule</th></tr></thead><tbody className="divide-y divide-cardline-soft">{report.metrics.map((metric) => <tr key={metric.key}><td className="px-4 py-3 font-semibold">{metric.label}</td><td className="px-4 py-3 whitespace-nowrap">{metric.formula}</td><td className="px-4 py-3 text-charcoal/65">{metric.rule}</td></tr>)}</tbody></table></div></section>
    </>}

    <section className="border border-cardline bg-offwhite-100"><div className="flex flex-col gap-3 border-b border-cardline px-4 py-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">Lifecycle records</h2><p className="text-xs text-charcoal/50">Current totals across KPI, performance, approvals, payroll and exits.</p></div><div className="flex gap-2"><select className="rounded-md border border-cardline bg-white px-3 py-2 text-sm" value={module} onChange={(event) => setModule(event.target.value)}><option value="">All lifecycle modules</option>{modules.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="outline" onClick={() => download(false)}><Download size={16} /> Export records</Button></div></div><div className="grid sm:grid-cols-2 xl:grid-cols-4">{modules.map(([key,label]) => <div key={key} className="border-b border-r border-cardline p-4"><p className="text-sm font-semibold text-charcoal/60">{label}</p><p className="mt-2 text-3xl font-bold">{summary[key]?.total ?? 0}</p><div className="mt-3 flex flex-wrap gap-1">{Object.entries(summary[key] || {}).filter(([status]) => status !== 'total').map(([status,count]) => <span key={status} className="bg-offwhite-300 px-2 py-1 text-xs capitalize">{status.replaceAll('_',' ')}: {count}</span>)}</div></div>)}</div></section>
  </div>;
}
