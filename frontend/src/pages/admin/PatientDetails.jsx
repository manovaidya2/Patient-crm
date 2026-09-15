import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Check, X, Plus, IndianRupee, History, Paperclip, Inbox, ChevronDown, FileText, CalendarClock, HeartHandshake, Pencil, PackageCheck, PhoneIncoming, PhoneOutgoing, Play, MessageSquarePlus, MessageSquareText, Send, CheckCircle2, Clock } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EditableField from '../../components/ui/EditableField.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import DictationButton from '../../components/ui/DictationButton.jsx';
import { PaperCompletionForm, createEmptyCompletionForm, flattenCompletionSummary, getCompletionPdfHtml } from '../../components/CompletionPaperForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PATIENT_CATEGORIES } from '../../constants/patientCategories.js';
import { STAGES, STAGE_LABELS, STAGE_STATUS_OPTIONS } from '../../constants/treatmentStages.js';
import { PAYMENT_MODES, PAYMENT_MODE_OPTIONS } from '../../constants/paymentModes.js';
import { ASSIGN_DOCTOR_ROLES, ROLES } from '../../constants/roles.js';
import { DISPLAY_STATUS_BADGE_TONE } from '../../constants/scheduleStatuses.js';
import { CompactAttachments, SelectedAttachments, appendSelectedFiles, removeSelectedFile } from '../../components/ui/Attachments.jsx';

const STAGE_OPTIONS = STAGES.map((n) => ({ value: n, label: STAGE_LABELS[n] }));
const YES_NO_OPTIONS = [
  { value: 'false', label: 'No' },
  { value: 'true', label: 'Yes' },
];

const toDateInputValue = (value) => (value ? String(value).slice(0, 10) : '');

const isDateTodayOrPast = (value) => {
  const dateValue = toDateInputValue(value);
  if (!dateValue) return false;
  const today = new Date();
  const todayValue = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return dateValue <= todayValue;
};

const statusStyles = {
  not_started: 'bg-offwhite-200 border-cardline text-charcoal/60',
  in_progress: 'bg-[#9C6B2E]/10 border-[#9C6B2E]/25 text-[#9C6B2E]',
  completed: 'bg-sage-muted/25 border-sage-muted text-sage',
};

// Static files (payment screenshots) are served from the API's root, not under /api
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const formatMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const padDatePart = (value) => String(value).padStart(2, '0');

const toDateTimeLocalValue = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
};

const dateTimeLocalToIso = (value) => {
  if (!value) return '';
  const [datePart, timePart = '00:00'] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
};

const formatCompactDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const formatDuration = (seconds = 0, fallback = '') => {
  const total = Number(seconds || 0);
  if (!total) return fallback || '0s';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
};

const formatRole = (role) =>
  role
    ? role
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'System';

const isClosedScheduleStatus = (status) => ['done', 'done_late', 'cancelled'].includes(status);

const sortScheduleEntries = (entries = []) =>
  [...entries].sort((a, b) => {
    const aClosed = isClosedScheduleStatus(a.displayStatus);
    const bClosed = isClosedScheduleStatus(b.displayStatus);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;

    const aTime = new Date(aClosed ? a.completedAt || a.dateTime : a.dateTime).getTime();
    const bTime = new Date(bClosed ? b.completedAt || b.dateTime : b.dateTime).getTime();
    return aClosed ? bTime - aTime : aTime - bTime;
  });

const isIncomingCall = (type = '') => type.toLowerCase().includes('incoming');

const recordingSource = (call) => (call.recordingFileUrl ? `${SERVER_BASE}${call.recordingFileUrl}` : '');

const callActivityActions = new Set(['Call data received', 'Call data updated', 'Call recording updated']);

const mergeTimelineEntries = (activityEntries = [], callLogs = []) =>
  [
    ...activityEntries
      .filter((entry) => !(callLogs.length && callActivityActions.has(entry.action)))
      .map((entry) => ({
        kind: 'activity',
        id: `activity-${entry.id}`,
        time: entry.createdAt,
        entry,
      })),
    ...callLogs.map((call) => ({
      kind: 'call',
      id: `call-${call.id}`,
      time: call.actionCreationTime || call.createdAt,
      call,
    })),
  ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

const FileLinks = ({ files = [], fallbackUrl, fallbackName = 'View file', label = 'Files' }) => (
  <CompactAttachments files={files} fallbackUrl={fallbackUrl} fallbackName={fallbackName} label={label} />
);

const emptyPaymentForm = {
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMode: PAYMENT_MODES.ONLINE,
  utr: '',
  transactionId: '',
  receivedBy: '',
};

// Small box matching EditableField's look; clicking "+ Add" opens a Modal with the full payment form.
const AddPaymentField = ({ onAdd }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyPaymentForm);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openModal = () => {
    setForm(emptyPaymentForm);
    setFiles([]);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({ ...form, amount: amt, files });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-offwhite-100 p-4">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Add Payment</p>
        <button
          onClick={openModal}
          className="mt-1 flex items-center gap-1 text-sm font-bold text-sage hover:text-sage"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="paymentAmount"
              type="number"
              min="0"
              label="Amount"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              id="paidDate"
              type="date"
              label="Paid Date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Payment Mode</label>
            <div className="flex gap-2">
              {PAYMENT_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, paymentMode: opt.value })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${form.paymentMode === opt.value
                      ? 'bg-sage border-sage text-offwhite-100'
                      : 'bg-offwhite-200 border-cardline text-charcoal/60 hover:border-sage'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.paymentMode === PAYMENT_MODES.ONLINE ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="utr"
                label="UTR"
                placeholder="Optional"
                value={form.utr}
                onChange={(e) => setForm({ ...form, utr: e.target.value })}
              />
              <Input
                id="transactionId"
                label="Transaction ID"
                placeholder="Optional"
                value={form.transactionId}
                onChange={(e) => setForm({ ...form, transactionId: e.target.value })}
              />
            </div>
          ) : (
            <Input
              id="receivedBy"
              label="Received By"
              placeholder="Name of person who received the cash"
              value={form.receivedBy}
              onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Screenshot (optional)</label>
            <label
              htmlFor="paymentScreenshot"
              className="inline-flex items-center gap-1.5 text-sm text-sage hover:text-sage cursor-pointer rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5"
            >
              <Paperclip size={14} />
              <span className="truncate">Attach screenshots</span>
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              id="paymentScreenshot"
              onChange={(e) => appendSelectedFiles(setFiles, e.target.files)}
              className="hidden"
            />
            <label
              htmlFor="paymentScreenshotCamera"
              className="ml-2 inline-flex items-center gap-1.5 text-sm text-sage hover:text-sage cursor-pointer rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5"
            >
              <Paperclip size={14} />
              Camera
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              id="paymentScreenshotCamera"
              onChange={(e) => appendSelectedFiles(setFiles, e.target.files)}
              className="hidden"
            />
            <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

// Small box matching EditableField's look — upload a patient-record file for the stage,
// and once uploaded, the same box shows the file name and opens it on click.
const EditPaymentButton = ({ payment, onSave }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyPaymentForm);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openModal = () => {
    setForm({
      amount: payment.amount || '',
      date: payment.date ? String(payment.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentMode: payment.paymentMode || PAYMENT_MODES.ONLINE,
      utr: payment.utr || '',
      transactionId: payment.transactionId || '',
      receivedBy: payment.receivedBy || '',
    });
    setFiles([]);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(payment.id, { ...form, amount: amt, files });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-sage hover:bg-sage-muted/25"
      >
        <Pencil size={12} /> Edit
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Input
              id={`editPaymentAmount-${payment.id}`}
              type="number"
              min="0"
              label="Amount"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              id={`editPaidDate-${payment.id}`}
              type="date"
              label="Paid Date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Payment Mode</label>
            <div className="flex gap-2">
              {PAYMENT_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, paymentMode: opt.value })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${form.paymentMode === opt.value
                      ? 'bg-sage border-sage text-offwhite-100'
                      : 'bg-offwhite-200 border-cardline text-charcoal/60 hover:border-sage'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.paymentMode === PAYMENT_MODES.ONLINE ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                id={`editUtr-${payment.id}`}
                label="UTR"
                placeholder="Optional"
                value={form.utr}
                onChange={(e) => setForm({ ...form, utr: e.target.value })}
              />
              <Input
                id={`editTransactionId-${payment.id}`}
                label="Transaction ID"
                placeholder="Optional"
                value={form.transactionId}
                onChange={(e) => setForm({ ...form, transactionId: e.target.value })}
              />
            </div>
          ) : (
            <Input
              id={`editReceivedBy-${payment.id}`}
              label="Received By"
              placeholder="Name of person who received the cash"
              value={form.receivedBy}
              onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Screenshot (optional)</label>
            <label
              htmlFor={`editPaymentScreenshot-${payment.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-sage hover:text-sage cursor-pointer rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5"
            >
              <Paperclip size={14} />
              <span className="truncate">{payment.screenshotUrl ? 'Add screenshots' : 'Attach screenshots'}</span>
            </label>
            <input
              id={`editPaymentScreenshot-${payment.id}`}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => appendSelectedFiles(setFiles, e.target.files)}
              className="hidden"
            />
            <label
              htmlFor={`editPaymentScreenshotCamera-${payment.id}`}
              className="ml-2 inline-flex items-center gap-1.5 text-sm text-sage hover:text-sage cursor-pointer rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5"
            >
              <Paperclip size={14} />
              Camera
            </label>
            <input
              id={`editPaymentScreenshotCamera-${payment.id}`}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => appendSelectedFiles(setFiles, e.target.files)}
              className="hidden"
            />
            <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

const RecordFileField = ({ fileUrl, fileName, onUpload, canUpload = true }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = 'stageRecordFile';
  const cameraInputId = 'stageRecordCamera';

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-offwhite-100 p-4">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Patient Records</p>
      {canUpload && (
        <input
          type="file"
          id={inputId}
          accept="image/*,.pdf,.doc,.docx"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      )}
      {canUpload && (
        <input
          type="file"
          id={cameraInputId}
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      )}
      {fileUrl ? (
        <div className="mt-1">
          <a href={`${SERVER_BASE}${fileUrl}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm font-bold text-sage hover:text-charcoal">
            <FileText size={13} className="shrink-0" />
            <span className="truncate">{fileName || 'Record'}</span>
          </a>
          <label
            htmlFor={inputId}
            className={`mt-1 text-[11px] text-sage hover:text-sage cursor-pointer ${canUpload ? 'inline-block' : 'hidden'}`}
          >
            {uploading ? 'Uploading...' : 'Replace record'}
          </label>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`mt-1 items-center gap-1 text-sm font-bold text-sage hover:text-sage cursor-pointer ${canUpload ? 'flex' : 'hidden'}`}
        >
          <Plus size={14} /> {uploading ? 'Uploading…' : 'Upload'}
        </label>
      )}
      {canUpload && (
        <label
          htmlFor={cameraInputId}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sage hover:text-sage cursor-pointer"
        >
          <Paperclip size={12} /> Camera
        </label>
      )}
      {error && <p className="mt-1 text-[10px] text-[#8C3B2E]">{error}</p>}
    </div>
  );
};

