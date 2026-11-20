import { useEffect, useMemo, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { AlertTriangle, Boxes, FileText, History, Laptop, Minus, PackageOpen, Pencil, Plus, RefreshCw, Search, Smartphone, Trash2, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DeviceRegister, { NotesCell, AssigneeHistory, DEVICE_FIELDS, DEVICE_LABEL, emptyDevice } from '../../components/inventory/DeviceRegister.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import InventorySoftCopy from '../../components/InventorySoftCopy.jsx';
import { Boxes as PageTitleIcon } from 'lucide-react';

const emptyItem = { name: '', category: '', unit: 'piece', openingStock: '', lowStockAt: '', notes: '' };
// Four tabs: mobiles and laptops (one row per device), OPD papers and Others (stock registers). Every item saved
// before the tabs is an OPD paper.
const TABS = [{ key: 'mobile', label: 'Mobiles', icon: Smartphone }, { key: 'laptop', label: 'Laptops', icon: Laptop }, { key: 'opd', label: 'OPD papers', icon: FileText }, { key: 'other', label: 'Others', icon: Boxes }];
const STOCK_TEXT = {
  opd: { title: 'OPD papers register', empty: 'No OPD papers yet', hint: 'Add an OPD paper to start tracking its stock.' },
  other: { title: 'Others register', empty: 'No other items yet', hint: 'Add any other clinic item to start tracking its stock.' },
};
const isDevice = (kind) => kind === 'mobile' || kind === 'laptop';
const emptyMovement = { type: 'add', quantity: '', reason: '', notes: '' };
const labels = { add: 'Stock added', consume: 'Stock used', adjust: 'Stock adjusted' };
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const number = (value) => Number(value || 0).toLocaleString('en-IN');

const IconAction = ({ label, children, onClick, primary = false }) => <button type="button" title={label} aria-label={label} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${primary ? 'border-sage bg-sage text-white hover:bg-[#4C5D52]' : 'border-cardline bg-offwhite-100 text-charcoal/65 hover:border-sage hover:bg-sage-muted/15 hover:text-charcoal'}`}>{children}</button>;

const ClinicInventory = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'opd';
  const setTab = (key) => setParams((old) => { const next = new URLSearchParams(old); next.set('tab', key); return next; }, { replace: true });
  const [deleteItem, setDeleteItem] = useState(null);
  const [search, setSearch] = useState('');
  const [items, setItems] = useStaleState(`clinic-inventory:${search}`, []);
  const [totals, setTotals] = useStaleState(`clinic-inventory:${search}:totals`, { items: 0, lowStock: 0 });
  const [loading, setLoading] = useState(!items.length);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementItem, setMovementItem] = useState(null);
  const [movement, setMovement] = useState(emptyMovement);
  const [historyItem, setHistoryItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const confirmDelete = async () => {
    if (saving) return;
    setSaving(true); setModalError('');
    try {
      await api.delete(`/clinic-inventory/${deleteItem.id}`);
      setDeleteItem(null); setHistoryItem(null); setRefresh((value) => value + 1);
    } catch (err) { setModalError(err.response?.data?.message || 'Could not delete item.'); }
    finally { setSaving(false); }
  };

  const load = async () => {
    if (!items.length) setLoading(true); setError('');
    try { const { data } = await api.get('/clinic-inventory', { params: { search }, skipCache: true }); setItems(data.items || []); setTotals(data.totals || { items: 0, lowStock: 0 }); }
    catch (err) { setError(err.response?.data?.message || 'Could not load clinic inventory.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [search, refresh]);
  const selectedHistory = useMemo(() => historyItem ? items.find((item) => item.id === historyItem.id) || historyItem : null, [historyItem, items]);
  const tabItems = useMemo(() => items.filter((item) => (item.kind || 'opd') === tab), [items, tab]);
  const kindCount = (key) => totals.kinds?.[key] ?? items.filter((item) => (item.kind || 'opd') === key).length;
  const assigned = tabItems.filter((item) => item.device?.assignee).length;
  const formKind = itemModal?.kind || 'opd';
  const lowInTab = tabItems.filter((item) => item.lowStockAt > 0 && item.currentStock <= item.lowStockAt).length;
  const openAdd = () => { setItemModal({ mode: 'add', kind: tab }); setItemForm({ ...emptyItem, ...emptyDevice }); setModalError(''); };
  const openEdit = (item) => { const kind = item.kind || 'opd'; setItemModal({ mode: 'edit', item, kind }); setItemForm(isDevice(kind) ? { ...emptyItem, ...emptyDevice, ...item.device, notes: item.notes || '' } : { name: item.name, category: item.category, unit: item.unit, openingStock: '', lowStockAt: item.lowStockAt || '', notes: item.notes || '' }); setModalError(''); };
  // A mobile / laptop sends only its own details; an Others item its stock fields.
  const itemPayload = () => (isDevice(formKind)
    ? { kind: formKind, notes: itemForm.notes, ...Object.fromEntries(DEVICE_FIELDS[formKind].map((field) => [field.key, itemForm[field.key] || ''])) }
    : { name: itemForm.name, category: itemForm.category, unit: itemForm.unit, openingStock: itemForm.openingStock, lowStockAt: itemForm.lowStockAt, notes: itemForm.notes, kind: formKind });
  const submitItem = async (event) => { event.preventDefault(); setSaving(true); setModalError(''); try { if (itemModal.mode === 'edit') await api.patch(`/clinic-inventory/${itemModal.item.id}`, itemPayload()); else await api.post('/clinic-inventory', itemPayload()); setItemModal(null); setRefresh((value) => value + 1); } catch (err) { setModalError(err.response?.data?.message || 'Could not save item.'); } finally { setSaving(false); } };
  // Notes of any item (every tab), edited from the Notes column.
  const [notesItem, setNotesItem] = useState(null);
  const [notesText, setNotesText] = useState('');
  const openNotes = (item) => { setNotesItem(item); setNotesText(item.notes || ''); setModalError(''); };
  const saveNotes = async (event) => { event.preventDefault(); setSaving(true); setModalError(''); try { await api.patch(`/clinic-inventory/${notesItem.id}`, { notes: notesText }); setNotesItem(null); setRefresh((value) => value + 1); } catch (err) { setModalError(err.response?.data?.message || 'Could not save the note.'); } finally { setSaving(false); } };
  const openMovement = (item, type) => { setMovementItem(item); setMovement({ ...emptyMovement, type, reason: type === 'add' ? 'New stock received' : type === 'consume' ? 'Item used' : 'Manual stock correction' }); setModalError(''); };
  // The latest stock entry can be corrected (opened from Stock records): same form, saved over that entry.
  const openEditLast = (item, entry) => { setMovementItem({ ...item, editLast: true, currentStock: entry.previousStock }); setMovement({ ...emptyMovement, type: entry.type, quantity: String(entry.quantity), reason: entry.reason || '', notes: entry.notes || '' }); setModalError(''); };
  const submitMovement = async (event) => { event.preventDefault(); setSaving(true); setModalError(''); try { if (movementItem.editLast) await api.patch(`/clinic-inventory/${movementItem.id}/transactions/last`, movement); else await api.post(`/clinic-inventory/${movementItem.id}/transactions`, movement); setMovementItem(null); setRefresh((value) => value + 1); } catch (err) { setModalError(err.response?.data?.message || 'Could not update stock.'); } finally { setSaving(false); } };

  return (
    <div className="mx-auto max-w-[1500px] font-serif">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">
            Reception operations
          </p>
          <h1 className="flex items-center gap-3 mt-1 text-3xl font-bold text-charcoal"><PageTitleIcon size={20} aria-hidden="true" />
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
            <Plus size={15} /> {isDevice(tab) ? `Add ${DEVICE_LABEL[tab]}` : 'Add item'}
          </Button>
        </div>
      </header>

      <div role="tablist" aria-label="Inventory type" className="mt-6 flex flex-wrap gap-2 border-b border-cardline">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px inline-flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold transition ${tab === key ? 'border-cardline border-b-offwhite-100 bg-offwhite-100 text-charcoal' : 'border-transparent text-charcoal/55 hover:text-charcoal'}`}>
            <Icon size={16} />{label}<span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === key ? 'bg-sage text-white' : 'bg-offwhite-300/60 text-charcoal/60'}`}>{loading && !items.length ? '...' : kindCount(key)}</span>
          </button>
        ))}
      </div>

      {isDevice(tab) ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: `${TABS.find((x) => x.key === tab).label} in clinic`, value: tabItems.length, tone: 'border-t-sage', Icon: tab === 'mobile' ? Smartphone : Laptop },
            { label: 'Assigned', value: assigned, tone: 'border-t-[#56695D]', Icon: UserRound },
            { label: 'Not assigned', value: tabItems.length - assigned, tone: 'border-t-[#9C6B2E]', Icon: AlertTriangle },
          ].map(({ label, value, tone, Icon }) => (
            <Card key={label} className={`min-h-[96px] border-t-2 ${tone}`} padded={false}>
              <div className="flex h-full items-center justify-between px-5 py-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">{label}</p><p className="mt-1 text-2xl font-bold text-charcoal">{loading && !items.length ? '...' : value}</p></div>
                <Icon size={22} className="text-sage/70" />
              </div>
            </Card>
          ))}
        </div>
      ) : (<>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="min-h-[96px] border-t-2 border-t-sage" padded={false}>
          <div className="flex h-full items-center justify-between px-5 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">
                Items tracked
              </p>
              <p className="mt-1 text-2xl font-bold text-charcoal">
                {loading && !items.length ? "..." : tabItems.length}
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
                {loading && !items.length ? "..." : lowInTab}
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
      </>)}

      {/* The search covers every tab: device details (brand, number, IMEI, device ID, assignee) too. */}
      {isDevice(tab) && (
        <label className="mt-6 flex h-10 w-full items-center gap-3 rounded-lg border border-cardline bg-offwhite-100 px-3.5 transition focus-within:border-sage focus-within:ring-2 focus-within:ring-sage/15 sm:w-96">
          <Search size={17} className="shrink-0 text-charcoal/40" />
          <input aria-label={`Search ${TABS.find((x) => x.key === tab).label.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'mobile' ? 'Search brand, number, IMEI or assignee' : 'Search device ID, brand or assignee'} className="min-w-0 flex-1 bg-transparent p-0 font-serif text-sm text-charcoal outline-none placeholder:font-serif placeholder:text-charcoal/45" />
        </label>
      )}
      {isDevice(tab) ? (
        <DeviceRegister kind={tab} items={tabItems} loading={loading} error={error} canDelete={user?.role === ROLES.ADMIN} onEdit={openEdit} onHistory={setHistoryItem} onDelete={(item) => { setDeleteItem(item); setModalError(''); }} onEditNotes={openNotes} />
      ) : (

      <Card className="mt-6 overflow-hidden" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cardline bg-offwhite-200/60 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-charcoal">{STOCK_TEXT[tab]?.title || 'Stock register'}</h2>
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
          <table className="w-full min-w-[1180px] border-collapse text-center text-sm">
            <thead className="bg-[#56695D] text-[11px] font-bold uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="w-[17%] px-5 py-3.5">Item</th>
                <th className="w-[11%] px-4 py-3.5">Category / unit</th>
                <th className="w-[11%] px-4 py-3.5">Available stock</th>
                <th className="w-[16%] px-4 py-3.5">Latest movement</th>
                <th className="w-[17%] px-4 py-3.5">Notes</th>
                <th className="w-[14%] px-4 py-3.5">Soft copy</th>
                <th className="w-[14%] px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cardline-soft">
              {loading && (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-14 text-center text-charcoal/55"
                  >
                    Loading inventory...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-14 text-center text-[#8C3B2E]"
                  >
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && !tabItems.length && (
                <tr>
                  <td colSpan="7" className="px-5 py-16 text-center">
                    <PackageOpen
                      size={28}
                      className="mx-auto text-charcoal/30"
                    />
                    <p className="mt-2 font-semibold text-charcoal">
                      {STOCK_TEXT[tab]?.empty || 'No clinic items yet'}
                    </p>
                    <p className="mt-1 text-sm text-charcoal/55">
                      {STOCK_TEXT[tab]?.hint || 'Add your first supply to start tracking stock.'}
                    </p>
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                tabItems.map((item, index) => {
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
                      <NotesCell item={item} onEditNotes={openNotes} />
                      <td className="px-4 py-4 align-middle"><InventorySoftCopy item={item} onSaved={() => setRefresh((value) => value + 1)} /></td>
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
                          {user?.role === ROLES.ADMIN && <IconAction label="Delete item" onClick={() => { setDeleteItem(item); setModalError(''); }}><Trash2 size={15} className="text-red-700" /></IconAction>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <Modal open={!!notesItem} onClose={() => !saving && setNotesItem(null)} title={notesItem ? `Notes | ${notesItem.name}` : 'Notes'} className="max-w-xl">
        <form onSubmit={saveNotes} className="space-y-3">
          {modalError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>}
          <textarea autoFocus rows={5} value={notesText} onChange={(event) => setNotesText(event.target.value)} placeholder="Notes for this item" aria-label="Notes" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setNotesItem(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save note'}</Button></div>
        </form>
      </Modal>
      <Modal
        open={!!deleteItem}
        onClose={() => !saving && setDeleteItem(null)}
        title={isDevice(deleteItem?.kind) ? `Delete ${DEVICE_LABEL[deleteItem.kind]}` : 'Delete clinic item'}
      >
        <p className="text-sm">{isDevice(deleteItem?.kind) ? <>Remove <strong>{deleteItem?.name}</strong> from inventory? Its details and assignee history are retained.</> : <>Remove <strong>{deleteItem?.name}</strong> from inventory? Current stock: {number(deleteItem?.currentStock)} {deleteItem?.unit}. Stock history will be retained.</>}</p>
        {modalError && <p role="alert" className="mt-3 text-sm text-red-700">{modalError}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleteItem(null)}>Cancel</Button><Button disabled={saving} onClick={confirmDelete}><Trash2 size={16} />{saving ? 'Deleting...' : 'Delete item'}</Button></div>
      </Modal>
      <Modal
        open={!!itemModal}
        onClose={() => setItemModal(null)}
        title={
          isDevice(formKind) ? `${itemModal?.mode === 'edit' ? 'Edit' : 'Add'} ${DEVICE_LABEL[formKind]}` : itemModal?.mode === "edit" ? "Edit clinic item" : "Add clinic item"
        }
        className="max-w-2xl"
      >
        <form onSubmit={submitItem} className="space-y-4">
          {modalError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {modalError}
            </p>
          )}
          {isDevice(formKind) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {DEVICE_FIELDS[formKind].map((field) => (
                <Input key={field.key} label={<>{field.label}{field.required && <span className="text-[#8C3B2E]"> *</span>}</>} type={field.type || 'text'} inputMode={field.inputMode} maxLength={field.maxLength} placeholder={field.placeholder} required={field.required} value={itemForm[field.key] || ''} onChange={(event) => setItemForm({ ...itemForm, [field.key]: event.target.value })} />
              ))}
            </div>
          ) : (
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
          )}
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
              {saving ? "Saving..." : isDevice(formKind) ? `Save ${DEVICE_LABEL[formKind]}` : "Save item"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!movementItem}
        onClose={() => setMovementItem(null)}
        title={
          movementItem
            ? `${movementItem.editLast ? 'Edit last entry' : labels[movement.type]} | ${movementItem.name}`
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
            {movementItem?.editLast ? "Stock before this entry:" : "Current stock:"}{" "}
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
              {saving ? "Saving..." : movementItem?.editLast ? "Save changes" : "Save movement"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!selectedHistory}
        onClose={() => setHistoryItem(null)}
        title={
          selectedHistory
            ? `${selectedHistory.name} | ${isDevice(selectedHistory.kind) ? 'Assignee history' : 'Stock records'}`
            : "Stock records"
        }
        className="max-w-5xl"
      >
        {selectedHistory && isDevice(selectedHistory.kind) && <AssigneeHistory item={selectedHistory} />}
        {selectedHistory && !isDevice(selectedHistory.kind) && (
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
                  <th className="px-3 py-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cardline-soft">
                {selectedHistory.transactions?.map((entry, index) => (
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
                    <td className="px-3 py-3">{entry.recordedByName || "-"}{entry.editedByName && <span className="block text-[11px] text-charcoal/50">Edited by {entry.editedByName}</span>}</td>
                    <td className="px-3 py-3">{index === 0 && <button type="button" title="Edit the latest entry" aria-label="Edit the latest stock entry" onClick={() => { setHistoryItem(null); openEditLast(selectedHistory, entry); }} className="rounded p-1.5 text-sage hover:bg-[#F3F6F2]"><Pencil size={14} /></button>}</td>
                  </tr>
                ))}
                {!selectedHistory.transactions?.length && (
                  <tr>
                    <td
                      colSpan="7"
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
