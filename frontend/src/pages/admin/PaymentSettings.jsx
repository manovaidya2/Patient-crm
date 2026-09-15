import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Download, Pencil, Plus, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';

const emptyForm = {
  name: '',
  displayName: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  notes: '',
  isActive: true,
};

const PaymentSettings = () => {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [ifscLoading, setIfscLoading] = useState(false);

  useEffect(() => {
    const fetchBanks = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/banks');
        setBanks(data.banks || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load banks.');
      } finally {
        setLoading(false);
      }
    };
    fetchBanks();
  }, [reloadKey]);

  const openAdd = () => {
    setEditingBank(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (bank) => {
    setEditingBank(bank);
    setForm({
      name: bank.name || '',
      displayName: bank.displayName || '',
      accountNumber: bank.accountNumber || '',
      ifsc: bank.ifsc || '',
      branch: bank.branch || '',
      notes: bank.notes || '',
      isActive: bank.isActive !== false,
    });
    setFormError('');
    setModalOpen(true);
  };

  const fetchIfscDetails = async () => {
    const code = form.ifsc.trim().toUpperCase();
    if (!code) {
      setFormError('Enter IFSC code first');
      return;
    }
    setIfscLoading(true);
    setFormError('');
    try {
      const { data } = await api.get(`/banks/ifsc/${code}`);
      setForm((prev) => ({
        ...prev,
        displayName: data.bank?.bankName ? `${data.bank.bankName} - ${data.bank.branch}` : prev.displayName,
        branch: data.bank?.branch || prev.branch,
      }));
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not fetch bank name for this IFSC.');
    } finally {
      setIfscLoading(false);
    }
  };

  const saveBank = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingBank) {
        await api.patch(`/banks/${editingBank.id}`, form);
      } else {
        await api.post('/banks', form);
      }
      setModalOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not save bank.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Settings</p>
          <h1 className="font-display text-2xl font-bold text-charcoal">Payment Settings</h1>
          <p className="mt-1 text-sm text-charcoal/60">Banks added here appear in online payment Pay to Bank dropdown.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={openAdd}>
            <Plus size={16} /> Add Bank
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#8C3B2E]/20 bg-[#8C3B2E]/8 px-4 py-3 text-sm text-[#8C3B2E]">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <Card className="mt-6" padded={false}>
        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading banks...</div>
        ) : banks.length === 0 ? (
          <div className="p-10 text-center">
            <Building2 size={24} className="mx-auto text-charcoal/35" />
            <p className="mt-2 text-sm font-semibold text-charcoal">No banks added yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cardline-soft text-left text-xs uppercase tracking-wide text-charcoal/55">
                  <th className="px-5 py-3 font-semibold">Bank</th>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 font-semibold">IFSC</th>
                  <th className="px-5 py-3 font-semibold">Branch</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => (
                  <tr key={bank.id} className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-charcoal">{bank.displayName || bank.name}</p>
                      {bank.displayName && <p className="mt-0.5 text-xs text-charcoal/50">Internal: {bank.name}</p>}
                      {bank.notes && <p className="mt-0.5 text-xs text-charcoal/50">{bank.notes}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-charcoal/70">{bank.accountNumber || '-'}</td>
                    <td className="px-5 py-3.5 text-charcoal/70">{bank.ifsc || '-'}</td>
                    <td className="px-5 py-3.5 text-charcoal/70">{bank.branch || '-'}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={bank.isActive ? 'teal' : 'inactive'}>{bank.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(bank)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-sage hover:bg-sage-muted/25"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingBank ? 'Edit Bank' : 'Add Bank'} className="max-w-2xl">
        <form onSubmit={saveBank} className="space-y-4">
          {formError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{formError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Bank Name (internal)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Account Number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal">IFSC</label>
              <div className="flex gap-2">
                <input
                  value={form.ifsc}
                  onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                />
                <Button type="button" variant="outline" onClick={fetchIfscDetails} disabled={ifscLoading}>
                  <Download size={15} /> {ifscLoading ? '...' : 'Fetch'}
                </Button>
              </div>
            </div>
            <Input label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
            <Input
              label="Display Name (shown in payments)"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Fetch from IFSC or type manually"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-cardline text-sage focus:ring-sage"
            />
            Active for online payments
          </label>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Bank'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PaymentSettings;
