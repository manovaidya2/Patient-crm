import { useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';

const modules = [['kpis','Team KPIs'],['performance','Performance'],['appraisals','Appraisals'],['pip','PIP'],['grievances','Grievances'],['payroll','Payroll'],['exits','Exit Management']];

export default function HrReports() {
  const [summary, setSummary] = useState({});
  const [module, setModule] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.get('/hr/lifecycle/summary').then(({ data }) => setSummary(data.summary || {})).catch((requestError) => setError(requestError.response?.data?.message || 'HR reports could not be loaded')); }, []);
  const download = async () => { const response = await api.get('/hr/lifecycle/reports/export', { params: { module }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = 'HR-Lifecycle-Report.csv'; link.click(); URL.revokeObjectURL(url); };
  return <div className="space-y-5"><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">HR Analytics</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><BarChart3 size={23} /> HR Reports</h1><p className="mt-1 text-sm text-charcoal/60">Consolidated lifecycle workload and exportable records.</p></div><div className="flex gap-2"><select className="rounded-md border border-cardline bg-white px-3 py-2 text-sm" value={module} onChange={(event) => setModule(event.target.value)}><option value="">All lifecycle modules</option>{modules.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><Button onClick={download}><Download size={16} /> Export CSV</Button></div></header>{error && <div className="bg-red-50 p-3 text-sm text-red-800">{error}</div>}<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{modules.map(([key,label]) => <article key={key} className="border-l-4 border-sage bg-offwhite-100 p-4"><p className="text-sm font-semibold text-charcoal/60">{label}</p><p className="mt-2 text-3xl font-bold">{summary[key]?.total ?? 0}</p><div className="mt-3 flex flex-wrap gap-1">{Object.entries(summary[key] || {}).filter(([status]) => status !== 'total').map(([status,count]) => <span key={status} className="bg-offwhite-300 px-2 py-1 text-xs capitalize">{status.replaceAll('_',' ')}: {count}</span>)}</div></article>)}</section></div>;
}
