import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Inbox, PackageCheck, RefreshCw, Ban, Trash2 } from 'lucide-react';
import api from '../api/axios.js';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
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

const statusTone = {
  requested: 'amber',
  in_process: 'teal',
  made: 'teal',
  sent_to_courier: 'default',
};

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const MedicineRequestList = ({ title, subtitle, statuses, emptyText, actions = [] }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [dateMode, setDateMode] = useState('month');
  const [dateValue, setDateValue] = useState(() => toDateInputValue(new Date()));
  const [weekValue, setWeekValue] = useState(() => toWeekInputValue(new Date()));
  const [monthValue, setMonthValue] = useState(() => toMonthInputValue(new Date()));
  const [imageAction, setImageAction] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [imageError, setImageError] = useState('');
  const [courierAction, setCourierAction] = useState(null);
  const [courierForm, setCourierForm] = useState({ packagedByName: '', chitsWrittenByName: '', lastMedicineCheckedByName: '' });
  const [courierError, setCourierError] = useState('');
  const [choiceRow, setChoiceRow] = useState(null);
  const [pickupRow, setPickupRow] = useState(null);
  const [pickupForm, setPickupForm] = useState({ receiverName: '', receiverPhone: '', receivedByName: '', notes: '' });
  const [pickupFiles, setPickupFiles] = useState([]);
  const [pickupError, setPickupError] = useState('');

  const { data, loading, error: queryError, refresh } = useApiQuery('/medicine/requests', {
    params: { status: statuses.join(',') },
  });
  const rows = data?.rows || [];
  useEffect(() => {
    if (queryError && !data) setError(queryError.response?.data?.message || 'Could not load records.');
    else setError('');
  }, [queryError, data]);

  const updateStatus = async (row, status, files = []) => {
    const key = `${row.patientId}-${row.stage}-${row.requestId}-${status}`;
    setBusyKey(key);
    try {
      if (files.length) {
        const formData = new FormData();
        formData.append('status', status);
        if (row.requestId) formData.append('requestId', row.requestId);
        files.forEach((file) => formData.append('medicineImage', file));
        await api.patch(`/medicine/requests/${row.patientId}/stages/${row.stage}`, formData);
      } else {
        await api.patch(`/medicine/requests/${row.patientId}/stages/${row.stage}`, { status, requestId: row.requestId });
      }
      refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update medicine status.');
    } finally {
      setBusyKey('');
    }
  };

  const adminRequestAction = async (row, status) => {
    if (!isAdmin) return;
    const label = status === 'cancelled' ? 'cancel this medicine request' : 'delete this medicine request permanently';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    if (status === 'cancelled') {
      await updateStatus(row, status);
      return;
    }
    const key = `${row.patientId}-${row.stage}-${row.requestId}-delete`;
    setBusyKey(key);
    try {
      await api.delete(`/medicine/requests/${row.patientId}/stages/${row.stage}`, { data: { requestId: row.requestId } });
      refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete medicine request.');
    } finally {
      setBusyKey('');
    }
  };

  const sendToCourier = async (row, values) => {
    const key = `${row.patientId}-${row.stage}-${row.requestId}-sent_to_courier`;
    setBusyKey(key);
    try {
      await api.patch(`/medicine/requests/${row.patientId}/stages/${row.stage}`, {
        status: 'sent_to_courier',
        requestId: row.requestId,
        packagedByName: values.packagedByName,
        chitsWrittenByName: values.chitsWrittenByName,
        lastMedicineCheckedByName: values.lastMedicineCheckedByName,
      });
      refresh();
      return true;
    } catch (err) {
      setCourierError(err.response?.data?.message || 'Could not send to courier.');
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const savePackaging = async (row, values) => {
    const key = `${row.patientId}-${row.stage}-${row.requestId}-sent_to_courier`;
    setBusyKey(key);
    try {
      await api.patch(`/medicine/requests/${row.patientId}/stages/${row.stage}`, { status: 'made', action: 'savePackaging', requestId: row.requestId, ...values });
      refresh();
      return true;
    } catch (err) {
      setCourierError(err.response?.data?.message || 'Could not save packaging details.');
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const chooseCourier = async (row) => {
    setChoiceRow(null);
    await sendToCourier(row, {});
  };

  const openPickup = (row) => {
    setChoiceRow(null);
    setPickupRow(row);
    setPickupForm({ receiverName: '', receiverPhone: '', receivedByName: '', notes: '' });
    setPickupFiles([]);
    setPickupError('');
  };

  const submitPickup = async (e) => {
    e.preventDefault();
    if (!pickupForm.receiverName.trim() || !pickupForm.receiverPhone.trim()) {
      setPickupError('Receiver name and receiver phone are required');
      return;
    }
    const row = pickupRow;
    setBusyKey(`${row.patientId}-${row.stage}-${row.requestId}-pickup`);
    try {
      const formData = new FormData();
      formData.append('status', 'made');
      formData.append('action', 'selfPickup');
      if (row.requestId) formData.append('requestId', row.requestId);
      Object.entries(pickupForm).forEach(([key, value]) => formData.append(key, value.trim()));
      pickupFiles.forEach((file) => formData.append('medicineImage', file));
      await api.patch(`/medicine/requests/${row.patientId}/stages/${row.stage}`, formData);
      setPickupRow(null);
      refresh();
    } catch (err) {
      setPickupError(err.response?.data?.message || 'Could not save self pickup.');
    } finally {
      setBusyKey('');
    }
  };

  const openImageAction = (row, action) => {
    setImageAction({ row, action });
    setImageFiles([]);
    setImageError('');
  };

  const submitImageAction = async (e) => {
    e.preventDefault();
    if (!imageFiles.length) {
      setImageError('Medicine image is required');
      return;
    }
    await updateStatus(imageAction.row, imageAction.action.status, imageFiles);
    setImageAction(null);
  };

  const openCourierAction = (row) => {
    const request = row.medicineRequest || {};
    setCourierAction(row);
    setCourierForm({
      packagedByName: request.packagedByName || '',
      chitsWrittenByName: request.chitsWrittenByName || '',
      lastMedicineCheckedByName: request.lastMedicineCheckedByName || '',
    });
    setCourierError('');
  };

  const submitCourierAction = async (e) => {
    e.preventDefault();
    if (!courierForm.packagedByName.trim() || !courierForm.chitsWrittenByName.trim() || !courierForm.lastMedicineCheckedByName.trim()) {
      setCourierError('Packaging by, chits written by and last medicine checking by are required');
      return;
    }
    const row = courierAction;
    const saved = await savePackaging(row, courierForm);
    if (saved) { setCourierAction(null); setChoiceRow(row); }
  };

  const activeDateValue = dateMode === 'week' ? weekValue : dateMode === 'month' ? monthValue : dateValue;
  const activeRange = useMemo(() => getDateRange(dateMode, activeDateValue), [dateMode, activeDateValue]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!activeRange) return true;
        const request = row.medicineRequest || {};
        const rawDate = request.sentToCourierAt || request.madeAt || request.inProcessAt || request.requestedAt;
        const date = new Date(rawDate || 0);
        return date >= activeRange.start && date <= activeRange.end;
      }),
    [activeRange, rows]
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">{title}</h1>
          <p className="mt-1 text-sm text-charcoal/60">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={dateMode} onChange={(e) => setDateMode(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
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
              className="w-44 rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-50"
            />
          </div>
          <Button variant="outline" onClick={() => refresh()}>
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex items-center justify-between border-b border-cardline-soft px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-charcoal">
            <PackageCheck size={17} className="text-sage" /> Requests
          </h2>
          <Badge tone="teal">{loading ? '...' : filteredRows.length}</Badge>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading requests...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{error}</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">{emptyText}</p>
          </div>
        ) : (
          <div className="divide-y divide-cardline-soft">
            {filteredRows.map((row) => {
              const request = row.medicineRequest;
              return (
                <div key={`${row.patientId}-${row.stage}-${row.requestId}`} className="grid gap-4 p-5 lg:grid-cols-[1.25fr_1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <Link to={`/admin/patients/${row.patientId}`} className="font-display text-lg font-bold text-charcoal hover:text-sage">
                          {row.patientName}
                        </Link>
                      ) : (
                        <span className="font-display text-lg font-bold text-charcoal">{row.patientName}</span>
                      )}
                      <Badge tone="teal">Phase {row.stage}</Badge>
                      <Badge tone={statusTone[request.status] || 'default'}>{request.statusLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-charcoal/55">
                      {row.patientNumber || '-'} · {row.categoryLabel || '-'} · Requested by {request.requestedByName || '-'}
                    </p>
                    <p className="mt-1 text-xs text-charcoal/55">Requested: {formatDateTime(request.requestedAt)}</p>
                    {request.inProcessAt && (
                      <p className="mt-1 text-xs text-charcoal/55">
                        In process: {formatDateTime(request.inProcessAt)} by {request.inProcessByName || '-'}
                      </p>
                    )}
                    {request.madeAt && (
                      <p className="mt-1 text-xs text-charcoal/55">
                        Medicine made: {formatDateTime(request.madeAt)} by {request.madeByName || '-'}
                      </p>
                    )}
                    {request.sentToCourierAt && (
                      <p className="mt-1 text-xs font-semibold text-sage">
                        Sent to courier: {formatDateTime(request.sentToCourierAt)} by {request.sentToCourierByName || '-'}
                      </p>
                    )}
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
                    <p className="font-semibold text-charcoal">Medicines</p>
                    <p className="mt-1 whitespace-pre-line">{request.medicines}</p>
                    {request.notes && <p className="mt-2 whitespace-pre-line text-xs text-charcoal/55">{request.notes}</p>}
                    <CompactAttachments files={request.prescriptionFiles} fallbackUrl={request.prescriptionUrl} fallbackName={request.prescriptionFileName || 'Prescription'} label="Prescription" />
                    <CompactAttachments files={request.medicineImages} fallbackUrl={request.medicineImageUrl} fallbackName={request.medicineImageFileName || 'Medicine Image'} label="Medicine images" />
                    {request.status === 'made' && request.courier?.deliveryMode === 'self' && request.courier?.status === 'delivered' && (
                      <div className="mt-3 rounded-lg border border-cardline bg-offwhite-200 p-3 text-xs text-charcoal/65">
                        <p className="font-semibold text-charcoal">Self pickup</p>
                        <p className="mt-1">Picked up by: {request.courier.receivedByName || request.courier.receiverName || '-'}</p>
                        <p className="mt-1">Phone: {request.courier.receiverPhone || '-'}</p>
                        <p className="mt-1">Handed over: {formatDateTime(request.courier.deliveredAt)} by {request.courier.deliveredByName || '-'}</p>
                        {request.courier.notes && <p className="mt-1">Notes: {request.courier.notes}</p>}
                        <CompactAttachments files={request.courier.deliveryProofImages} fallbackUrl={request.courier.deliveryProofUrl} fallbackName="Pickup proof" label="Pickup proof" />
                      </div>
                    )}
                    {request.status === 'sent_to_courier' && (
                      <div className="mt-3 rounded-lg border border-cardline bg-offwhite-200 p-3 text-xs text-charcoal/65">
                        <p className="font-semibold text-charcoal">Courier</p>
                        <p className="mt-1">Status: {request.courier?.statusLabel || 'Courier Pending'}</p>
                        <p className="mt-1">Via: {request.courier?.courierPartner || '-'}</p>
                        <p className="mt-1">Tracking: {request.courier?.trackingNumber || '-'}</p>
                        <p className="mt-1">Received by: {request.courier?.receivedByName || '-'}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                    {isAdmin && (
                      <>
                        {request.status !== 'cancelled' && (
                          <Button size="sm" variant="outline" disabled={!!busyKey} onClick={() => adminRequestAction(row, 'cancelled')}>
                            <Ban size={14} /> Cancel
                          </Button>
                        )}
                        <Button size="sm" variant="danger" disabled={!!busyKey} onClick={() => adminRequestAction(row, 'delete')}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      </>
                    )}
                    {actions
                      .filter((action) => action.from.includes(request.status))
                      .map((action) => {
                        const key = `${row.patientId}-${row.stage}-${row.requestId}-${action.status}`;
                        if (action.status === 'sent_to_courier') {
                          if (request.courier?.deliveryMode === 'self' && request.courier?.status === 'delivered') return null;
                          if (!request.packagedByName || !request.chitsWrittenByName || !request.lastMedicineCheckedByName) {
                            return <Button key={action.status} size="sm" disabled={!!busyKey} onClick={() => openCourierAction(row)}>Fill Packaging Details</Button>;
                          }
                          return <Button key={action.status} size="sm" disabled={!!busyKey} onClick={() => setChoiceRow(row)}>Courier / Self Pickup</Button>;
                        }
                        return (
                          <Button
                            key={action.status}
                            size="sm"
                            variant={action.variant || 'primary'}
                            disabled={busyKey === key}
                            onClick={() => {
                              if (action.requiresImage) {
                                openImageAction(row, action);
                                return;
                              }
                              if (action.status === 'sent_to_courier') {
                                openCourierAction(row);
                                return;
                              }
                              updateStatus(row, action.status);
                            }}
                          >
                            {busyKey === key ? 'Saving...' : action.label}
                          </Button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {imageAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
          <form onSubmit={submitImageAction} className="w-full max-w-md rounded-lg border border-cardline bg-offwhite-100 p-5 shadow-xl">
            <h3 className="font-display text-lg font-bold text-charcoal">{imageAction.action.label}</h3>
            <p className="mt-1 text-sm text-charcoal/60">Upload medicine images after the medicine is prepared.</p>
            {imageError && <p className="mt-3 rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{imageError}</p>}
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-4 text-sm font-semibold text-sage hover:border-sage">
              Choose medicine images
              <input type="file" accept="image/*" multiple onChange={(e) => appendSelectedFiles(setImageFiles, e.target.files)} className="hidden" />
            </label>
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-3 text-sm font-semibold text-sage hover:border-sage">
              Camera
              <input type="file" accept="image/*" capture="environment" onChange={(e) => appendSelectedFiles(setImageFiles, e.target.files)} className="hidden" />
            </label>
            <SelectedAttachments files={imageFiles} onRemove={(index) => removeSelectedFile(setImageFiles, index)} />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setImageAction(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!!busyKey}>
                {busyKey ? 'Saving...' : 'Upload & Mark Made'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {courierAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
          <form onSubmit={submitCourierAction} className="w-full max-w-md rounded-lg border border-cardline bg-offwhite-100 p-5 shadow-xl">
            <h3 className="font-display text-lg font-bold text-charcoal">Packaging Details</h3>
            <p className="mt-1 text-sm text-charcoal/60">Fill and save these details first. Then choose courier or self pickup.</p>
            {courierError && <p className="mt-3 rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{courierError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal">Packaging done by</label>
                <input
                  value={courierForm.packagedByName}
                  onChange={(e) => setCourierForm({ ...courierForm, packagedByName: e.target.value })}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal">Chits written by</label>
                <input
                  value={courierForm.chitsWrittenByName}
                  onChange={(e) => setCourierForm({ ...courierForm, chitsWrittenByName: e.target.value })}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal">Last medicine checking by</label>
                <input
                  value={courierForm.lastMedicineCheckedByName}
                  onChange={(e) => setCourierForm({ ...courierForm, lastMedicineCheckedByName: e.target.value })}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                  required
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCourierAction(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!!busyKey}>
                {busyKey ? 'Saving...' : 'Save Details'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {choiceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-cardline bg-offwhite-100 p-5 shadow-xl">
            <h3 className="font-display text-lg font-bold text-charcoal">How will this medicine go?</h3>
            <p className="mt-1 text-sm text-charcoal/60">{choiceRow.patientName} · Phase {choiceRow.stage}. Courier requests go to the courier department. Self pickup is handed over here.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button disabled={!!busyKey} onClick={() => chooseCourier(choiceRow)}>Send By Courier</Button>
              <Button variant="outline" disabled={!!busyKey} onClick={() => openPickup(choiceRow)}>Self Pickup</Button>
            </div>
            <div className="mt-3 flex justify-end"><Button type="button" variant="ghost" onClick={() => setChoiceRow(null)}>Decide later</Button></div>
          </div>
        </div>
      )}

      {pickupRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
          <form onSubmit={submitPickup} className="w-full max-w-md rounded-lg border border-cardline bg-offwhite-100 p-5 shadow-xl">
            <h3 className="font-display text-lg font-bold text-charcoal">Self Pickup</h3>
            <p className="mt-1 text-sm text-charcoal/60">Enter who is collecting the medicine from the clinic.</p>
            {pickupError && <p className="mt-3 rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{pickupError}</p>}
            <div className="mt-4 space-y-3">
              <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Receiver name</label><input className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" required value={pickupForm.receiverName} onChange={(e) => setPickupForm({ ...pickupForm, receiverName: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Receiver phone</label><input className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" type="tel" required value={pickupForm.receiverPhone} onChange={(e) => setPickupForm({ ...pickupForm, receiverPhone: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Received by (if different)</label><input className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" value={pickupForm.receivedByName} onChange={(e) => setPickupForm({ ...pickupForm, receivedByName: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Notes</label><textarea rows={2} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" value={pickupForm.notes} onChange={(e) => setPickupForm({ ...pickupForm, notes: e.target.value })} /></div>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cardline bg-offwhite-200 px-4 py-3 text-sm font-semibold text-sage hover:border-sage">
                Add pickup proof (optional)
                <input type="file" accept="image/*" multiple onChange={(e) => appendSelectedFiles(setPickupFiles, e.target.files)} className="hidden" />
              </label>
              <SelectedAttachments files={pickupFiles} onRemove={(index) => removeSelectedFile(setPickupFiles, index)} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPickupRow(null)}>Cancel</Button>
              <Button type="submit" disabled={!!busyKey}>{busyKey ? 'Saving...' : 'Save Self Pickup'}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default MedicineRequestList;
