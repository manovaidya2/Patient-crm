import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Columns3, Inbox, Plus, RefreshCw, Table2 } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';

const pad2 = (value) => String(value).padStart(2, '0');

const todayInputValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const Worksheet = () => {
  const [tabs, setTabs] = useState([]);
  const [rows, setRows] = useState([]);
  const [customColumns, setCustomColumns] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [dateMode, setDateMode] = useState('day');
  const [dateValue, setDateValue] = useState(todayInputValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [savingColumn, setSavingColumn] = useState(false);
  const [modalError, setModalError] = useState('');
  const [columnName, setColumnName] = useState('');
  const [manualRow, setManualRow] = useState({
    userId: '',
    workDate: todayInputValue(),
    patientName: '',
    patientCode: '',
    currentStage: '',
    workType: '',
    details: '',
    customValues: {},
  });

  useEffect(() => {
    const fetchWorksheet = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/worksheet', {
          params: dateMode === 'all' ? { dateMode } : { dateMode, date: dateValue },
        });
        const nextTabs = data.tabs || [];
        setTabs(nextTabs);
        setRows(data.rows || []);
        setCustomColumns(data.customColumns || []);
        setActiveTab((current) => {
          if (current === 'all') return current;
          return nextTabs.some((tab) => tab.id === current) ? current : nextTabs[0]?.id || 'all';
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load worksheet.');
      } finally {
        setLoading(false);
      }
    };
    fetchWorksheet();
  }, [dateMode, dateValue, reloadKey]);

  const filteredRows = useMemo(() => {
    if (activeTab === 'all') return rows;
    return rows.filter((row) => String(row.userId) === String(activeTab));
  }, [activeTab, rows]);

  const totalCount = rows.length;
  const selectedTab = activeTab === 'all' ? null : tabs.find((tab) => tab.id === activeTab);
  const canChooseUser = tabs.length > 1;

  const openRowModal = () => {
    const defaultUserId = selectedTab?.id || tabs[0]?.id || '';
    setManualRow({
      userId: defaultUserId,
      workDate: dateMode === 'day' ? dateValue : todayInputValue(),
      patientName: '',
      patientCode: '',
      currentStage: '',
      workType: '',
      details: '',
      customValues: {},
    });
    setModalError('');
    setRowModalOpen(true);
  };

  const openColumnModal = () => {
    setColumnName('');
    setModalError('');
    setColumnModalOpen(true);
  };

  const updateCustomValue = (key, value) => {
    setManualRow((row) => ({
      ...row,
      customValues: {
        ...row.customValues,
        [key]: value,
      },
    }));
  };

  const submitManualRow = async (e) => {
    e.preventDefault();
    if (!manualRow.userId) {
      setModalError('Select a user');
      return;
    }
    if (!manualRow.workType.trim()) {
      setModalError('Work is required');
      return;
    }
    setSavingRow(true);
    setModalError('');
    try {
      await api.post('/worksheet/rows', manualRow);
      setRowModalOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not add work row.');
    } finally {
      setSavingRow(false);
    }
  };

  const submitColumn = async (e) => {
    e.preventDefault();
    if (!columnName.trim()) {
      setModalError('Column name is required');
      return;
    }
    setSavingColumn(true);
    setModalError('');
    try {
      await api.post('/worksheet/columns', { label: columnName.trim() });
      setColumnModalOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not add column.');
    } finally {
      setSavingColumn(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Team Worksheet</p>
          <h1 className="font-display text-2xl font-bold text-charcoal">Worksheet</h1>
          <p className="mt-1 text-sm text-charcoal/55">Daily CRM work auto-filled like a spreadsheet.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-cardline bg-offwhite-200 p-1">
            <button
              type="button"
              onClick={() => setDateMode('day')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dateMode === 'day' ? 'bg-sage text-offwhite-100' : 'text-charcoal/60 hover:text-charcoal'}`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setDateMode('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dateMode === 'all' ? 'bg-sage text-offwhite-100' : 'text-charcoal/60 hover:text-charcoal'}`}
            >
              All
            </button>
          </div>
          {dateMode === 'day' && (
            <label className="inline-flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal">
              <CalendarDays size={15} className="text-sage" />
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </label>
          )}
          <Button type="button" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button type="button" variant="outline" onClick={openColumnModal}>
            <Columns3 size={14} /> Add Column
          </Button>
          <Button type="button" onClick={openRowModal}>
            <Plus size={14} /> Add Work
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mt-5 flex items-center gap-2 text-sm text-[#8C3B2E]">
          <AlertTriangle size={18} /> {error}
        </Card>
      )}

      <Card className="mt-5" padded={false}>
        <div className="border-b border-cardline px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                activeTab === 'all'
                  ? 'border-sage bg-sage text-offwhite-100'
                  : 'border-cardline bg-offwhite-200 text-charcoal/70 hover:text-charcoal'
              }`}
            >
              All <span className="ml-1 text-xs opacity-80">{totalCount}</span>
            </button>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'border-sage bg-sage text-offwhite-100'
                    : 'border-cardline bg-offwhite-200 text-charcoal/70 hover:text-charcoal'
                }`}
              >
                <span>{tab.name}</span>
                <span className="ml-2 text-xs opacity-80">{tab.count}</span>
                <span className="ml-2 text-[10px] uppercase opacity-70">{tab.roleLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-offwhite-300 text-[11px] uppercase tracking-wide text-charcoal/55">
              <tr>
                <th className="w-14 border-b border-r border-cardline px-3 py-2">#</th>
                <th className="border-b border-r border-cardline px-3 py-2">Date</th>
                <th className="border-b border-r border-cardline px-3 py-2">Time</th>
                <th className="border-b border-r border-cardline px-3 py-2">User</th>
                <th className="border-b border-r border-cardline px-3 py-2">Role</th>
                <th className="border-b border-r border-cardline px-3 py-2">Patient ID</th>
                <th className="border-b border-r border-cardline px-3 py-2">Patient</th>
                <th className="border-b border-r border-cardline px-3 py-2">Stage</th>
                <th className="border-b border-r border-cardline px-3 py-2">Work</th>
                <th className="border-b border-r border-cardline px-3 py-2">Details</th>
                {customColumns.map((column) => (
                  <th key={column.key} className="border-b border-r border-cardline px-3 py-2">{column.label}</th>
                ))}
                <th className="border-b border-cardline px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11 + customColumns.length} className="px-4 py-12 text-center text-sm text-charcoal/55">
                    Loading worksheet...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11 + customColumns.length} className="px-4 py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Inbox size={22} className="text-charcoal/35" />
                      <p className="text-sm font-semibold text-charcoal">No work found</p>
                      <p className="text-xs text-charcoal/55">Change the date or tab to view more rows.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} className="odd:bg-offwhite-100 even:bg-offwhite-200/70 hover:bg-sage-muted/15">
                    <td className="border-b border-r border-cardline px-3 py-2 font-mono text-xs text-charcoal/45">{index + 1}</td>
                    <td className="border-b border-r border-cardline px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="border-b border-r border-cardline px-3 py-2 whitespace-nowrap">{formatTime(row.createdAt)}</td>
                    <td className="border-b border-r border-cardline px-3 py-2 font-semibold text-charcoal">{row.userName}</td>
                    <td className="border-b border-r border-cardline px-3 py-2">
                      <Badge tone="default">{row.userRoleLabel}</Badge>
                    </td>
                    <td className="border-b border-r border-cardline px-3 py-2 font-mono text-xs text-charcoal/60">{row.patientCode || '-'}</td>
                    <td className="border-b border-r border-cardline px-3 py-2">
                      <Link to={`/admin/patients/${row.patientId}`} className="font-semibold text-sage hover:text-charcoal">
                        {row.patientName}
                      </Link>
                    </td>
                    <td className="border-b border-r border-cardline px-3 py-2 whitespace-nowrap">{row.currentStage ? `Stage ${row.currentStage}` : '-'}</td>
                    <td className="border-b border-r border-cardline px-3 py-2 font-medium text-charcoal">{row.workType}</td>
                    <td className="border-b border-r border-cardline px-3 py-2 text-charcoal/65">
                      <span className="line-clamp-2 whitespace-pre-line">{row.details || '-'}</span>
                    </td>
                    {customColumns.map((column) => (
                      <td key={column.key} className="border-b border-r border-cardline px-3 py-2 text-charcoal/65">
                        {row.customValues?.[column.key] || '-'}
                      </td>
                    ))}
                    <td className="border-b border-cardline px-3 py-2">
                      <Badge tone={row.source === 'manual' ? 'amber' : 'teal'}>{row.source === 'manual' ? 'Manual' : 'Auto'}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={rowModalOpen} onClose={() => setRowModalOpen(false)} title="Add Work Row" className="max-w-3xl">
        <form onSubmit={submitManualRow} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {canChooseUser && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal">User</label>
                <select
                  value={manualRow.userId}
                  onChange={(e) => setManualRow({ ...manualRow, userId: e.target.value })}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>{tab.name} - {tab.roleLabel}</option>
                  ))}
                </select>
              </div>
            )}
            <Input
              type="date"
              label="Date"
              value={manualRow.workDate}
              onChange={(e) => setManualRow({ ...manualRow, workDate: e.target.value })}
            />
            <Input
              label="Patient ID"
              placeholder="Optional"
              value={manualRow.patientCode}
              onChange={(e) => setManualRow({ ...manualRow, patientCode: e.target.value })}
            />
            <Input
              label="Patient"
              placeholder="Optional"
              value={manualRow.patientName}
              onChange={(e) => setManualRow({ ...manualRow, patientName: e.target.value })}
            />
            <Input
              label="Stage"
              placeholder="Example: 1"
              value={manualRow.currentStage}
              onChange={(e) => setManualRow({ ...manualRow, currentStage: e.target.value })}
            />
            <Input
              label="Work"
              placeholder="Example: Offline call, report review"
              value={manualRow.workType}
              onChange={(e) => setManualRow({ ...manualRow, workType: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Details</label>
            <textarea
              rows={4}
              value={manualRow.details}
              onChange={(e) => setManualRow({ ...manualRow, details: e.target.value })}
              placeholder="Write details..."
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          {customColumns.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {customColumns.map((column) => (
                <Input
                  key={column.key}
                  label={column.label}
                  value={manualRow.customValues[column.key] || ''}
                  onChange={(e) => updateCustomValue(column.key, e.target.value)}
                />
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRowModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingRow}>{savingRow ? 'Saving...' : 'Add Row'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={columnModalOpen} onClose={() => setColumnModalOpen(false)} title="Add Worksheet Column">
        <form onSubmit={submitColumn} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <Input
            label="Column Name"
            placeholder="Example: Remark, Follow-up outcome"
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setColumnModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingColumn}>{savingColumn ? 'Saving...' : 'Add Column'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Worksheet;
