import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, CalendarDays, Inbox, PackageCheck, RefreshCw, Trash2, Truck } from 'lucide-react';
import api from '../api/axios.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Input from './ui/Input.jsx';
import Modal from './ui/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';
import { CompactAttachments, SelectedAttachments, appendSelectedFiles, removeSelectedFile } from './ui/Attachments.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const pad2 = (value) => String(value).padStart(2, '0');
const toDateInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const toMonthInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const toWeekInputValue = (date) => {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(((target - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${pad2(weekNumber)}`;
};
const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};
const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};
const getWeekRange = (weekValue) => {
  const [yearText, weekText] = weekValue.split('-W');
  const year = Number(yearText);
  const week = Number(weekText);
  const jan4 = new Date(year, 0, 4);
  const monday = startOfDay(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  const sunday = endOfDay(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
};
const getDateRange = (mode, value) => {
  if (mode === 'all') return null;
  if (mode === 'month') {
    const [year, month] = value.split('-').map(Number);
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
  }
  if (mode === 'week') return getWeekRange(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return { start: startOfDay(date), end: endOfDay(date) };
};
const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const emptyDispatchForm = {
  receiverName: '',
  receiverPhone: '',
  address: '',
  courierPartner: '',
  deliveryMode: 'courier',
  selfPickupByName: '',
  trackingNumber: '',
  paymentPaidBy: 'clinic',
  paymentAmount: '',
  paymentMode: '',
  notes: '',
};

const statusTone = {
  pending: 'amber',
  dispatched: 'teal',
  delivered: 'default',
};

const CourierRequestList = ({ title, subtitle, statuses = ['all'], emptyText }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateMode, setDateMode] = useState('month');
  const [dateValue, setDateValue] = useState(() => toDateInputValue(new Date()));
  const [weekValue, setWeekValue] = useState(() => toWeekInputValue(new Date()));
  const [monthValue, setMonthValue] = useState(() => toMonthInputValue(new Date()));
  const [reloadKey, setReloadKey] = useState(0);
  const [dispatchRow, setDispatchRow] = useState(null);
  const [deliverRow, setDeliverRow] = useState(null);
  const [form, setForm] = useState(emptyDispatchForm);
  const [receivedByName, setReceivedByName] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/courier/requests', { params: { status: statuses.join(',') } });
        setRows(data.rows || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load courier records.');
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [statuses, reloadKey]);

  const activeValue = dateMode === 'week' ? weekValue : dateMode === 'month' ? monthValue : dateValue;
  const activeRange = useMemo(() => getDateRange(dateMode, activeValue), [dateMode, activeValue]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const text = `${row.patientName} ${row.patientNumber} ${row.stage} ${row.medicineRequest?.courier?.trackingNumber || ''}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (!activeRange) return true;
      const courier = row.medicineRequest?.courier || {};
      const date = new Date(courier.deliveredAt || courier.dispatchedAt || row.medicineRequest?.sentToCourierAt || 0);
      return date >= activeRange.start && date <= activeRange.end;
    });
  }, [activeRange, rows, search]);

  const totals = useMemo(
    () => filteredRows.reduce(
      (acc, row) => {
        const status = row.medicineRequest?.courier?.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        acc.amount += Number(row.medicineRequest?.courier?.paymentAmount || 0);
        return acc;
      },
      { pending: 0, dispatched: 0, delivered: 0, amount: 0 }
    ),
    [filteredRows]
  );

  const handleModeChange = (mode) => {
    setDateMode(mode);
    if (mode === 'today') setDateValue(toDateInputValue(new Date()));
  };

  const openDispatch = (row) => {
    const courier = row.medicineRequest.courier || {};
    setForm({
      receiverName: courier.receiverName || '',
      receiverPhone: courier.receiverPhone || row.patientNumber || '',
      address: courier.address || '',
      courierPartner: courier.courierPartner || '',
      deliveryMode: courier.deliveryMode || 'courier',
      selfPickupByName: courier.selfPickupByName || '',
      trackingNumber: courier.trackingNumber || '',
      paymentPaidBy: courier.paymentPaidBy || 'clinic',
      paymentAmount: courier.paymentAmount || '',
      paymentMode: courier.paymentMode || '',
      notes: courier.notes || '',
    });
    setFiles([]);
    setModalError('');
    setDispatchRow(row);
  };

  const submitDispatch = async (e) => {
    e.preventDefault();
    if (form.deliveryMode !== 'self' && !files.length && !dispatchRow.medicineRequest.courier?.packageImageUrl && !dispatchRow.medicineRequest.courier?.packageImages?.length) {
      setModalError('Package image is required');
      return;
    }
    if (form.deliveryMode === 'self' && (!form.receiverName.trim() || !form.receiverPhone.trim())) {
      setModalError('Receiver name and receiver phone are required');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value));
      formData.append('status', form.deliveryMode === 'self' ? 'delivered' : 'dispatched');
      if (dispatchRow.requestId) formData.append('requestId', dispatchRow.requestId);
      if (form.deliveryMode === 'self') formData.append('receivedByName', form.receiverName);
      files.forEach((file) => formData.append('courierImage', file));
      await api.patch(`/courier/requests/${dispatchRow.patientId}/stages/${dispatchRow.stage}`, formData);
      setDispatchRow(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not dispatch courier.');
    } finally {
      setSaving(false);
    }
  };

  const openDeliver = (row) => {
    setReceivedByName(row.medicineRequest.courier?.receivedByName || '');
    setFiles([]);
    setModalError('');
    setDeliverRow(row);
  };

  const submitDelivered = async (e) => {
    e.preventDefault();
    if (!receivedByName.trim()) {
      setModalError('Received by whom is required');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const formData = new FormData();
      formData.append('status', 'delivered');
      if (deliverRow.requestId) formData.append('requestId', deliverRow.requestId);
      formData.append('receivedByName', receivedByName);
      files.forEach((file) => formData.append('courierImage', file));
      await api.patch(`/courier/requests/${deliverRow.patientId}/stages/${deliverRow.stage}`, formData);
      setDeliverRow(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not mark delivered.');
    } finally {
      setSaving(false);
    }
  };

  const adminRequestAction = async (row, action) => {
    if (!isAdmin) return;
    const label = action === 'cancel' ? 'cancel this courier request' : 'delete this courier request permanently';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setSaving(true);
    setModalError('');
    try {
      if (action === 'cancel') {
        await api.patch(`/courier/requests/${row.patientId}/stages/${row.stage}`, { status: 'cancelled', requestId: row.requestId });
      } else {
        await api.delete(`/courier/requests/${row.patientId}/stages/${row.stage}`, { data: { requestId: row.requestId } });
      }
      setReloadKey((value) => value + 1);
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${action} courier request.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">{title}</h1>
          <p className="mt-1 text-sm text-charcoal/60">{subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Card><p className="text-xs font-semibold uppercase text-charcoal/55">Pending</p><p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : totals.pending}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-charcoal/55">Dispatched</p><p className="mt-1 font-display text-2xl font-bold text-sage">{loading ? '...' : totals.dispatched}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-charcoal/55">Delivered</p><p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : totals.delivered}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-charcoal/55">Courier Payment</p><p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : formatMoney(totals.amount)}</p></Card>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="space-y-3 border-b border-cardline-soft p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, phone, tracking"
              className="flex-1 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
            <select value={dateMode} onChange={(e) => handleModeChange(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="date">Date</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
              <input
                type={dateMode === 'week' ? 'week' : dateMode === 'month' ? 'month' : 'date'}
                value={dateMode === 'week' ? weekValue : dateMode === 'month' ? monthValue : dateValue}
                onChange={(e) => {
                  if (dateMode === 'week') setWeekValue(e.target.value);
                  else if (dateMode === 'month') setMonthValue(e.target.value);
                  else setDateValue(e.target.value);
                }}
                disabled={dateMode === 'all'}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-50 lg:w-44"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading courier records...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center"><AlertTriangle size={22} className="text-[#8C3B2E]" /><p className="text-sm font-medium text-charcoal">{error}</p></div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center"><Inbox size={22} className="text-charcoal/35" /><p className="text-sm font-medium text-charcoal">{emptyText}</p></div>
        ) : (
          <div className="divide-y divide-cardline-soft">
            {filteredRows.map((row) => {
              const request = row.medicineRequest;
              const courier = request.courier || {};
              return (
                <div key={`${row.patientId}-${row.stage}-${row.requestId}`} className="grid gap-4 p-5 xl:grid-cols-[1.1fr_1fr_1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? <Link to={`/admin/patients/${row.patientId}`} className="font-display text-lg font-bold text-charcoal hover:text-sage">{row.patientName}</Link> : <span className="font-display text-lg font-bold text-charcoal">{row.patientName}</span>}
                      <Badge tone="teal">Phase {row.stage}</Badge>
                      <Badge tone={statusTone[courier.status] || 'default'}>{courier.statusLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-charcoal/55">{row.patientNumber || '-'} · Sent: {formatDateTime(request.sentToCourierAt)}</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-charcoal/70">{request.medicines}</p>
                    {(request.packagedByName || request.chitsWrittenByName || request.lastMedicineCheckedByName) && (
                      <div className="mt-2 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-xs text-charcoal/65">
                        <p>Packaging by: <span className="font-semibold text-charcoal">{request.packagedByName || '-'}</span></p>
                        <p className="mt-1">Chits written by: <span className="font-semibold text-charcoal">{request.chitsWrittenByName || '-'}</span></p>
                        <p className="mt-1">Last checking by: <span className="font-semibold text-charcoal">{request.lastMedicineCheckedByName || '-'}</span></p>
                        <p className="mt-1">Filled by: <span className="font-semibold text-charcoal">{request.packagingDetailsFilledByName || '-'}</span></p>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-charcoal/70">
                    <p className="font-semibold text-charcoal">{courier.deliveryMode === 'self' ? 'Delivery' : 'Dispatch'}</p>
                    <p className="mt-1">Mode: {courier.deliveryMode === 'self' ? 'Self pickup' : 'Courier'}</p>
                    {courier.deliveryMode === 'self' ? (
                      <p className="mt-1">Self pickup at clinic</p>
                    ) : (
                      <>
                        <p className="mt-1">Via: {courier.courierPartner || '-'}</p>
                        <p className="mt-1">Tracking: {courier.trackingNumber || '-'}</p>
                        <p className="mt-1 whitespace-pre-line">Address: {courier.address || '-'}</p>
                      </>
                    )}
                    <p className="mt-1">To: {courier.receiverName || '-'} {courier.receiverPhone ? `(${courier.receiverPhone})` : ''}</p>
                  </div>
                  <div className="text-sm text-charcoal/70">
                    <p className="font-semibold text-charcoal">Delivery</p>
                    {courier.deliveryMode !== 'self' && (
                      <>
                        <p className="mt-1">Paid by: {courier.paymentPaidBy === 'client' ? 'Client' : 'Clinic'}</p>
                        <p className="mt-1">Amount: {formatMoney(courier.paymentAmount)}</p>
                      </>
                    )}
                    <p className="mt-1">Received by: {courier.receivedByName || '-'}</p>
                    <p className="mt-1">Delivered: {formatDateTime(courier.deliveredAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <CompactAttachments files={courier.packageImages} fallbackUrl={courier.packageImageUrl} fallbackName={courier.packageImageFileName || 'Package'} label="Package" />
                      <CompactAttachments files={courier.deliveryProofImages} fallbackUrl={courier.deliveryProofUrl} fallbackName={courier.deliveryProofFileName || 'Delivery Proof'} label="Delivery proof" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                    {isAdmin && courier.status !== 'cancelled' && (
                      <>
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => adminRequestAction(row, 'cancel')}>
                          <Ban size={14} /> Cancel
                        </Button>
                        <Button size="sm" variant="danger" disabled={saving} onClick={() => adminRequestAction(row, 'delete')}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      </>
                    )}
                    {courier.status === 'pending' && <Button size="sm" onClick={() => openDispatch(row)}><Truck size={14} /> Dispatch</Button>}
                    {courier.status === 'dispatched' && <Button size="sm" onClick={() => openDeliver(row)}><PackageCheck size={14} /> Mark Delivered</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={!!dispatchRow} onClose={() => setDispatchRow(null)} title="Dispatch Courier" className="max-w-2xl">
        <form onSubmit={submitDispatch} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Delivery Type</label>
            <select value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
              <option value="courier">Courier</option>
              <option value="self">Self pickup</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Receiver Name" value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} required />
            <Input label="Receiver Phone" value={form.receiverPhone} onChange={(e) => setForm({ ...form, receiverPhone: e.target.value })} required />
            {form.deliveryMode !== 'self' && (
              <>
                <Input label="Courier Partner" value={form.courierPartner} onChange={(e) => setForm({ ...form, courierPartner: e.target.value })} required />
                <Input label="Tracking Number" value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} required />
                <Input label="Courier Payment Amount" type="number" min="0" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} />
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Paid By</label>
                  <select value={form.paymentPaidBy} onChange={(e) => setForm({ ...form, paymentPaidBy: e.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
                    <option value="clinic">Clinic</option>
                    <option value="client">Client</option>
                  </select>
                </div>
              </>
            )}
          </div>
          {form.deliveryMode !== 'self' && (
            <textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" required />
          )}
          {form.deliveryMode !== 'self' && (
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />
          )}
          <label className="block rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-4 text-center text-sm font-semibold text-sage cursor-pointer">
            Upload package images
            <input type="file" accept="image/*" multiple onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
          </label>
          <label className="block rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-4 text-center text-sm font-semibold text-sage cursor-pointer">
            Camera
            <input type="file" accept="image/*" capture="environment" onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
          </label>
          <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDispatchRow(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : form.deliveryMode === 'self' ? 'Mark Delivered' : 'Dispatch'}</Button></div>
        </form>
      </Modal>

      <Modal open={!!deliverRow} onClose={() => setDeliverRow(null)} title="Mark Delivered">
        <form onSubmit={submitDelivered} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <Input label="Received By Whom" value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} required />
          <label className="block rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-4 text-center text-sm font-semibold text-sage cursor-pointer">
            Upload delivery proof images (optional)
            <input type="file" accept="image/*" multiple onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
          </label>
          <label className="block rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-4 text-center text-sm font-semibold text-sage cursor-pointer">
            Camera
            <input type="file" accept="image/*" capture="environment" onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
          </label>
          <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDeliverRow(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Mark Delivered'}</Button></div>
        </form>
      </Modal>
    </div>
  );
};

export default CourierRequestList;
