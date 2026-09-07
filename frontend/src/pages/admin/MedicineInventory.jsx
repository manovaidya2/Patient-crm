import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, Minus, PackageOpen, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';

const units = [
  'tablet',
  'capsule',
  'bottle',
  'packet',
  'kg',
  'gram',
  'mg',
  'ml',
  'piece',
  'other',
];

const emptyItemForm = {
  name: '',
  unit: 'gram',
  openingStock: '',
  lowStockAt: '',
  unitCost: '',
  notes: '',
};

const emptyTransactionForm = {
  type: 'add',
  quantity: '',
  unitCost: '',
  reason: '',
  notes: '',
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

const formatNumber = (value) => Number(value || 0).toLocaleString('en-IN');
const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const transactionLabels = {
  add: 'Stock Added',
  consume: 'Used / Minus',
  adjust: 'Stock Adjusted',
};

const MedicineInventory = () => {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ items: 0, lowStock: 0, stockValue: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [transactionItem, setTransactionItem] = useState(null);
  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm);
  const [historyItem, setHistoryItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/medicine/inventory', { params: { search } });
        setItems(data.items || []);
        setTotals(data.totals || { items: 0, lowStock: 0, stockValue: 0 });
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load medicine inventory.');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchInventory, 250);
    return () => clearTimeout(timer);
  }, [search, reloadKey]);

  const selectedHistoryItem = useMemo(
    () => (historyItem ? items.find((item) => item.id === historyItem.id) || historyItem : null),
    [historyItem, items]
  );

  const openAddItem = () => {
    setItemModal({ mode: 'add' });
    setItemForm(emptyItemForm);
    setModalError('');
  };

  const openEditItem = (item) => {
    setItemModal({ mode: 'edit', item });
    setItemForm({
      name: item.name || '',
      unit: item.unit || 'gram',
      openingStock: '',
      lowStockAt: item.lowStockAt || '',
      unitCost: item.lastUnitCost || '',
      notes: item.notes || '',
    });
    setModalError('');
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      if (itemModal.mode === 'edit') {
        await api.patch(`/medicine/inventory/${itemModal.item.id}`, {
          name: itemForm.name,
          unit: itemForm.unit,
          lowStockAt: itemForm.lowStockAt,
          notes: itemForm.notes,
        });
      } else {
        await api.post('/medicine/inventory', itemForm);
      }
      setItemModal(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not save medicine.');
    } finally {
      setSaving(false);
    }
  };

  const openTransaction = (item, type) => {
    setTransactionItem(item);
    setTransactionForm({
      ...emptyTransactionForm,
      type,
      unitCost: item.lastUnitCost || '',
      reason:
        type === 'add'
          ? 'New stock received'
          : type === 'consume'
            ? 'Used in medicine preparation'
            : 'Manual stock correction',
    });
    setModalError('');
  };

  const submitTransaction = async (e) => {
    e.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      await api.post(`/medicine/inventory/${transactionItem.id}/transactions`, transactionForm);
      setTransactionItem(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not update stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Medicine Inventory</h1>
          <p className="mt-1 text-sm text-charcoal/60">Medicine stock, usage and purchase history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={openAddItem}>
            <Plus size={15} /> Add Medicine
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase text-charcoal/55">Inventory Items</p>
          <p className="mt-1 font-display text-3xl font-bold text-charcoal">{loading ? '...' : totals.items}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-charcoal/55">Low Stock</p>
          <p className="mt-1 font-display text-3xl font-bold text-[#8C3B2E]">{loading ? '...' : totals.lowStock}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-charcoal/55">Approx Stock Value</p>
          <p className="mt-1 font-display text-3xl font-bold text-sage">{loading ? '...' : formatMoney(totals.stockValue)}</p>
        </Card>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="border-b border-cardline-soft p-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine"
              className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading inventory...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <PackageOpen size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">No medicine added yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-cardline-soft">
            {items.map((item) => {
              const isLow = item.lowStockAt > 0 && item.currentStock <= item.lowStockAt;
              const recentHistory = (item.transactions || []).slice(0, 3);
              return (
                <div
                  key={item.id}
                  className={`grid gap-4 border-l-4 p-5 xl:grid-cols-[1.2fr_1fr_1.2fr_auto] ${
                    isLow ? 'border-l-[#8C3B2E] bg-[#8C3B2E]/7' : 'border-l-transparent'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-charcoal">{item.name}</h2>
                      {isLow && <Badge tone="danger">Low Stock</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-charcoal/55">
                      Added {formatDateTime(item.createdAt)} by {item.createdByName || '-'}
                    </p>
                    {item.editedByName && (
                      <p className="mt-1 text-xs text-charcoal/45">Edited by {item.editedByName} on {formatDateTime(item.editedAt)}</p>
                    )}
                    {item.notes && <p className="mt-2 whitespace-pre-line text-sm text-charcoal/65">{item.notes}</p>}
                  </div>

                  <div className={`rounded-lg border p-3 ${isLow ? 'border-[#8C3B2E]/35 bg-[#8C3B2E]/8' : 'border-cardline bg-offwhite-200'}`}>
                    <p className="text-xs font-semibold uppercase text-charcoal/55">Current Stock</p>
                    <p className="mt-1 font-display text-2xl font-bold text-charcoal">
                      {formatNumber(item.currentStock)} <span className="text-base text-charcoal/60">{item.unit}</span>
                    </p>
                    <p className="mt-2 text-xs text-charcoal/55">Low stock alert: {formatNumber(item.lowStockAt)} {item.unit}</p>
                    <p className="mt-1 text-xs text-charcoal/55">Last price: {formatMoney(item.lastUnitCost)} / {item.unit}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-charcoal">Recent History</p>
                    {recentHistory.length ? (
                      <div className="mt-2 space-y-2">
                        {recentHistory.map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-cardline-soft bg-offwhite-200/60 px-3 py-2 text-xs text-charcoal/65">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-charcoal">{transactionLabels[entry.type]}</span>
                              <span>{formatDateTime(entry.createdAt)}</span>
                            </div>
                            <p className="mt-1">
                              {formatNumber(entry.previousStock)} to {formatNumber(entry.newStock)} {item.unit}
                              {entry.recordedByName ? ` by ${entry.recordedByName}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-charcoal/50">No stock movement yet.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                    <Button size="sm" onClick={() => openTransaction(item, 'add')}>
                      <Plus size={14} /> Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openTransaction(item, 'consume')}>
                      <Minus size={14} /> Use
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openTransaction(item, 'adjust')}>
                      Adjust
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditItem(item)}>
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryItem(item)}>
                      <History size={14} /> History
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal?.mode === 'edit' ? 'Edit Medicine' : 'Add Medicine'} className="max-w-2xl">
        <form onSubmit={submitItem} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Medicine Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal">Unit</label>
              <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
                {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
            {itemModal?.mode !== 'edit' && (
              <>
                <Input label="Opening Stock" type="number" min="0" step="0.001" value={itemForm.openingStock} onChange={(e) => setItemForm({ ...itemForm, openingStock: e.target.value })} />
                <Input label="Price Per Unit" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })} />
              </>
            )}
            <Input label="Low Stock Alert" type="number" min="0" step="0.001" value={itemForm.lowStockAt} onChange={(e) => setItemForm({ ...itemForm, lowStockAt: e.target.value })} />
          </div>
          <textarea rows={3} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} placeholder="Notes" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setItemModal(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!transactionItem} onClose={() => setTransactionItem(null)} title={transactionItem ? `${transactionLabels[transactionForm.type]} - ${transactionItem.name}` : 'Update Stock'} className="max-w-2xl">
        <form onSubmit={submitTransaction} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal">Action</label>
              <select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
                <option value="add">Add stock</option>
                <option value="consume">Use / minus stock</option>
                <option value="adjust">Set exact stock</option>
              </select>
            </div>
            <Input
              label={transactionForm.type === 'adjust' ? `New Stock (${transactionItem?.unit || ''})` : `Quantity (${transactionItem?.unit || ''})`}
              type="number"
              min="0"
              step="0.001"
              value={transactionForm.quantity}
              onChange={(e) => setTransactionForm({ ...transactionForm, quantity: e.target.value })}
              required
            />
            <Input label="Price Per Unit" type="number" min="0" step="0.01" value={transactionForm.unitCost} onChange={(e) => setTransactionForm({ ...transactionForm, unitCost: e.target.value })} />
            <Input label="Reason" value={transactionForm.reason} onChange={(e) => setTransactionForm({ ...transactionForm, reason: e.target.value })} />
          </div>
          <textarea rows={3} value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} placeholder="Notes" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />
          <div className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-3 text-sm text-charcoal/70">
            Current stock: <span className="font-semibold text-charcoal">{formatNumber(transactionItem?.currentStock)} {transactionItem?.unit}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTransactionItem(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Stock'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selectedHistoryItem} onClose={() => setHistoryItem(null)} title={selectedHistoryItem ? `${selectedHistoryItem.name} History` : 'History'} className="max-w-4xl">
        {selectedHistoryItem && (
          <div>
            <div className="mb-4 rounded-lg border border-cardline bg-offwhite-200 px-4 py-3 text-sm text-charcoal/70">
              Current stock: <span className="font-semibold text-charcoal">{formatNumber(selectedHistoryItem.currentStock)} {selectedHistoryItem.unit}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-cardline">
              <table className="min-w-full divide-y divide-cardline-soft text-sm">
                <thead className="bg-offwhite-200 text-left text-xs uppercase text-charcoal/55">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">By</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cardline-soft bg-offwhite-100">
                  {(selectedHistoryItem.transactions || []).map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 text-charcoal/65">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-charcoal">{transactionLabels[entry.type]}</td>
                      <td className="px-4 py-3">{formatNumber(entry.quantity)} {selectedHistoryItem.unit}</td>
                      <td className="px-4 py-3">{formatNumber(entry.previousStock)} to {formatNumber(entry.newStock)}</td>
                      <td className="px-4 py-3">{formatMoney(entry.unitCost)}</td>
                      <td className="px-4 py-3">{entry.recordedByName || '-'}</td>
                      <td className="px-4 py-3">{entry.reason || entry.notes || '-'}</td>
                    </tr>
                  ))}
                  {!selectedHistoryItem.transactions?.length && (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-charcoal/55">No history yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MedicineInventory;