const MedicineRequestPanel = ({ request, canRequest, onRequest }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [medicines, setMedicines] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const status = request?.status || 'not_requested';
  const hasRequest = status !== 'not_requested';

  const openModal = () => {
    setMedicines(request?.medicines || '');
    setNotes(request?.notes || '');
    setFiles([]);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!medicines.trim()) {
      setError('Medicine details are required');
      return;
    }
    if (!files.length) {
      setError('Prescription image or document is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onRequest({ medicines, notes, files });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send medicine request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-charcoal">
            <PackageCheck size={17} className="text-sage" /> Medicine & Courier Status
          </h2>
          <p className="mt-1 text-sm font-semibold text-sage">{request?.statusLabel || 'Not Requested'}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRequest && (
            <Button size="sm" variant={hasRequest ? 'outline' : 'primary'} onClick={openModal}>
              <Plus size={14} /> {hasRequest ? 'Update Request' : 'Request Medicine'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
            aria-label={collapsed ? 'Expand medicine and courier status' : 'Collapse medicine and courier status'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={18} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {collapsed ? null : hasRequest ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1.35fr]">
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Medicines</p>
            <p className="mt-1 whitespace-pre-line text-sm text-charcoal">{request.medicines || '-'}</p>
            {request.notes && <p className="mt-2 whitespace-pre-line text-xs text-charcoal/60">{request.notes}</p>}
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-3.5 text-sm text-charcoal/70">
            <p>Requested by <span className="font-semibold text-charcoal">{request.requestedByName || '-'}</span></p>
            <p className="mt-1">Requested: {request.requestedAt ? formatDateTime(request.requestedAt) : '-'}</p>
            {request.inProcessAt && <p className="mt-1">In process: {formatDateTime(request.inProcessAt)}</p>}
            {request.madeAt && <p className="mt-1">Medicine made: {formatDateTime(request.madeAt)}</p>}
            {request.sentToCourierAt && <p className="mt-1">Sent to courier: {formatDateTime(request.sentToCourierAt)}</p>}
            {(request.packagedByName || request.chitsWrittenByName || request.lastMedicineCheckedByName) && (
              <div className="mt-2 rounded-lg border border-cardline bg-offwhite-100 px-3 py-2 text-xs text-charcoal/65">
                <p>Packaging by: <span className="font-semibold text-charcoal">{request.packagedByName || '-'}</span></p>
                <p className="mt-1">Chits written by: <span className="font-semibold text-charcoal">{request.chitsWrittenByName || '-'}</span></p>
                <p className="mt-1">Last checking by: <span className="font-semibold text-charcoal">{request.lastMedicineCheckedByName || '-'}</span></p>
                <p className="mt-1">Filled by: <span className="font-semibold text-charcoal">{request.packagingDetailsFilledByName || '-'}</span></p>
              </div>
            )}
            <FileLinks files={request.prescriptionFiles} fallbackUrl={request.prescriptionUrl} fallbackName={request.prescriptionFileName || 'Prescription'} label="Prescriptions" />
            <FileLinks files={request.medicineImages} fallbackUrl={request.medicineImageUrl} fallbackName={request.medicineImageFileName || 'Medicine image'} label="Medicine Images" />
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-3.5 text-sm text-charcoal/70">
            <p className="font-semibold text-charcoal">{request.courier?.deliveryMode === 'self' ? 'Self Pickup' : 'Courier'}</p>
            <p className="mt-1">Status: {request.courier?.deliveryMode === 'self' ? 'Delivered' : (request.courier?.statusLabel || 'Courier Pending')}</p>
            {request.courier?.deliveryMode !== 'self' && <p className="mt-1">Via: {request.courier?.courierPartner || '-'}</p>}
            {request.courier?.deliveryMode !== 'self' && <p className="mt-1">Tracking: {request.courier?.trackingNumber || '-'}</p>}
            <p className="mt-1">Receiver: {request.courier?.receiverName || '-'} {request.courier?.receiverPhone ? `(${request.courier.receiverPhone})` : ''}</p>
            {request.courier?.deliveryMode !== 'self' && <p className="mt-1">Courier paid by: {request.courier?.paymentPaidBy === 'client' ? 'Client' : 'Clinic'} - {formatMoney(request.courier?.paymentAmount || 0)}</p>}
            {request.courier?.deliveryMode !== 'self' && <p className="mt-1">Dispatched: {request.courier?.dispatchedAt ? formatDateTime(request.courier.dispatchedAt) : '-'}</p>}
            <p className="mt-1">Delivered: {request.courier?.deliveredAt ? formatDateTime(request.courier.deliveredAt) : '-'}</p>
            <p className="mt-1">Received by: {request.courier?.receivedByName || request.courier?.receiverName || '-'}</p>
            <FileLinks files={request.courier?.packageImages} fallbackUrl={request.courier?.packageImageUrl} fallbackName={request.courier?.packageImageFileName || 'Package image'} label={request.courier?.deliveryMode === 'self' ? 'Images' : 'Package Images'} />
            <FileLinks files={request.courier?.deliveryProofImages} fallbackUrl={request.courier?.deliveryProofUrl} fallbackName={request.courier?.deliveryProofFileName || 'Delivery proof'} label={request.courier?.deliveryMode === 'self' ? 'Images' : 'Delivery Proofs'} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-charcoal/55">Medicine request has not been sent yet.</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Medicine">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Medicine Details</label>
            <textarea
              rows={4}
              value={medicines}
              onChange={(e) => setMedicines(e.target.value)}
              placeholder="Medicine names, quantity, dose..."
              className="w-full resize-none rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for medicine department"
              className="w-full resize-none rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Prescription Image / Document</label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-sage hover:text-sage">
              <Paperclip size={14} />
              <span className="truncate">Attach prescriptions</span>
              <input type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
            </label>
            <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-sage hover:text-sage">
              <Paperclip size={14} />
              Camera
              <input type="file" accept="image/*" capture="environment" onChange={(e) => appendSelectedFiles(setFiles, e.target.files)} className="hidden" />
            </label>
            <SelectedAttachments files={files} onRemove={(index) => removeSelectedFile(setFiles, index)} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Sending...' : 'Send Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};

// Card used for both Follow-ups and Family Sessions on a patient's details page —
// lists scheduled entries with a status dropdown, and a Modal to schedule a new one.
const ScheduleCard = ({
  icon: Icon,
  title,
  entries,
  onAdd,
  onUpdateStatus,
  canAdd = true,
  canUpdate = true,
  canEditEntries = false,
  formType = 'followup_full',
  patient,
  stageNumber,
}) => {
  const completionPaperRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpType, setFollowUpType] = useState('normal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const [doneEntryId, setDoneEntryId] = useState(null);
  const [doneEntry, setDoneEntry] = useState(null);
  const [doneName, setDoneName] = useState('');
  const [doneDetails, setDoneDetails] = useState('');
  const [trackerSubmissionUrl, setTrackerSubmissionUrl] = useState('');
  const [doneFiles, setDoneFiles] = useState([]);
  const [meetRecordingUrl, setMeetRecordingUrl] = useState('');
  const [doneForm, setDoneForm] = useState(() => createEmptyCompletionForm(formType));
  const [doneSaving, setDoneSaving] = useState(false);
  const [doneError, setDoneError] = useState('');
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleEntry, setRescheduleEntry] = useState(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editDateTime, setEditDateTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editFollowUpType, setEditFollowUpType] = useState('normal');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const openModal = () => {
    setDateTime('');
    setNotes('');
    setFollowUpType('normal');
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dateTime) {
      setError('Pick a date & time');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({ dateTime: dateTimeLocalToIso(dateTime), notes, followUpType: formType === 'followup_full' ? followUpType : undefined });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const openDoneModal = (entry) => {
    const defaultName = patient?.guardianName || patient?.relativeName || '';
    const filledOn = formatDateTime(new Date());
    const patientLine = [
      patient?.patientName,
      `ID: ${patient?.patientCode || `PT-${String(patient?.id || '').slice(-6).toUpperCase()}`}`,
      patient?.age ? `Age: ${patient.age}` : '',
      defaultName ? `Parent/Relative: ${defaultName}` : '',
      patient?.number ? `Father's Number: ${patient.number}` : '',
    ].filter(Boolean).join(' | ');
    const dateLine = [
      `Date: ${filledOn}`,
      `Phase: ${stageNumber || '-'}`,
    ].filter(Boolean).join(' | ');

    setDoneEntryId(entry.id);
    setDoneEntry({ ...entry, patientLine, dateLine });
    setDoneName('');
    setDoneDetails('');
    setTrackerSubmissionUrl('');
    setDoneFiles([]);
    setMeetRecordingUrl('');
    setDoneForm(createEmptyCompletionForm(formType));
    setDoneError('');
    setDoneModalOpen(true);
  };

  const handleDoneSubmit = async (e) => {
    e.preventDefault();
    const isShortFollowUp = doneEntry?.followUpType === 'sfs';
    const isTrackerFollowUp = doneEntry?.followUpType === 'tracker';
    if (!isShortFollowUp && !isTrackerFollowUp && !doneName.trim()) {
      setDoneError('Talked with person name is required');
      return;
    }
    if (isShortFollowUp && !doneDetails.trim()) {
      if (!doneFiles.length) {
        setDoneError('Add a note or upload a photo/file');
        return;
      }
    }
    if (isTrackerFollowUp && !trackerSubmissionUrl.trim()) {
      setDoneError('Tracker submission link is required');
      return;
    }
    setDoneSaving(true);
    setDoneError('');
    try {
      const completionDetails = isShortFollowUp
        ? doneDetails.trim()
        : isTrackerFollowUp
          ? 'Tracker submitted'
          : flattenCompletionSummary(doneForm);
      await onUpdateStatus(doneEntryId, 'completed', {
        completionName: isShortFollowUp ? 'SFS Call' : isTrackerFollowUp ? 'Tracker Submission' : doneName,
        completionDetails,
        files: doneFiles,
        ...(isTrackerFollowUp ? { trackerSubmissionUrl: trackerSubmissionUrl.trim() } : {}),
        ...(formType === 'family_section_a' ? { meetRecordingUrl } : {}),
        completionFormType: isShortFollowUp ? 'sfs' : isTrackerFollowUp ? 'tracker' : formType,
        completionFormData: (isShortFollowUp || isTrackerFollowUp)
          ? null
          : {
              meta: {
                patient: doneEntry?.patientLine || '',
                dateRecord: doneEntry?.dateLine || '',
                completedBy: doneName,
              },
              sections: doneForm,
            },
        completionHtml: (isShortFollowUp || isTrackerFollowUp) ? '' : getCompletionPdfHtml(completionPaperRef.current),
      });
      setDoneModalOpen(false);
    } catch (err) {
      setDoneError(err.response?.data?.message || 'Could not save');
    } finally {
      setDoneSaving(false);
    }
  };

  const handleCancelEntry = (entryId) => {
    onUpdateStatus(entryId, 'cancelled');
  };

  const handleTrackerSent = (entryId) => {
    onUpdateStatus(entryId, 'sent');
  };

  const openEditModal = (entry) => {
    setEditEntry(entry);
    setEditDateTime(toDateTimeLocalValue(entry.dateTime));
    setEditNotes(entry.notes || '');
    setEditFollowUpType(entry.followUpType || 'normal');
    setEditError('');
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editEntry?.id) {
      setEditError('Schedule entry not found');
      return;
    }
    if (!editDateTime) {
      setEditError('Pick a date & time');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await onUpdateStatus(editEntry.id, undefined, {
        dateTime: dateTimeLocalToIso(editDateTime),
        notes: editNotes,
        ...(formType === 'followup_full' ? { followUpType: editFollowUpType } : {}),
      });
      setEditModalOpen(false);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not update');
    } finally {
      setEditSaving(false);
    }
  };

  const openRescheduleModal = (entry) => {
    setRescheduleEntry(entry);
    setRescheduleDateTime(toDateTimeLocalValue(entry.dateTime));
    setRescheduleError('');
    setRescheduleModalOpen(true);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleDateTime) {
      setRescheduleError('Pick a new date & time');
      return;
    }
    if (!rescheduleEntry?.id) {
      setRescheduleError('Schedule entry not found');
      return;
    }
    setRescheduleSaving(true);
    setRescheduleError('');
    try {
      await onUpdateStatus(rescheduleEntry.id, rescheduleEntry.status || 'scheduled', {
        dateTime: dateTimeLocalToIso(rescheduleDateTime),
      });
      setRescheduleModalOpen(false);
    } catch (err) {
      setRescheduleError(err.response?.data?.message || 'Could not reschedule');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const sortedEntries = sortScheduleEntries(entries);

  return (
    <Card className="mt-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-bold text-charcoal flex items-center gap-2">
          <Icon size={17} className="text-sage" /> {title}
        </h2>
        <div className="flex items-center gap-2">
          {canAdd && !collapsed && (
            <Button size="sm" onClick={openModal}>
              <Plus size={14} /> Schedule
            </Button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={18} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {collapsed ? null : entries.length === 0 ? (
        <p className="text-sm text-charcoal/55">Nothing scheduled yet.</p>
      ) : (
        <ul className="space-y-2">
          {sortedEntries.map((e) => {
            const canAct = canUpdate && (e.displayStatus === 'upcoming' || e.displayStatus === 'late');
            const isTracker = formType === 'followup_full' && e.followUpType === 'tracker';
            const canMarkSentTrackerDone = canUpdate && isTracker && e.status === 'sent';
            return (
              <li key={e.id} className="rounded-lg border border-cardline bg-offwhite-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-charcoal">{formatDateTime(e.dateTime)}</p>
                    {formType === 'followup_full' && e.followUpType !== 'normal' && (
                      <span className="mt-1 inline-flex rounded-full bg-sage-muted/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage">
                        {e.followUpType === 'tracker' ? 'Tracker' : 'SFS'}
                      </span>
                    )}
                    {e.notes && <p className="mt-0.5 text-xs text-charcoal/60 truncate">{e.notes}</p>}
                    <p className="mt-0.5 text-[11px] text-charcoal/40">By {e.createdByName || 'Unknown'}</p>
                  </div>
                  <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5">
                    <Badge tone={DISPLAY_STATUS_BADGE_TONE[e.displayStatus]}>{e.displayStatusLabel}</Badge>
                    {canEditEntries && (
                      <Button size="sm" variant="outline" onClick={() => openEditModal(e)}>
                        <Pencil size={14} /> Edit
                      </Button>
                    )}
                    {(canAct || canMarkSentTrackerDone) && (
                      <>
                        {canAct && (
                          <Button size="sm" variant="outline" onClick={() => openRescheduleModal(e)}>
                            <CalendarClock size={14} /> Reschedule
                          </Button>
                        )}
                        {canAct && isTracker && (
                          <Button size="sm" variant="outline" onClick={() => handleTrackerSent(e.id)}>
                            Tracker Sent
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openDoneModal(e)}>
                          Mark Done
                        </Button>
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => handleCancelEntry(e.id)}
                            aria-label="Cancel"
                            className="p-1.5 rounded-md text-charcoal/40 hover:bg-sage-muted/20 hover:text-[#8C3B2E]"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {(e.displayStatus === 'done' || e.displayStatus === 'done_late') && e.completionName && (
                  <div className="mt-2.5 pt-2.5 border-t border-cardline-soft text-xs text-charcoal/70">
                    <p>
                      <span className="font-semibold text-charcoal">{e.completionName}</span> · {formatDateTime(e.completedAt)}
                    </p>
                    {e.completionPdfUrl && (
                      <a
                        href={`${SERVER_BASE}${e.completionPdfUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal"
                      >
                        <FileText size={13} /> PDF
                      </a>
                    )}
                    {e.meetRecordingUrl && (
                      <a
                        href={e.meetRecordingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-3 mt-1 inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal"
                      >
                        <Paperclip size={13} /> Meet Recording
                      </a>
                    )}
                    {e.trackerSubmissionUrl && (
                      <a
                        href={e.trackerSubmissionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-3 mt-1 inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal"
                      >
                        <Paperclip size={13} /> Tracker Link
                      </a>
                    )}
                    <CompactAttachments files={e.completionFiles || []} label="Uploads" />
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-charcoal/60">{e.completionDetails}</p>
                  </div>
                )}
                {isTracker && e.status === 'sent' && e.trackerSentAt && (
                  <div className="mt-2.5 pt-2.5 border-t border-cardline-soft text-xs text-charcoal/70">
                    <p>
                      <span className="font-semibold text-charcoal">Tracker sent</span> · {formatDateTime(e.trackerSentAt)}
                      {e.trackerSentByName ? ` by ${e.trackerSentByName}` : ''}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Schedule ${title.replace(/s$/, '')}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
          <div className="w-full">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          {formType === 'followup_full' && (
            <div className="w-full">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Follow-up Type</label>
              <select
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                <option value="normal">Normal follow-up</option>
                <option value="sfs">SFS short follow-up</option>
                <option value="tracker">Tracker</option>
              </select>
            </div>
          )}
          <div className="w-full">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Notes (optional)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Schedule'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={rescheduleModalOpen} onClose={() => setRescheduleModalOpen(false)} title={`Reschedule ${title.replace(/s$/, '')}`}>
        <form onSubmit={handleRescheduleSubmit} className="space-y-4">
          {rescheduleError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{rescheduleError}</div>}
          <div className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-3 text-sm text-charcoal/70">
            Current schedule: <span className="font-semibold text-charcoal">{rescheduleEntry?.dateTime ? formatDateTime(rescheduleEntry.dateTime) : '-'}</span>
          </div>
          <div className="w-full">
            <label className="block text-sm font-medium text-charcoal mb-1.5">New Date & Time</label>
            <input
              type="datetime-local"
              value={rescheduleDateTime}
              onChange={(e) => setRescheduleDateTime(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setRescheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={rescheduleSaving}>
              {rescheduleSaving ? 'Saving...' : 'Reschedule'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit ${title.replace(/s$/, '')}`}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{editError}</div>}
          <div className="w-full">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={editDateTime}
              onChange={(e) => setEditDateTime(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          {formType === 'followup_full' && (
            <div className="w-full">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Follow-up Type</label>
              <select
                value={editFollowUpType}
                onChange={(e) => setEditFollowUpType(e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                <option value="normal">Normal follow-up</option>
                <option value="sfs">SFS short follow-up</option>
                <option value="tracker">Tracker</option>
              </select>
            </div>
          )}
          <div className="w-full">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={doneModalOpen} onClose={() => setDoneModalOpen(false)} title={`Mark ${title.replace(/s$/, '')} Done`} className="max-w-5xl">
        <form onSubmit={handleDoneSubmit} className="space-y-4">
          {doneError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{doneError}</div>}
          {doneEntry?.followUpType === 'sfs' ? (
            <div className="w-full">
              <label className="block text-sm font-medium text-charcoal mb-1.5">SFS Note</label>
              <textarea
                rows={5}
                placeholder="Enter call note..."
                value={doneDetails}
                onChange={(e) => setDoneDetails(e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition resize-y"
              />
            </div>
          ) : doneEntry?.followUpType === 'tracker' ? (
            <Input
              id="trackerSubmissionUrl"
              label="Tracker Submission Link"
              placeholder="Paste parent tracker submission link"
              value={trackerSubmissionUrl}
              onChange={(e) => setTrackerSubmissionUrl(e.target.value)}
            />
          ) : (
            <>
              <Input
                id="doneName"
                label="Talked with which person"
                placeholder="Enter the person you talked with"
                value={doneName}
                onChange={(e) => setDoneName(e.target.value)}
              />
              <div ref={completionPaperRef}>
                <PaperCompletionForm
                  formType={formType}
                  formData={doneForm}
                  onChange={setDoneForm}
                  patientMeta={{
                    patientLine: doneEntry?.patientLine || '',
                    dateLine: doneEntry?.dateLine || '',
                  }}
                />
              </div>
              {formType === 'family_section_a' && (
                <Input
                  id="meetRecordingUrl"
                  label="Google Meet Recording Link"
                  placeholder="Paste Google Drive recording link"
                  value={meetRecordingUrl}
                  onChange={(e) => setMeetRecordingUrl(e.target.value)}
                />
              )}
            </>
          )}
          {!doneEntry || doneEntry?.followUpType !== 'tracker' ? (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Photo / File</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-sage hover:text-sage">
                <Paperclip size={14} />
                Attach files
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  multiple
                  onChange={(e) => appendSelectedFiles(setDoneFiles, e.target.files)}
                  className="hidden"
                />
              </label>
              <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-sage hover:text-sage">
                <Paperclip size={14} />
                Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => appendSelectedFiles(setDoneFiles, e.target.files)}
                  className="hidden"
                />
              </label>
              <SelectedAttachments files={doneFiles} onRemove={(index) => removeSelectedFile(setDoneFiles, index)} />
            </div>
          ) : null}
          <div className="hidden">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Details</label>
            <textarea
              rows={4}
              placeholder="What happened in this session…"
              value={doneDetails}
              onChange={(e) => setDoneDetails(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDoneModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={doneSaving}>
              {doneSaving ? 'Saving…' : 'Mark Done'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};

const ActivityTimeline = ({ entries = [], callLogs = [] }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openCallId, setOpenCallId] = useState(null);
  const timelineEntries = mergeTimelineEntries(entries, callLogs);

  return (
    <Card className="mt-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-bold text-charcoal flex items-center gap-2">
          <History size={17} className="text-sage" /> Patient Timeline
        </h2>
        <div className="flex items-center gap-2">
          <Badge tone="teal">{timelineEntries.length}</Badge>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
            aria-label={collapsed ? 'Expand patient timeline' : 'Collapse patient timeline'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={18} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {collapsed ? null : timelineEntries.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <Inbox size={22} className="text-charcoal/35" />
          <p className="text-sm text-charcoal font-medium">No timeline yet</p>
          <p className="text-xs text-charcoal/55">Actions on this patient will appear here automatically.</p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
          {timelineEntries.map((item) => {
            if (item.kind === 'call') {
              const call = item.call;
              const source = recordingSource(call);
              const expanded = openCallId === call.id;
              const CallIcon = isIncomingCall(call.callType) ? PhoneIncoming : PhoneOutgoing;

              return (
                <li key={item.id} className="border-b border-cardline-soft last:border-0 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CallIcon size={15} className={isIncomingCall(call.callType) ? 'text-sage' : 'text-[#9C6B2E]'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-charcoal/60">
                        <span className="font-bold text-charcoal">{formatDuration(call.durationSeconds, call.durationText)}</span>
                        <span>{call.callType}</span>
                        <time className="text-charcoal/45">{formatCompactDateTime(call.actionCreationTime || call.createdAt)}</time>
                        {call.callAction && <span className="max-w-full truncate italic text-charcoal/55">{call.callAction}</span>}
                      </div>
                    </div>
                    {source ? (
                      <button
                        type="button"
                        onClick={() => setOpenCallId(expanded ? null : call.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-offwhite-300 text-charcoal hover:bg-sage-muted/30"
                        aria-label={expanded ? 'Hide recording player' : 'Play recording'}
                        title={expanded ? 'Hide recording' : 'Play recording'}
                      >
                        <Play size={13} fill="currentColor" />
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] font-semibold text-charcoal/35">Recording pending</span>
                    )}
                  </div>
                  {expanded && source && (
                    <div className="mt-2 rounded-full bg-offwhite-300 px-2 py-1">
                      <audio controls src={source} className="h-8 w-full" />
                    </div>
                  )}
                </li>
              );
            }

            const entry = item.entry;
            return (
              <li key={item.id} className="border-b border-cardline-soft last:border-0 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <History size={14} className="mt-0.5 shrink-0 text-sage" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="truncate text-xs font-bold text-charcoal">{entry.action}</p>
                      <time className="shrink-0 text-[11px] font-medium text-charcoal/45">
                        {formatCompactDateTime(entry.createdAt)}
                      </time>
                    </div>
                    {entry.details && <p className="mt-0.5 line-clamp-1 text-[11px] text-charcoal/60">{entry.details}</p>}
                    <p className="mt-0.5 text-[10px] text-charcoal/40">
                      By {entry.actorName || 'System'} | {formatRole(entry.actorRole)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};

const AdvicePanel = ({ rows = [], canRequest, onRequest, onEditRequest, stageNumber }) => {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editQuery, setEditQuery] = useState('');
  const [editUrgent, setEditUrgent] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const openModal = () => {
    setQuery('');
    setIsUrgent(false);
    setError('');
    setModalOpen(true);
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('Query is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onRequest({ query: query.trim(), isUrgent });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send advice request.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (row) => {
    setEditTarget(row);
    setEditQuery(row.query || '');
    setEditUrgent(Boolean(row.isUrgent));
    setEditError('');
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editQuery.trim()) {
      setEditError('Query is required');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await onEditRequest(editTarget.id, { query: editQuery.trim(), isUrgent: editUrgent });
      setEditTarget(null);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not edit advice request.');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Card className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-charcoal">
            <MessageSquareText size={17} className="text-sage" /> Doctor Advice {stageNumber ? `| Phase ${stageNumber}` : ''}
          </h2>
          <p className="mt-1 text-sm text-charcoal/55">Patient-related advice requests and doctor replies.</p>
        </div>
        <div className="flex items-center gap-2">
          {canRequest && (
            <Button size="sm" onClick={openModal}>
              <MessageSquarePlus size={14} /> Request Advice
            </Button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/20"
            aria-label={collapsed ? 'Expand doctor advice' : 'Collapse doctor advice'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={18} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-cardline bg-offwhite-200 py-8 text-center">
              <Inbox size={22} className="text-charcoal/35" />
              <p className="text-sm font-semibold text-charcoal">No advice requests yet</p>
              <p className="text-xs text-charcoal/55">Requests and doctor replies will appear here.</p>
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className={`rounded-lg border p-3.5 ${row.isUrgent && row.status === 'requested' ? 'border-[#B42318] bg-[#B42318]/8' : 'border-cardline bg-offwhite-200'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-charcoal">Phase {row.stage || '-'}</p>
                      {row.isUrgent && <Badge tone="danger">Emergency</Badge>}
                      <Badge tone={row.status === 'advice_given' ? 'teal' : 'amber'}>
                        {row.status === 'advice_given' ? 'Advice Given' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-charcoal/50">
                      Requested by {row.requestedByName || 'Unknown'} on {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-charcoal/55">
                    {row.status === 'advice_given' ? <CheckCircle2 size={14} className="text-sage" /> : <Clock size={14} className="text-[#9C6B2E]" />}
                    {row.status === 'advice_given' ? formatDateTime(row.adviceGivenAt) : 'Waiting'}
                    {row.status === 'requested' && (user?.role === ROLES.ADMIN || String(row.requestedBy || '') === String(user?.id || user?._id || '')) && (
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(row)} className="ml-1">
                        <Pencil size={13} /> Edit
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Query</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-charcoal">{row.query}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/55">Doctor Advice</p>
                    {row.advice ? (
                      <>
                        <p className="mt-1 whitespace-pre-line text-sm text-charcoal">{row.advice}</p>
                        <p className="mt-1 text-xs text-charcoal/50">By {row.adviceGivenByName || 'Doctor'}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-charcoal/45">No advice yet.</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Doctor Advice">
        <form onSubmit={submitRequest} className="space-y-4">
          {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Query</label>
            <div className="relative">
              <textarea
                rows={6}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Write the query for the doctor..."
                className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 pr-12 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
              />
              <DictationButton value={query} onChange={setQuery} className="absolute bottom-2 right-2" />
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-[#B42318]/25 bg-[#B42318]/5 px-3.5 py-3 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#B42318]"
            />
            <span>
              <span className="block font-semibold text-[#B42318]">Mark as emergency</span>
              <span className="text-xs text-charcoal/60">Doctor sidebar and dashboard will show a red alert until advice is given.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Sending...' : (
                <>
                  <Send size={14} /> Send Request
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Advice Request">
        <form onSubmit={submitEdit} className="space-y-4">
          {editError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{editError}</div>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Query</label>
            <div className="relative">
              <textarea
                rows={6}
                value={editQuery}
                onChange={(e) => setEditQuery(e.target.value)}
                placeholder="Write the query for the doctor..."
                className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 pr-12 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
              />
              <DictationButton value={editQuery} onChange={setEditQuery} className="absolute bottom-2 right-2" />
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-[#B42318]/25 bg-[#B42318]/5 px-3.5 py-3 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={editUrgent}
              onChange={(e) => setEditUrgent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#B42318]"
            />
            <span>
              <span className="block font-semibold text-[#B42318]">Mark as emergency</span>
              <span className="text-xs text-charcoal/60">Doctor sidebar and dashboard will show a red alert until advice is given.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};

const PatientDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const canAssignDoctor = ASSIGN_DOCTOR_ROLES.includes(user?.role);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [callLogs, setCallLogs] = useState([]);
  const [adviceRows, setAdviceRows] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [psychologistOptions, setPsychologistOptions] = useState([]);
  const [postCounselorOptions, setPostCounselorOptions] = useState([]);

  // Which stage's tab is currently open (independent of the patient's actual "current stage")
  const [activeStageTab, setActiveStageTab] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Which stage's small Status/Date popover is open (null = none)
  const [openInfoStage, setOpenInfoStage] = useState(null);
  const [stageForm, setStageForm] = useState({ number: null, status: 'not_started', date: '' });
  const [stageSaving, setStageSaving] = useState(false);
  const [stageFormError, setStageFormError] = useState('');
  const [approveSaving, setApproveSaving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approvingPaymentId, setApprovingPaymentId] = useState(null);
  const [paymentApproveError, setPaymentApproveError] = useState('');

  const loadPatientData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setLoadError('');
      }
      try {
        const [patientRes, callsRes, adviceRes] = await Promise.all([
          api.get(`/patients/${id}`),
          api.get(`/patients/${id}/calls`),
          api.get(`/advice/patients/${id}`),
        ]);
        setPatient(patientRes.data.patient);
        setCallLogs(callsRes.data.callLogs || []);
        setAdviceRows(adviceRes.data.rows || []);
        if (!silent) setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err.response?.data?.message || 'Could not load this patient.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        loadPatientData({ silent: true });
      }
    };
    const intervalId = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadPatientData]);

  // Only roles that can assign a doctor need the dropdown options
  useEffect(() => {
    if (!canAssignDoctor) return;
    const fetchAssignableStaff = async () => {
      try {
        const [doctorRes, psychologistRes] = await Promise.all([
          api.get('/users/assistant-doctors'),
          api.get('/users/psychologists'),
        ]);
        setDoctorOptions(doctorRes.data.doctors);
        setPsychologistOptions(psychologistRes.data.psychologists);
      } catch (err) {
        // Non-critical — the field just won't have options if this fails
      }
    };
    fetchAssignableStaff();
  }, [canAssignDoctor]);

  useEffect(() => {
    if (user?.role !== ROLES.ADMIN) return;
    const fetchPostCounselors = async () => {
      try {
        const { data } = await api.get('/users/post-counselors');
        setPostCounselorOptions(data.postCounselors || []);
      } catch {
        setPostCounselorOptions([]);
      }
    };
    fetchPostCounselors();
  }, [user?.role]);

  // Default the open tab to the patient's current stage, once, after the patient loads
  useEffect(() => {
    if (patient && activeStageTab === null) {
      setActiveStageTab(patient.currentStage);
    }
  }, [patient, activeStageTab]);

  const isAutism = patient?.category === PATIENT_CATEGORIES.AUTISM_ADHD;
  const guardianKey = isAutism ? 'guardianName' : 'relativeName';
  const isPsychologist = user?.role === ROLES.PSYCHOLOGIST;
  const isAccountant = user?.role === ROLES.ACCOUNTANT;
  const isAdmin = user?.role === ROLES.ADMIN;
  const canEditStageDetails = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR].includes(user?.role);
  const canRequestMedicine = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR].includes(user?.role);
  const showFollowUps = user?.role !== ROLES.PSYCHOLOGIST;
  const canUpdateFamilySessions = user?.role !== ROLES.ASSISTANT_DOCTOR;
  const canEditPatientDetails = !isPsychologist && !isAccountant;
  const canEditPostCounselor = isAdmin;

  // Every field goes through the same PATCH endpoint; the response is the fresh patient record.
  const saveField = async (fieldKey, rawValue) => {
    const numericFields = ['currentStage'];
    const payload = { [fieldKey]: numericFields.includes(fieldKey) ? Number(rawValue) : rawValue };
    const { data } = await api.patch(`/patients/${id}`, payload);
    setPatient(data.patient);
  };

  // Package Name / Total Amount save individually and immediately, same as the fields above.
  const saveStageField = async (fieldKey, rawValue) => {
    const numberFields = ['totalAmount', 'medicineMonthsGiven'];
    const booleanFields = ['medicineFullyGiven', 'medicineConnectDone'];
    const dateFields = ['medicineNextConnectDate', 'medicineTakenDate', 'medicineExplainDate'];
    const payload = {
      [fieldKey]: numberFields.includes(fieldKey)
        ? Number(rawValue) || 0
        : booleanFields.includes(fieldKey)
          ? rawValue === true || rawValue === 'true'
          : dateFields.includes(fieldKey)
            ? rawValue || null
            : rawValue,
    };
    const { data } = await api.patch(`/patients/${id}/stages/${activeStageTab}`, payload);
    setPatient(data.patient);
  };

  const openStageInfo = (s) => {
    if (openInfoStage === s.number) {
      setOpenInfoStage(null);
      return;
    }
    setStageForm({
      number: s.number,
      status: s.status,
      date: s.date ? s.date.slice(0, 10) : '',
    });
    setStageFormError('');
    setOpenInfoStage(s.number);
  };

  const saveStageInfo = async () => {
    setStageSaving(true);
    setStageFormError('');
    try {
      const { data } = await api.patch(`/patients/${id}/stages/${stageForm.number}`, {
        status: stageForm.status,
        date: stageForm.date || null,
      });
      setPatient(data.patient);
      setOpenInfoStage(null);
    } catch (err) {
      setStageFormError(err.response?.data?.message || 'Could not save phase');
    } finally {
      setStageSaving(false);
    }
  };

  const handleAddPayment = async (payload) => {
    const formData = new FormData();
    formData.append('amount', payload.amount);
    formData.append('date', payload.date);
    formData.append('paymentMode', payload.paymentMode);
    if (payload.paymentMode === PAYMENT_MODES.ONLINE) {
      formData.append('utr', payload.utr || '');
      formData.append('transactionId', payload.transactionId || '');
    } else {
      formData.append('receivedBy', payload.receivedBy || '');
    }
    (payload.files || []).forEach((file) => formData.append('screenshot', file));
    const { data } = await api.post(`/patients/${id}/stages/${activeStageTab}/payments`, formData);
    setPatient(data.patient);
  };

  const handleUpdatePayment = async (paymentId, payload) => {
    const formData = new FormData();
    formData.append('amount', payload.amount);
    formData.append('date', payload.date);
    formData.append('paymentMode', payload.paymentMode);
    if (payload.paymentMode === PAYMENT_MODES.ONLINE) {
      formData.append('utr', payload.utr || '');
      formData.append('transactionId', payload.transactionId || '');
    } else {
      formData.append('receivedBy', payload.receivedBy || '');
    }
    (payload.files || []).forEach((file) => formData.append('screenshot', file));
    const { data } = await api.patch(`/patients/${id}/stages/${activeStageTab}/payments/${paymentId}`, formData);
    setPatient(data.patient);
  };

  const handleApprovePayment = async (stageNumber, paymentId) => {
    setApprovingPaymentId(paymentId);
    setPaymentApproveError('');
    try {
      const { data } = await api.patch(`/patients/${id}/stages/${stageNumber}/payments/${paymentId}/approve`);
      setPatient(data.patient);
    } catch (err) {
      setPaymentApproveError(err.response?.data?.message || 'Could not approve payment');
    } finally {
      setApprovingPaymentId(null);
    }
  };

  const handleUploadRecord = async (file) => {
    const formData = new FormData();
    formData.append('record', file);
    const { data } = await api.post(`/patients/${id}/stages/${activeStageTab}/record`, formData);
    setPatient(data.patient);
  };

  const handleRequestMedicine = async ({ medicines, notes, files = [] }) => {
    const formData = new FormData();
    formData.append('medicines', medicines);
    formData.append('notes', notes || '');
    files.forEach((file) => formData.append('prescription', file));
    const { data } = await api.post(`/patients/${id}/stages/${activeStageTab}/medicine-request`, formData);
    setPatient(data.patient);
  };

  const patchScheduleEntry = async (url, payload) => {
    const files = payload.files || [];
    if (!files.length) {
      const { files: _files, ...jsonPayload } = payload;
      return api.patch(url, jsonPayload);
    }

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'files' || value === undefined) return;
      formData.append(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    });
    files.forEach((file) => formData.append('completionFiles', file));
    return api.patch(url, formData);
  };

   const handleAddFollowUp = async ({ dateTime, notes, followUpType }) => {
    const { data } = await api.post(`/patients/${id}/stages/${activeStageTab}/followups`, { dateTime, notes, followUpType });
    setPatient(data.patient);
  };

  const handleUpdateFollowUpStatus = async (entryId, status, extra = {}) => {
    const { data } = await patchScheduleEntry(`/patients/${id}/stages/${activeStageTab}/followups/${entryId}`, { status, ...extra });
    setPatient(data.patient);
  };

  const handleAddFamilySession = async ({ dateTime, notes }) => {
    const { data } = await api.post(`/patients/${id}/stages/${activeStageTab}/family-sessions`, { dateTime, notes });
    setPatient(data.patient);
  };

  const handleUpdateFamilySessionStatus = async (entryId, status, extra = {}) => {
    const { data } = await patchScheduleEntry(`/patients/${id}/stages/${activeStageTab}/family-sessions/${entryId}`, { status, ...extra });
    setPatient(data.patient);
  };

  const handleRequestAdvice = async ({ query, isUrgent }) => {
    if (!activeStageTab) return;
    await api.post(`/advice/patients/${id}`, { query, isUrgent, stage: activeStageTab });
    await loadPatientData({ silent: true });
  };

  const handleEditAdviceRequest = async (requestId, payload) => {
    await api.patch(`/advice/${requestId}/request`, payload);
    await loadPatientData({ silent: true });
  };

  const handleApprovePatient = async () => {
    setApproveSaving(true);
    setApproveError('');
    try {
      const { data } = await api.patch(`/patients/${id}/approve`);
      setPatient(data.patient);
    } catch (err) {
      setApproveError(err.response?.data?.message || 'Could not approve patient');
    } finally {
      setApproveSaving(false);
    }
  };

  // Live view of the open tab's stage (reflects payments as they're added)
  const activeStage = patient?.stages?.find((s) => s.number === activeStageTab);
  const activeMedicineConnectDue = activeStage
    && !activeStage.medicineConnectDone
    && isDateTodayOrPast(activeStage.medicineNextConnectDate);
  const activeStageAdviceRows = adviceRows.filter((row) => Number(row.stage) === Number(activeStageTab));
  const canRequestAdvice = [ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user?.role);
  const postCounselorSelectOptions = [
    { value: '', label: 'Not selected' },
    ...(activeStage?.postCounselor?.id && !postCounselorOptions.some((counselor) => String(counselor.id) === String(activeStage.postCounselor.id))
      ? [{ value: activeStage.postCounselor.id, label: activeStage.postCounselor.name }]
      : []),
    ...postCounselorOptions.map((counselor) => ({ value: counselor.id, label: counselor.name })),
  ];

  return (
    <div>
      <Link
        to="/admin/patients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal mb-5"
      >
        <ArrowLeft size={15} /> All Patients
      </Link>

      {loading ? (
        <Card className="text-center text-sm text-charcoal/55 py-10">Loading patient…</Card>
      ) : loadError ? (
        <Card className="flex flex-col items-center text-center gap-2 py-10">
          <AlertTriangle size={22} className="text-[#8C3B2E]" />
          <p className="text-sm text-charcoal font-medium">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-1">
            Try again
          </Button>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <span className="font-mono text-xs tracking-widest text-charcoal/40 font-semibold">
                {patient.patientCode || `PT-${String(patient.id).slice(-6).toUpperCase()}`}
              </span>
              <Badge tone={isAutism ? 'teal' : 'amber'}>{patient.categoryLabel}</Badge>
            </div>

            <h1 className="font-serif text-3xl font-semibold text-charcoal mt-3">{patient.patientName}</h1>
            <p className="mt-1.5 text-sm text-charcoal/60">
              {patient.categoryLabel} · Added {formatDate(patient.createdAt)}
            </p>
            {patient.approvalStatus === 'approved' && patient.approvedByName && (
              <p className="mt-0.5 text-xs text-charcoal/40">
                Approved by {patient.approvedByName}{patient.approvedAt ? ` on ${formatDate(patient.approvedAt)}` : ''}
              </p>
            )}
          </div>

          {patient.approvalStatus === 'pending' && (
            <div className="mx-6 mb-2 flex flex-col gap-3 rounded-lg border border-[#9C6B2E]/35 bg-[#9C6B2E]/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Clock size={18} className="mt-0.5 shrink-0 text-[#9C6B2E]" />
                <div>
                  <p className="text-sm font-bold text-[#9C6B2E]">Pending accounts approval</p>
                  <p className="mt-0.5 text-xs text-charcoal/60">
                    This patient was just added and stays hidden from the assigned Assistant Doctor / Psychologist until approved. Check the package and payments below, then approve.
                  </p>
                  {approveError && <p className="mt-1 text-xs font-semibold text-[#8C3B2E]">{approveError}</p>}
                </div>
              </div>
              {patient.canApprove && (
                <Button size="sm" onClick={handleApprovePatient} disabled={approveSaving} className="shrink-0">
                  <Check size={14} /> {approveSaving ? 'Approving...' : 'Approve Patient'}
                </Button>
              )}
            </div>
          )}

                    {/* Equal-width editable boxes spanning the full card, regardless of which values are filled in */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-px bg-cardline border-t border-cardline">
            <EditableField
              label="Patient ID"
              value={patient.patientCode || ''}
              placeholder="Not added"
              onSave={(val) => saveField('patientCode', val)}
              readOnly={!isAdmin}
            />
            <EditableField
              label="Patient Name"
              value={patient.patientName || ''}
              placeholder="Not added"
              onSave={(val) => saveField('patientName', val)}
              readOnly={!isAdmin}
            />
            <EditableField
              label="Age"
              value={patient.age ?? ''}
              onSave={(val) => saveField('age', val)}
              readOnly={!canEditPatientDetails}
            />
            <EditableField
              label="Father's Number"
              value={patient.number}
              placeholder="Not added"
              onSave={(val) => saveField('number', val)}
              readOnly={!canEditPatientDetails}
            />
            <EditableField
              label={isAutism ? 'Father / Mother Name' : 'Relative Name'}
              value={patient[guardianKey]}
              placeholder="Not added"
              onSave={(val) => saveField(guardianKey, val)}
              readOnly={!canEditPatientDetails}
            />
            <EditableField
              label="Mother's Number"
              value={patient.alternateNumber}
              placeholder="Not added"
              onSave={(val) => saveField('alternateNumber', val)}
              readOnly={!canEditPatientDetails}
            />
            <EditableField
              label="Current Phase"
              type="select"
              options={STAGE_OPTIONS}
              value={patient.currentStage}
              onSave={(val) => saveField('currentStage', val)}
              readOnly={!canEditPatientDetails}
            />
            {canAssignDoctor ? (
              <EditableField
                label="Assigned Assistant Doctor"
                type="select"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...doctorOptions.map((d) => ({ value: d.id, label: d.name })),
                ]}
                value={patient.assignedDoctor?.id || ''}
                onSave={(val) => saveField('assignedDoctor', val || null)}
              />
            ) : (
              <div className="bg-offwhite-100 p-4">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Assigned Doctor</p>
                <p className="mt-1 text-sm font-bold text-charcoal">{patient.assignedDoctor?.name || 'Not assigned'}</p>
              </div>
            )}
            {canAssignDoctor ? (
              <EditableField
                label="Assigned Psychologist"
                type="select"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...psychologistOptions.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={patient.assignedPsychologist?.id || ''}
                onSave={(val) => saveField('assignedPsychologist', val || null)}
              />
            ) : (
              <div className="bg-offwhite-100 p-4">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Assigned Psychologist</p>
                <p className="mt-1 text-sm font-bold text-charcoal">{patient.assignedPsychologist?.name || 'Not assigned'}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {!loading && !loadError && patient && (
        <Card className="mt-5" padded={false}>
          <div className="p-6 pb-0 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-charcoal">Treatment Phase</h2>
              <p className="mt-0.5 text-xs text-charcoal/55">Select a phase to view or edit its details.</p>
            </div>
            <Badge tone="teal">Current: {STAGE_LABELS[patient.currentStage]}</Badge>

          </div>

          {/* Phase tabs */}
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {patient.stages.map((s) => {
              const isCurrent = patient.currentStage === s.number;
              const isActiveTab = activeStageTab === s.number;
              const infoOpen = openInfoStage === s.number;
              return (
                <div
                  key={s.number}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveStageTab(s.number);
                    setOpenInfoStage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveStageTab(s.number);
                      setOpenInfoStage(null);
                    }
                  }}
                  className={`relative min-h-[104px] rounded-lg border p-3 pb-6 text-left cursor-pointer transition ${statusStyles[s.status]} ${isActiveTab ? 'ring-2 ring-sage ring-offset-1 ring-offset-cream' : 'hover:brightness-95'
                    }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] uppercase tracking-wide font-semibold opacity-70">Phase {s.number}</p>
                    {isCurrent && <Check size={12} className="shrink-0 opacity-80" />}
                  </div>
                  <p className="mt-1 text-xs font-bold">{s.statusLabel}</p>
                  {s.totalAmount > 0 && (
                    <p className="mt-1 text-[10px] font-semibold opacity-80">
                      {formatMoney(s.amountPaid)} / {formatMoney(s.totalAmount)}
                    </p>
                  )}
                  {s.date && <p className="mt-1 text-[10px] opacity-70">{formatDate(s.date)}</p>}
                  <p className="mt-1 truncate text-[10px] font-semibold opacity-75">
                    PC: {s.postCounselor?.name || 'Not set'}
                  </p>

                  {/* Toggle — always fixed in the bottom-right corner, regardless of card content */}
                  {canEditStageDetails && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openStageInfo(s);
                      }}
                      aria-label={`Toggle phase info for Phase ${s.number}`}
                      className="absolute bottom-1.5 right-1.5 rounded p-0.5 hover:bg-sage-muted/20"
                    >
                      <ChevronDown size={13} className={`opacity-60 transition-transform ${infoOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}

                  {/* Small floating popover — doesn't push the page layout */}
                  {canEditStageDetails && infoOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 right-0 top-full mt-2 z-20 rounded-lg border border-cardline bg-offwhite-100 shadow-card p-3 space-y-2.5"
                    >
                      <div>
                        <label className="block text-[10px] uppercase tracking-wide font-semibold text-charcoal/55 mb-1">
                          Status
                        </label>
                        <select
                          value={stageForm.status}
                          onChange={(e) => setStageForm({ ...stageForm, status: e.target.value })}
                          className="w-full rounded-md border border-cardline bg-offwhite-200 px-2 py-1.5 text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/20"
                        >
                          {STAGE_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wide font-semibold text-charcoal/55 mb-1">
                          Date
                        </label>
                        <input
                          type="date"
                          value={stageForm.date}
                          onChange={(e) => setStageForm({ ...stageForm, date: e.target.value })}
                          className="w-full rounded-md border border-cardline bg-offwhite-200 px-2 py-1.5 text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/20"
                        />
                      </div>
                      {stageFormError && <p className="text-[10px] text-[#8C3B2E]">{stageFormError}</p>}
                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setOpenInfoStage(null)}
                          disabled={stageSaving}
                          className="text-[11px] text-charcoal/55 hover:text-charcoal px-1.5 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveStageInfo}
                          disabled={stageSaving}
                          className="text-[11px] font-semibold text-offwhite-100 bg-sage hover:bg-[#56695D] rounded-md px-2.5 py-1 disabled:opacity-60"
                        >
                          {stageSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tab content — details for the selected phase, shown inline below the tabs */}
          {activeStage && (
            <div className="px-6 pb-6">
              {/* Package card — compact, same small-field style as Age/Phone/etc above */}
              <div className="rounded-lg border border-cardline bg-offwhite-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
                  <h3 className="text-sm font-bold text-charcoal">Package - Phase {activeStage.number}</h3>
                  <button
                    type="button"
                    onClick={() => setTimelineOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sage hover:text-sage"
                  >
                    <History size={13} /> Timeline
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-px bg-cardline border-t border-cardline">
                  <EditableField
                    label="Package Name"
                    value={activeStage.packageName}
                    placeholder="Not added"
                    onSave={(val) => saveStageField('packageName', val)}
                    readOnly={!canEditStageDetails}
                  />
                  <EditableField
                    label="Post Counselor"
                    type="select"
                    options={postCounselorSelectOptions}
                    value={activeStage.postCounselor?.id || ''}
                    onSave={(val) => saveStageField('postCounselor', val || null)}
                    readOnly={!canEditPostCounselor}
                  />
                  <EditableField
                    label="Total Amount"
                    type="number"
                    value={activeStage.totalAmount || ''}
                    placeholder="0"
                    onSave={(val) => saveStageField('totalAmount', val)}
                    readOnly={!canEditStageDetails}
                  />
                  <div className="bg-offwhite-100 p-4">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Amount Paid</p>
                    <p className="mt-1 text-sm font-bold text-charcoal">{formatMoney(activeStage.amountPaid)}</p>
                    {activeStage.payments.some((pay) => pay.approvalStatus === 'pending') && (
                      <p className="mt-1 text-[11px] font-semibold text-[#9C6B2E]">
                        {activeStage.payments.filter((pay) => pay.approvalStatus === 'pending').length} payment(s) pending accounts approval
                      </p>
                    )}
                    {activeStage.totalAmount > 0 && (
                      <div className="mt-1.5 h-1 rounded-full bg-cardline overflow-hidden">
                        <div
                          className="h-full bg-sage transition-all"
                          style={{
                            width: `${Math.min((activeStage.amountPaid / activeStage.totalAmount) * 100, 100)}%`,
                          }}

                        />
                      </div>
                    )}
                  </div>
                  <div className="bg-offwhite-100 p-4">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Amount Left</p>
                    <p className="mt-1 text-sm font-bold text-charcoal">{formatMoney(activeStage.remainingAmount)}</p>
                  </div>
                  {canEditStageDetails ? (
                    <AddPaymentField onAdd={handleAddPayment} />
                  ) : (
                    <div className="bg-offwhite-100 p-4">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">Add Payment</p>
                      <p className="mt-1 text-sm font-bold italic text-charcoal/35">Read only</p>
                    </div>
                  )}
                  <RecordFileField
                    fileUrl={activeStage.recordFileUrl}
                    fileName={activeStage.recordFileName}
                    onUpload={handleUploadRecord}
                    canUpload={canEditStageDetails}
                  />
                </div>
              </div>

              <div
                className={`mt-4 rounded-lg border overflow-hidden ${
                  activeMedicineConnectDue
                    ? 'border-[#B42318]/35 bg-[#B42318]/5'
                    : 'border-cardline bg-offwhite-100'
                }`}
              >
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-charcoal">Medicine Supply - Phase {activeStage.number}</h3>
                    <p className={`mt-0.5 text-xs ${activeMedicineConnectDue ? 'font-semibold text-[#B42318]' : 'text-charcoal/50'}`}>
                      {activeMedicineConnectDue
                        ? 'Medicine connect is due. Mark connected to clear the reminder.'
                        : 'Track partial medicine, next connect date, and full supply status.'}
                    </p>
                  </div>
                  <PackageCheck size={18} className={activeMedicineConnectDue ? 'text-[#B42318]' : 'text-sage'} />
                </div>
                <div
                  className={`grid grid-cols-2 sm:grid-cols-6 gap-px border-t ${
                    activeMedicineConnectDue ? 'border-[#B42318]/25 bg-[#B42318]/20' : 'border-cardline bg-cardline'
                  }`}
                >
                  <EditableField
                    label="Medicine Months Given"
                    type="number"
                    value={activeStage.medicineMonthsGiven || ''}
                    placeholder="0"
                    onSave={(val) => saveStageField('medicineMonthsGiven', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <EditableField
                    label="Medicine Explained Date"
                    type="date"
                    value={toDateInputValue(activeStage.medicineExplainDate)}
                    placeholder="Not added"
                    onSave={(val) => saveStageField('medicineExplainDate', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <EditableField
                    label="Next Connect Date"
                    type="date"
                    value={toDateInputValue(activeStage.medicineNextConnectDate)}
                    placeholder="Not added"
                    onSave={(val) => saveStageField('medicineNextConnectDate', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <EditableField
                    label="Full Medicine Taken Date"
                    type="date"
                    value={toDateInputValue(activeStage.medicineTakenDate)}
                    placeholder="Not added"
                    onSave={(val) => saveStageField('medicineTakenDate', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <EditableField
                    label="Full Medicine Given"
                    type="select"
                    options={YES_NO_OPTIONS}
                    value={String(Boolean(activeStage.medicineFullyGiven))}
                    onSave={(val) => saveStageField('medicineFullyGiven', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <EditableField
                    label="Connected"
                    type="select"
                    options={YES_NO_OPTIONS}
                    value={String(Boolean(activeStage.medicineConnectDone))}
                    onSave={(val) => saveStageField('medicineConnectDone', val)}
                    readOnly={!canEditStageDetails}
                    tone={activeMedicineConnectDue ? 'danger' : 'default'}
                  />
                  <div className="sm:col-span-3">
                    <EditableField
                      label="Medicine Supply Note"
                      type="textarea"
                      value={activeStage.medicineSupplyNote || ''}
                      placeholder="Write medicine given/not given details"
                      onSave={(val) => saveStageField('medicineSupplyNote', val)}
                      readOnly={!canEditStageDetails}
                      tone={activeMedicineConnectDue ? 'danger' : 'default'}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <EditableField
                      label="Reminder Note"
                      type="textarea"
                      value={activeStage.medicineNextConnectNote || ''}
                      placeholder="Write the issue to remember"
                      onSave={(val) => saveStageField('medicineNextConnectNote', val)}
                      readOnly={!canEditStageDetails}
                      tone={activeMedicineConnectDue ? 'danger' : 'default'}
                    />
                  </div>
                </div>
              </div>

              <MedicineRequestPanel
                request={activeStage.medicineRequest}
                canRequest={canRequestMedicine}
                onRequest={handleRequestMedicine}
              />

              {showFollowUps && (
                <ScheduleCard
                  icon={CalendarClock}
                  title="Follow-ups"
                  entries={activeStage.followUps}
                  onAdd={handleAddFollowUp}
                  onUpdateStatus={handleUpdateFollowUpStatus}
                  canEditEntries={isAdmin}
                  formType="followup_full"
                  patient={patient}
                  stageNumber={activeStage.number}
                />
              )}
              <ScheduleCard
                icon={HeartHandshake}
                title="Family Sessions"
                entries={activeStage.familySessions}
                onAdd={handleAddFamilySession}
                onUpdateStatus={handleUpdateFamilySessionStatus}
                canUpdate={canUpdateFamilySessions}
                canEditEntries={isAdmin}
                formType="family_section_a"
                patient={patient}
                stageNumber={activeStage.number}
              />
              <AdvicePanel
                rows={activeStageAdviceRows}
                canRequest={canRequestAdvice}
                onRequest={handleRequestAdvice}
                onEditRequest={handleEditAdviceRequest}
                stageNumber={activeStage.number}
              />
            </div>
          )}
        </Card>
      )}

      {!loading && !loadError && patient && <ActivityTimeline entries={patient.activityLog || []} callLogs={callLogs} />}

      <Drawer
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        title={activeStage ? `Payment Timeline - Phase ${activeStage.number}` : 'Payment Timeline'}
      >
        {paymentApproveError && (
          <div className="mb-3 rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{paymentApproveError}</div>
        )}
        {!activeStage || activeStage.payments.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-10">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm text-charcoal font-medium">No payments yet</p>
            <p className="text-xs text-charcoal/55">Payments added for this phase will show up here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeStage.payments.map((pay) => (
              <li key={pay.id || `${pay.amount}-${pay.date}`} className="rounded-lg border border-cardline bg-offwhite-200 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-charcoal flex items-center gap-1">
                    <IndianRupee size={12} /> {Number(pay.amount).toLocaleString('en-IN')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isAdmin && <EditPaymentButton payment={pay} onSave={handleUpdatePayment} />}
                    <Badge tone={pay.paymentMode === 'cash' ? 'amber' : 'teal'}>{pay.paymentModeLabel}</Badge>
                    {pay.approvalStatus === 'pending' && <Badge tone="amber">Pending Approval</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-charcoal/55">
                  <span>Paid: {formatDate(pay.date)}</span>
                  <span>Recorded: {formatDateTime(pay.createdAt)}</span>
                </div>
                {pay.paymentMode === 'online' && (pay.utr || pay.transactionId) && (
                  <p className="mt-1.5 text-[11px] text-charcoal/60">
                    {pay.utr && <>UTR: {pay.utr}</>}
                    {pay.utr && pay.transactionId && ' · '}
                    {pay.transactionId && <>Txn ID: {pay.transactionId}</>}
                  </p>
                )}
                {pay.paymentMode === 'cash' && pay.receivedBy && (
                  <p className="mt-1.5 text-[11px] text-charcoal/60">Received by: {pay.receivedBy}</p>
                )}
                <p className="mt-1 text-xs text-charcoal/60">Recorded by {pay.recordedByName || 'Unknown'}</p>
                {pay.editedByName && (
                  <p className="mt-1 text-xs font-semibold text-[#8C3B2E]">
                    Edited by {pay.editedByName}{pay.editedAt ? ` · ${formatDateTime(pay.editedAt)}` : ''}
                  </p>
                )}
                {pay.approvalStatus === 'approved' && pay.approvedByName && (
                  <p className="mt-1 text-xs text-charcoal/40">
                    Approved by {pay.approvedByName}{pay.approvedAt ? ` · ${formatDateTime(pay.approvedAt)}` : ''}
                  </p>
                )}
                <FileLinks files={pay.screenshotFiles} fallbackUrl={pay.screenshotUrl} fallbackName="Payment screenshot" label="Screenshots" />
                {pay.approvalStatus === 'pending' && patient.canApprove && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-cardline-soft pt-2.5">
                    <p className="text-[11px] font-semibold text-[#9C6B2E]">Verify and approve this payment</p>
                    <Button
                      size="sm"
                      onClick={() => handleApprovePayment(activeStage.number, pay.id)}
                      disabled={approvingPaymentId === pay.id}
                    >
                      <Check size={13} /> {approvingPaymentId === pay.id ? 'Approving...' : 'Approve'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
};

export default PatientDetails;
