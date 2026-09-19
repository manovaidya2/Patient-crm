import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Columns3, FileSpreadsheet, Inbox, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
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

const formatCellValue = (column, value) => {
  if (!value) return '-';
  if (column.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return value;
};

const selectClass =
  'w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';

const Worksheet = () => {
  const [tabs, setTabs] = useState([]);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateMode, setDateMode] = useState('all');
  const [dateValue, setDateValue] = useState(todayInputValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState('');
  const [rowValues, setRowValues] = useState({});
  const [savingRow, setSavingRow] = useState(false);

  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('text');
  const [columnBusy, setColumnBusy] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const fileInputRef = useRef(null);

  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const fetchWorksheet = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { dateMode, ...(selectedUserId ? { userId: selectedUserId } : {}) };
        if (dateMode === 'day') params.date = dateValue;
        const { data } = await api.get('/worksheet', { params });
        setTabs(data.tabs || []);
        setColumns(data.columns || []);
        setRows(data.rows || []);
        if (data.selectedUserId && data.selectedUserId !== selectedUserId) setSelectedUserId(data.selectedUserId);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load worksheet.');
      } finally {
        setLoading(false);
      }
    };
    fetchWorksheet();
    // selectedUserId is intentionally a dependency so switching tabs loads that person's sheet.
  }, [dateMode, dateValue, selectedUserId, reloadKey]);

  const reload = () => setReloadKey((value) => value + 1);
  const selectedTab = tabs.find((tab) => tab.id === selectedUserId);
  const showOwnerNote = tabs.length > 1;

  const openNewRow = () => {
    setEditingRowId('');
    const initial = {};
    columns.filter((column) => column.type === 'date').forEach((column) => {
      initial[column.key] = dateMode === 'day' ? dateValue : todayInputValue();
    });
    setRowValues(initial);
    setModalError('');
    setRowModalOpen(true);
  };

  const openEditRow = (row) => {
    setEditingRowId(row.id);
    setRowValues({ ...row.values });
    setModalError('');
    setRowModalOpen(true);
  };

  const submitRow = async (e) => {
    e.preventDefault();
    setSavingRow(true);
    setModalError('');
    try {
      if (editingRowId) {
        await api.put(`/worksheet/rows/${editingRowId}`, { values: rowValues });
      } else {
        await api.post('/worksheet/rows', { userId: selectedUserId, values: rowValues });
      }
      setRowModalOpen(false);
      reload();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not save row.');
    } finally {
      setSavingRow(false);
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm('Delete this row?')) return;
    try {
      await api.delete(`/worksheet/rows/${row.id}`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete row.');
    }
  };

  const openColumnsModal = () => {
    setNewColumnName('');
    setNewColumnType('text');
    setModalError('');
    setColumnsModalOpen(true);
  };

  const addColumn = async (e) => {
    e.preventDefault();
    if (!newColumnName.trim()) {
      setModalError('Column name is required');
      return;
    }
    setColumnBusy(true);
    setModalError('');
    try {
      await api.post('/worksheet/columns', { userId: selectedUserId, label: newColumnName.trim(), type: newColumnType });
      setNewColumnName('');
      setNewColumnType('text');
      reload();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not add column.');
    } finally {
      setColumnBusy(false);
    }
  };

  const renameColumn = async (column) => {
    const label = window.prompt('Rename column', column.label);
    if (label === null || !label.trim() || label.trim() === column.label) return;
    setModalError('');
    try {
      await api.put(`/worksheet/columns/${column.id}`, { label: label.trim() });
      reload();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not rename column.');
    }
  };

  const deleteColumn = async (column) => {
    if (!window.confirm(`Delete column "${column.label}"? Values in this column will be removed from all rows.`)) return;
    setModalError('');
    try {
      await api.delete(`/worksheet/columns/${column.id}`);
      reload();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not delete column.');
    }
  };

  const openImportModal = () => {
    setImportFile(null);
    setImportResult('');
    setModalError('');
    setImportModalOpen(true);
  };

  const submitImport = async (e) => {
    e.preventDefault();
    if (!importFile) {
      setModalError('Choose a CSV or Excel file first');
      return;
    }
    setImporting(true);
    setModalError('');
    setImportResult('');
    try {
      const form = new FormData();
      form.append('file', importFile);
      form.append('userId', selectedUserId);
      const { data } = await api.post('/worksheet/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newColumnsNote = data.newColumns?.length ? ` New columns added: ${data.newColumns.join(', ')}.` : '';
      setImportResult(`${data.importedRows} rows imported.${newColumnsNote}`);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      reload();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not import file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Team Worksheet</p>
          <h1 className="font-display text-2xl font-bold text-charcoal">Worksheet</h1>
          <p className="mt-1 text-sm text-charcoal/55">
            Fill your own rows and columns, or upload a CSV / Excel file. Nothing is filled automatically.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex rounded-lg border border-cardline bg-offwhite-200 p-1">
            <button
              type="button"
              onClick={() => setDateMode('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dateMode === 'all' ? 'bg-sage text-offwhite-100' : 'text-charcoal/60 hover:text-charcoal'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDateMode('day')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dateMode === 'day' ? 'bg-sage text-offwhite-100' : 'text-charcoal/60 hover:text-charcoal'}`}
            >
              Day
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
          <Button type="button" variant="outline" onClick={reload}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button type="button" variant="outline" onClick={openImportModal} disabled={!selectedUserId}>
            <Upload size={14} /> Upload CSV / Excel
          </Button>
          <Button type="button" variant="outline" onClick={openColumnsModal} disabled={!selectedUserId}>
            <Columns3 size={14} /> Columns
          </Button>
          <Button type="button" onClick={openNewRow} disabled={!selectedUserId}>
            <Plus size={14} /> Add Row
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mt-5 flex items-center gap-2 text-sm text-[#8C3B2E]">
          <AlertTriangle size={18} /> {error}
        </Card>
      )}

      <Card className="mt-5" padded={false}>
        {showOwnerNote && (
          <div className="border-b border-cardline px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedUserId(tab.id)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                    selectedUserId === tab.id
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
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-offwhite-300 text-[11px] uppercase tracking-wide text-charcoal/55">
              <tr>
                <th className="w-14 border-b border-r border-cardline px-3 py-2">#</th>
                {columns.map((column) => (
                  <th key={column.key} className="border-b border-r border-cardline px-3 py-2">{column.label}</th>
                ))}
                <th className="w-28 border-b border-cardline px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-12 text-center text-sm text-charcoal/55">
                    Loading worksheet...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Inbox size={22} className="text-charcoal/35" />
                      <p className="text-sm font-semibold text-charcoal">
                        {selectedTab ? `No rows in ${selectedTab.name}'s worksheet yet` : 'No rows yet'}
                      </p>
                      <p className="text-xs text-charcoal/55">Use Add Row or Upload CSV / Excel to fill this sheet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.id} className="odd:bg-offwhite-100 even:bg-offwhite-200/70 hover:bg-sage-muted/15">
                    <td className="border-b border-r border-cardline px-3 py-2 font-mono text-xs text-charcoal/45">{index + 1}</td>
                    {columns.map((column) => (
                      <td key={column.key} className="border-b border-r border-cardline px-3 py-2 text-charcoal/80">
                        <span className="line-clamp-3 whitespace-pre-line">{formatCellValue(column, row.values?.[column.key])}</span>
                      </td>
                    ))}
                    <td className="border-b border-cardline px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {row.source === 'import' && <Badge tone="teal">Imported</Badge>}
                        <button
                          type="button"
                          onClick={() => openEditRow(row)}
                          className="rounded-md p-1.5 text-charcoal/55 hover:bg-offwhite-300 hover:text-charcoal"
                          aria-label="Edit row"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(row)}
                          className="rounded-md p-1.5 text-charcoal/55 hover:bg-[#8C3B2E]/10 hover:text-[#8C3B2E]"
                          aria-label="Delete row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={rowModalOpen} onClose={() => setRowModalOpen(false)} title={editingRowId ? 'Edit Row' : 'Add Row'} className="max-w-3xl">
        <form onSubmit={submitRow} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          {columns.length === 0 ? (
            <p className="text-sm text-charcoal/60">Add at least one column first.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {columns.map((column) => (
                <Input
                  key={column.key}
                  type={column.type === 'date' ? 'date' : 'text'}
                  label={column.label}
                  value={rowValues[column.key] || ''}
                  onChange={(e) => setRowValues((values) => ({ ...values, [column.key]: e.target.value }))}
                />
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRowModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingRow || columns.length === 0}>
              {savingRow ? 'Saving...' : editingRowId ? 'Save Row' : 'Add Row'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={columnsModalOpen} onClose={() => setColumnsModalOpen(false)} title={`Columns${selectedTab && showOwnerNote ? ` - ${selectedTab.name}` : ''}`}>
        <div className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <ul className="divide-y divide-cardline rounded-lg border border-cardline">
            {columns.map((column) => (
              <li key={column.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-medium text-charcoal">
                  {column.label}
                  {column.type === 'date' && <span className="ml-2 text-[10px] uppercase text-charcoal/50">Date</span>}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => renameColumn(column)}
                    className="rounded-md p-1.5 text-charcoal/55 hover:bg-offwhite-300 hover:text-charcoal"
                    aria-label={`Rename ${column.label}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteColumn(column)}
                    className="rounded-md p-1.5 text-charcoal/55 hover:bg-[#8C3B2E]/10 hover:text-[#8C3B2E]"
                    aria-label={`Delete ${column.label}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={addColumn} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Input
              label="New column"
              placeholder="Example: Remark, Outcome"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal">Type</label>
              <select value={newColumnType} onChange={(e) => setNewColumnType(e.target.value)} className={selectClass}>
                <option value="text">Text</option>
                <option value="date">Date</option>
              </select>
            </div>
            <Button type="submit" disabled={columnBusy}>{columnBusy ? 'Adding...' : 'Add'}</Button>
          </form>
        </div>
      </Modal>

      <Modal open={importModalOpen} onClose={() => setImportModalOpen(false)} title="Upload CSV / Excel">
        <form onSubmit={submitImport} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          {importResult && <div className="rounded-lg bg-sage-muted/25 px-3.5 py-3 text-sm text-charcoal">{importResult}</div>}
          <div className="rounded-lg border border-dashed border-cardline bg-offwhite-200 p-4 text-sm text-charcoal/70">
            <p className="flex items-center gap-2 font-semibold text-charcoal">
              <FileSpreadsheet size={16} className="text-sage" /> How it works
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>First row of the file must be the column names.</li>
              <li>Names that match your existing columns fill those columns; other names become new columns.</li>
              <li>Rows are added{selectedTab && showOwnerNote ? ` to ${selectedTab.name}'s worksheet` : ' to your worksheet'}. Existing rows are not changed.</li>
              <li>Google Sheet: File &gt; Download &gt; Comma-separated values (.csv) or Microsoft Excel (.xlsx). Max 5 MB / 5000 rows.</li>
            </ul>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-charcoal file:mr-3 file:rounded-lg file:border-0 file:bg-sage file:px-3 file:py-2 file:text-sm file:font-semibold file:text-offwhite-100"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setImportModalOpen(false)}>Close</Button>
            <Button type="submit" disabled={importing || !importFile}>{importing ? 'Uploading...' : 'Upload'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Worksheet;
