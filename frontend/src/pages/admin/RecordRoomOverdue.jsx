import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderArchive, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function RecordRoomOverdue() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data: result } = await api.get('/record-room/overdue', { params: { page }, skipCache: true }); setData(result); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load overdue records'); }
  }, [page]);
  useEffect(() => { load(); const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [load]);
  return <div className="space-y-4">
    <PageHeader icon={FolderArchive} title="Record Room Overdue" subtitle="Reception papers not uploaded on the day they were received. Uploads are due by the end of that day (India time); records without a received date use their creation date." actions={<Button variant="outline" onClick={load}><RefreshCw size={15} />Refresh</Button>} />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm font-semibold">{data ? `${data.total} overdue paper upload(s)` : 'Loading overdue records...'}</p>
    <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
      <table className="w-full text-left text-sm"><thead className="bg-offwhite-200 text-xs text-charcoal/65"><tr>{['Patient', 'Paper received / entry created', 'Upload deadline (IST)', 'Overdue', 'Reception', 'Action'].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead>
        <tbody>{data?.records.map((record) => <tr key={record.id} className="border-t border-cardline">
          <td className="px-4 py-3"><b>{record.patientName}</b><p className="text-xs text-charcoal/60">{record.patientId || 'No patient ID'}{record.appointmentId ? ` · ${record.appointmentId}` : ''}</p><p className="text-xs text-charcoal/60">{record.treatmentStatus === 'not_bought' ? 'Treatment not bought' : 'Treatment bought'}</p></td>
          <td className="px-4 py-3">{when(record.firstReceivedAt || record.createdAt)}{!record.firstReceivedAt && <p className="text-xs text-charcoal/60">Entry creation date used</p>}</td>
          <td className="px-4 py-3">{when(record.uploadDueAt)}</td>
          <td className="px-4 py-3"><span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-800">Upload overdue · {record.overdueDays} day(s)</span></td>
          <td className="px-4 py-3">{record.createdByName || 'Name not recorded'}<p className="text-xs text-charcoal/60">Shelf {record.shelfNumber || '—'} · File {record.fileNumber || '—'}</p></td>
          <td className="px-4 py-3"><Link className="whitespace-nowrap font-semibold text-sage hover:underline" to={`/admin/record-room?record=${record.id}&treatment=${record.treatmentStatus}`}>Open record</Link></td>
        </tr>)}{data && !data.records.length && <tr><td colSpan={6} className="p-8 text-center text-charcoal/60">No overdue paper uploads.</td></tr>}</tbody>
      </table>
    </div>
    {data?.total > 25 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm">Page {page} of {Math.ceil(data.total / 25)}</span><Button variant="outline" disabled={page * 25 >= data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
  </div>;
}
