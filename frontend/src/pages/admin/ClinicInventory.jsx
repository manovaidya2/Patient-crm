import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, Minus, PackageOpen, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';

const emptyItem = { name: '', category: '', unit: 'piece', openingStock: '', lowStockAt: '', notes: '' };
const emptyMovement = { type: 'add', quantity: '', reason: '', notes: '' };
const labels = { add: 'Stock added', consume: 'Stock used', adjust: 'Stock adjusted' };
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const number = (value) => Number(value || 0).toLocaleString('en-IN');

const IconAction = ({ label, children, onClick, primary = false }) => <button type="button" title={label} aria-label={label} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${primary ? 'border-sage bg-sage text-white hover:bg-[#4C5D52]' : 'border-cardline bg-offwhite-100 text-charcoal/65 hover:border-sage hover:bg-sage-muted/15 hover:text-charcoal'}`}>{children}</button>;

const ClinicInventory = () => {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ items: 0, lowStock: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementItem, setMovementItem] = useState(null);
  const [movement, setMovement] = useState(emptyMovement);
  const [historyItem, setHistoryItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/clinic-inventory', { params: { search }, skipCache: true }); setItems(data.items || []); setTotals(data.totals || { items: 0, lowStock: 0 }); }
    catch (err) { setError(err.response?.data?.message || 'Could not load clinic inventory.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [search, refresh]);
  const selectedHistory = useMemo(() => historyItem ? items.find((item) => item.id === historyItem.id) || historyItem : null, [historyItem, items]);
  const openAdd = () => { setItemModal({ mode: 'add' }); setItemForm(emptyItem); setModalError(''); };
  const openEdit = (item) => { setItemModal({ mode: 'edit', item }); setItemForm({ name: item.name, category: item.category, unit: item.unit, openingStock: '', lowStockAt: item.lowStockAt || '', notes: item.notes || '' }); setModalError(''); };
  const submitItem = async (event) => { event.preventDefault(); setSaving(true); setModalError(''); try { if (itemModal.mode === 'edit') await api.patch(`/clinic-inventory/${itemModal.item.id}`, itemForm); else await api.post('/clinic-inventory', itemForm); setItemModal(null); setRefresh((value) => value + 1); } catch (err) { setModalError(err.response?.data?.message || 'Could not save item.'); } finally { setSaving(false); } };
  const openMovement = (item, type) => { setMovementItem(item); setMovement({ ...emptyMovement, type, reason: type === 'add' ? 'New stock received' : type === 'consume' ? 'Item used' : 'Manual stock correction' }); setModalError(''); };
  const submitMovement = async (event) => { event.preventDefault(); setSaving(true); setModalError(''); try { await api.post(`/clinic-inventory/${movementItem.id}/transactions`, movement); setMovementItem(null); setRefresh((value) => value + 1); } catch (err) { setModalError(err.response?.data?.message || 'Could not update stock.'); } finally { setSaving(false); } };

  return (
    <div className="mx-auto max-w-[1500px] font-serif">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">
            Reception operations
          </p>
          <h1 className="mt-1 text-3xl font-bold text-charcoal">
            Clinic inventory
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            A live register of clinic supplies and stock movement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus size={15} /> Add item
          </Button>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="min-h-[96px] border-t-2 border-t-sage" padded={false}>
          <div className="flex h-full items-center justify-between px-5 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                Items tracked
              </p>
              <p className="mt-1 text-2xl font-bold text-charcoal">
                {loading ? "..." : totals.items}
              </p>
            </div>
            <PackageOpen size={22} className="text-sage/70" />
          </div>
        </Card>
        <Card
          className="min-h-[96px] border-t-2 border-t-[#9C6B2E]"
          padded={false}
        >
          <div className="flex h-full items-center justify-between px-5 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                Low stock
              </p>
              <p className="mt-1 text-2xl font-bold text-[#9C6B2E]">
                {loading ? "..." : totals.lowStock}
              </p>
            </div>
            <AlertTriangle size={22} className="text-[#9C6B2E]/75" />
          </div>
        </Card>
        <Card
          className="min-h-[96px] border-t-2 border-t-charcoal/35"
          padded={false}
        >
          <div className="flex h-full items-center justify-between px-5 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                Register status
              </p>
              <p className="mt-1 text-lg font-bold text-charcoal">Live</p>
              <p className="text-xs text-charcoal/50">
                Changes are timestamped
              </p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-sage shadow-[0_0_0_4px_rgba(86,105,93,0.12)]" />
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cardline bg-offwhite-200/60 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-charcoal">Stock register</h2>
            <p className="mt-0.5 text-xs text-charcoal/55">
              Use the row actions to update quantities or open the audit
              history.
            </p>
          </div>
          <label className="flex h-10 w-full items-center gap-3 rounded-lg border border-cardline bg-offwhite-100 px-3.5 transition focus-within:border-sage focus-within:ring-2 focus-within:ring-sage/15 sm:w-80">
            <Search size={17} className="shrink-0 text-charcoal/40" />
            <input
              aria-label="Search inventory"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by item or category"
              className="min-w-0 flex-1 bg-transparent p-0 font-serif text-sm text-charcoal outline-none placeholder:font-serif placeholder:text-charcoal/45"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-center text-sm">
            <thead className="bg-[#56695D] text-[11px] font-bold uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="w-[25%] px-5 py-3.5">Item</th>
                <th className="w-[16%] px-4 py-3.5">Category / unit</th>
                <th className="w-[17%] px-4 py-3.5">Available stock</th>
                <th className="w-[25%] px-4 py-3.5">Latest movement</th>
                <th className="w-[17%] px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cardline-soft">
              {loading && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-5 py-14 text-center text-charcoal/55"
                  >
                    Loading inventory...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-5 py-14 text-center text-[#8C3B2E]"
                  >
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && !items.length && (
                <tr>
                  <td colSpan="5" className="px-5 py-16 text-center">
                    <PackageOpen
                      size={28}
                      className="mx-auto text-charcoal/30"
                    />
                    <p className="mt-2 font-semibold text-charcoal">
                      No clinic items yet
                    </p>
                    <p className="mt-1 text-sm text-charcoal/55">
                      Add your first supply to start tracking stock.
                    </p>
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                items.map((item, index) => {
                  const low =
                    item.lowStockAt > 0 && item.currentStock <= item.lowStockAt;
                  const latest = item.transactions?.[0];
                  return (
                    <tr
                      key={item.id}
                      className={`${low ? "bg-[#9C6B2E]/[0.055]" : index % 2 ? "bg-offwhite-200/35" : "bg-offwhite-100"} hover:bg-sage-muted/10`}
                    >
                      <td className="border-r border-cardline-soft px-5 py-4 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-serif font-bold text-charcoal">
                            {item.name}
                          </span>
                          {low && <Badge tone="amber">Low stock</Badge>}
                        </div>
                        <p className="mt-1 text-[11px] text-charcoal/45">
                          Added {stamp(item.createdAt)} by{" "}
                          {item.createdByName || "-"}
                        </p>
                        {item.notes && (
                          <p className="mx-auto mt-1 max-w-[290px] truncate text-xs text-charcoal/55">
                            {item.notes}
                          </p>
                        )}
                      </td>
                      <td className="border-r border-cardline-soft px-4 py-4 align-middle">
                        <p className="text-charcoal/75">
                          {item.category || "General"}
                        </p>
                        <p className="mt-1 text-xs text-charcoal/50">
                          Unit: {item.unit}
                        </p>
                      </td>
                      <td className="border-r border-cardline-soft px-4 py-4 align-middle">
                        <div className="flex items-baseline justify-center gap-1.5">
                          <span className="font-serif text-xl font-bold text-charcoal">
                            {number(item.currentStock)}
                          </span>
                          <span className="text-xs text-charcoal/55">
                            {item.unit}
                          </span>
                        </div>
                        <p
                          className={`mt-1 text-[11px] ${low ? "font-semibold text-[#9C6B2E]" : "text-charcoal/50"}`}
                        >
                          Alert at {number(item.lowStockAt)}
                        </p>
                      </td>
                      <td className="border-r border-cardline-soft px-4 py-4 align-middle">
                        {latest ? (
                          <>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <span className="font-semibold text-charcoal">
                                {labels[latest.type]}
                              </span>
                              <span className="text-[11px] text-charcoal/50">
                                {stamp(latest.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-charcoal/65">
                              {number(latest.previousStock)} to{" "}
                              {number(latest.newStock)} {item.unit}
                            </p>
                            <p className="mt-1 text-[11px] text-charcoal/50">
                              By {latest.recordedByName || "-"}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-charcoal/45">
                            No movement recorded
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex justify-center gap-1.5">
                          <IconAction
                            label="Add stock"
                            primary
                            onClick={() => openMovement(item, "add")}
                          >
                            <Plus size={16} />
                          </IconAction>
                          <IconAction
                            label="Minus stock"
                            onClick={() => openMovement(item, "consume")}
                          >
                            <Minus size={16} />
                          </IconAction>
                          <IconAction
                            label="View stock records"
                            onClick={() => setHistoryItem(item)}
                          >
                            <History size={15} />
                          </IconAction>
                          <IconAction
                            label="Edit item"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil size={15} />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!itemModal}
        onClose={() => setItemModal(null)}
        title={
          itemModal?.mode === "edit" ? "Edit clinic item" : "Add clinic item"
        }
        className="max-w-2xl"
      >
        <form onSubmit={submitItem} className="space-y-4">
          {modalError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {modalError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Item name"
              value={itemForm.name}
              onChange={(event) =>
                setItemForm({ ...itemForm, name: event.target.value })
              }
              required
            />
            <Input
              label="Category"
              placeholder="Reception, stationery, cleaning..."
              value={itemForm.category}
              onChange={(event) =>
                setItemForm({ ...itemForm, category: event.target.value })
              }
            />
            <Input
              label="Unit"
              placeholder="piece, box, packet..."
              value={itemForm.unit}
              onChange={(event) =>
                setItemForm({ ...itemForm, unit: event.target.value })
              }
              required
            />
            {itemModal?.mode !== "edit" && (
              <Input
                label="Opening stock"
                type="number"
                min="0"
                step="0.01"
                value={itemForm.openingStock}
                onChange={(event) =>
                  setItemForm({ ...itemForm, openingStock: event.target.value })
                }
              />
            )}
            <Input
              label="Low stock alert"
              type="number"
              min="0"
              step="0.01"
              value={itemForm.lowStockAt}
              onChange={(event) =>
                setItemForm({ ...itemForm, lowStockAt: event.target.value })
              }
            />
          </div>
          <textarea
            rows={3}
            placeholder="Notes"
            value={itemForm.notes}
            onChange={(event) =>
              setItemForm({ ...itemForm, notes: event.target.value })
            }
            className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setItemModal(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save item"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!movementItem}
        onClose={() => setMovementItem(null)}
        title={
          movementItem
            ? `${labels[movement.type]} | ${movementItem.name}`
            : "Update stock"
        }
        className="max-w-xl"
      >
        <form onSubmit={submitMovement} className="space-y-4">
          {modalError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {modalError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Action</label>
              <select
                value={movement.type}
                onChange={(event) =>
                  setMovement({ ...movement, type: event.target.value })
                }
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm"
              >
                <option value="add">Add stock</option>
                <option value="consume">Minus stock</option>
                <option value="adjust">Set exact stock</option>
              </select>
            </div>
            <Input
              label={movement.type === "adjust" ? "New stock" : "Quantity"}
              type="number"
              min="0"
              step="0.01"
              value={movement.quantity}
              onChange={(event) =>
                setMovement({ ...movement, quantity: event.target.value })
              }
              required
            />
            <Input
              label="Reason"
              value={movement.reason}
              onChange={(event) =>
                setMovement({ ...movement, reason: event.target.value })
              }
            />
          </div>
          <textarea
            rows={3}
            placeholder="Notes for this movement"
            value={movement.notes}
            onChange={(event) =>
              setMovement({ ...movement, notes: event.target.value })
            }
            className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage"
          />
          <p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm text-charcoal/65">
            Current stock:{" "}
            <strong className="text-charcoal">
              {number(movementItem?.currentStock)} {movementItem?.unit}
            </strong>
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMovementItem(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save movement"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!selectedHistory}
        onClose={() => setHistoryItem(null)}
        title={
          selectedHistory
            ? `${selectedHistory.name} | Stock records`
            : "Stock records"
        }
        className="max-w-5xl"
      >
        {selectedHistory && (
          <div className="overflow-x-auto rounded-lg border border-cardline">
            <table className="min-w-full text-center text-sm">
              <thead className="bg-[#56695D] text-xs uppercase text-white">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Quantity</th>
                  <th className="px-3 py-3">Stock change</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cardline-soft">
                {selectedHistory.transactions?.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-3 text-charcoal/65">
                      {stamp(entry.createdAt)}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {labels[entry.type]}
                    </td>
                    <td className="px-3 py-3">
                      {number(entry.quantity)} {selectedHistory.unit}
                    </td>
                    <td className="px-3 py-3">
                      {number(entry.previousStock)} to {number(entry.newStock)}
                    </td>
                    <td className="px-3 py-3">
                      {entry.reason || entry.notes || "-"}
                    </td>
                    <td className="px-3 py-3">{entry.recordedByName || "-"}</td>
                  </tr>
                ))}
                {!selectedHistory.transactions?.length && (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-3 py-8 text-center text-charcoal/55"
                    >
                      No stock records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClinicInventory;
