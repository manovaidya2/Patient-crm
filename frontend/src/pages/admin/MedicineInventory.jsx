import { useCallback, useEffect, useMemo, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { AlertTriangle, Boxes, ClipboardCheck, PackageOpen, Plus, Siren, Timer } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EntryForm from '../../components/inventory/EntryForm.jsx';
import ItemDetail from '../../components/inventory/ItemDetail.jsx';
import ItemForm from '../../components/inventory/ItemForm.jsx';
import LedgerView from '../../components/inventory/LedgerView.jsx';
import MatrixView from '../../components/inventory/MatrixView.jsx';
import ReorderView from '../../components/inventory/ReorderView.jsx';
import StockList from '../../components/inventory/StockList.jsx';
import { PACKABLE, PACKING_CATEGORY, categoryLabel, inputClass, unitText } from '../../components/inventory/helpers.js';

const VIEWS = [['stock', 'Stock list'], ['entry', 'Entry: In / Use / Adjust / Pack'], ['matrix', 'Bottle size view'], ['ledger', 'Stock ledger'], ['reorder', 'Reorder / Purchase list'], ['master', 'Medicine categories']];
const DEFAULT_FILTERS = { q: '', category: 'all', status: 'attention', size: '' };

const MedicineInventory = () => {
  const [items, setItems] = useStaleState('medicine-inventory:items', []);
  const [meta, setMeta] = useStaleState('medicine-inventory:meta', { categories: [], categoryConfig: [], packSizeMaster: { ml: [], gram: [] }, itemTypes: [], containerKinds: [], unitOptions: [], totals: {}, canApprove: false });
  const [view, setView] = useState('stock');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [ledgerType, setLedgerType] = useState('all');
  const [preset, setPreset] = useState(null);
  const [itemModal, setItemModal] = useState(null); // { mode, item }
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', unit: 'gram', usesPackSizes: false });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [loading, setLoading] = useState(!items.length);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/medicine/inventory', { skipCache: true });
      setItems(data.items || []);
      setMeta({ categories: data.categories || [], categoryConfig: data.categoryConfig || [], packSizeMaster: data.packSizeMaster || { ml: [], gram: [] }, itemTypes: data.itemTypes || [], containerKinds: data.containerKinds || [], unitOptions: data.unitOptions || [], totals: data.totals || {}, canApprove: Boolean(data.canApprove) });
      setError('');
    } catch (err) { setError(err.response?.data?.message || 'Could not load medicine inventory.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(t); }, [notice]);

  const refresh = (message) => { if (message) setNotice(message); setReloadKey((k) => k + 1); };
  const detailItem = useMemo(() => items.find((i) => i.id === detailId) || null, [items, detailId]);
  const act = (type, item) => { setDetailId(null); setPreset({ act: type, itemId: item.id, nonce: Date.now() }); setView('entry'); };
  const deleteItem = async (item) => {
    const warning = item.currentStock > 0 ? `\n\nThis medicine still has ${item.currentStock} ${item.unit} in stock.` : '';
    if (!window.confirm(`Delete "${item.name}" from the inventory?${warning}\n\nPrevious ledger entries will remain in history.`)) return;
    try {
      await api.delete(`/medicine/inventory/${item.id}`);
      setDetailId(null);
      refresh(`${item.name} was deleted`);
    } catch (err) { setDetailId(null); setError(err.response?.data?.message || 'Could not delete the medicine'); }
  };
  const showStock = (patch) => { setFilters({ ...DEFAULT_FILTERS, ...patch }); setView('stock'); };
  const openCategoryModal = () => {
    setCategoryForm({ name: '', unit: 'gram', usesPackSizes: false });
    setCategoryError('');
    setCategoryModal(true);
  };
  const saveCategory = async (event) => {
    event.preventDefault(); setCategorySaving(true); setCategoryError('');
    try {
      await api.post('/medicine/inventory/categories', categoryForm);
      setCategoryModal(false);
      refresh(`${categoryForm.name} category was added`);
    } catch (err) { setCategoryError(err.response?.data?.message || 'Could not add the category'); }
    finally { setCategorySaving(false); }
  };

  const t = meta.totals || {};
  const tiles = [
    { label: 'Total medicines', value: t.items || 0, note: `${meta.categories.length} categories`, icon: Boxes, tone: 'text-sage', go: () => showStock({ status: 'all' }) },
    { label: 'Critical / Out', value: t.critical || 0, note: `${t.emergencyCritical || 0} emergency medicines`, icon: Siren, tone: 'text-[#8C3B2E]', alert: t.critical > 0, go: () => showStock({ status: 'critical' }) },
    { label: 'At reorder level', value: t.reorder || 0, note: 'Included in purchase list', icon: AlertTriangle, tone: 'text-amber-700', go: () => setView('reorder') },
    { label: 'Above maximum', value: t.over || 0, note: 'Excess stock and expiry risk', icon: Boxes, tone: 'text-violet-700', go: () => showStock({ status: 'over' }) },
    { label: 'Expiry within 90 days', value: t.expiring || 0, note: 'Issue these first', icon: Timer, tone: 'text-amber-700', go: () => showStock({ status: 'expiry' }) },
    { label: 'Approval pending', value: t.pending || 0, note: 'Adjust entries', icon: ClipboardCheck, tone: 'text-violet-700', alert: t.pending > 0, go: () => { setLedgerType('pending'); setView('ledger'); } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-charcoal sm:text-2xl"><PackageOpen size={22} className="text-sage" />Medicine Inventory (Store)</h1>
          <p className="mt-1 text-sm text-charcoal/60">Track every medicine by category, unit, pack size and stock level.</p>
        </div>
        <Button onClick={() => setItemModal({ mode: 'add' })}><Plus size={16} />Add medicine</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {tiles.map(({ label, value, note, icon: Icon, tone, alert, go }) => (
          <button key={label} type="button" disabled={!go} onClick={go} className={`rounded-xl border bg-white p-3 text-left ${alert ? 'border-[#8C3B2E]/50' : 'border-cardline'} ${go ? 'hover:border-sage/60' : 'cursor-default'}`}>
            <Icon size={16} className={tone} /><p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p><p className="text-xs font-medium text-charcoal/70">{label}</p><p className="text-[11px] text-charcoal/45">{note}</p>
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800" role="status">{notice}</div>}

      <nav className="flex flex-wrap gap-1 rounded-xl border border-cardline bg-white p-1" aria-label="Inventory views">
        {VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === key ? 'bg-sage text-white' : 'text-charcoal/60 hover:bg-offwhite-200'}`}>{label}{key === 'ledger' && t.pending > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900">{t.pending}</span>}</button>)}
      </nav>

      {loading ? <p className="rounded-xl border border-cardline bg-white p-10 text-center text-sm text-charcoal/55">Loading inventory...</p> : (
        <>
          {view === 'stock' && <StockList items={items} filters={filters} setFilters={setFilters} onAction={act} onOpen={(i) => setDetailId(i.id)} onHistory={(i) => setDetailId(i.id)} onEdit={(item) => setItemModal({ mode: 'edit', item })} />}
          {view === 'entry' && <EntryForm items={items} categories={meta.categories} canApprove={meta.canApprove} preset={preset} onSaved={(res) => { refresh(`${res.created.length} ledger row${res.created.length === 1 ? '' : 's'} saved${res.pending ? ` · ${res.pending} awaiting approval` : ''}`); setLedgerType(res.pending ? 'pending' : 'all'); setView('ledger'); }} />}
          {view === 'matrix' && <MatrixView items={items} master={meta.packSizeMaster} onOpen={(i) => setDetailId(i.id)} onSize={(size) => showStock({ status: 'all', size })} onSizesChanged={refresh} onError={setError} canRemove={meta.canApprove} />}
          {view === 'ledger' && <LedgerView type={ledgerType} onTypeChange={setLedgerType} canApprove={meta.canApprove} onOpenItem={(id) => setDetailId(id)} reloadKey={reloadKey} onChanged={refresh} />}
          {view === 'reorder' && <ReorderView items={items} onOpen={(i) => setDetailId(i.id)} onChanged={refresh} onError={setError} />}
          {view === 'master' && (
            <section className="space-y-3 rounded-xl border border-cardline bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-bold text-charcoal">Medicine categories</h3><p className="text-xs text-charcoal/55">Add and configure categories here. Medicines are added from the main Add medicine button.</p></div><Button onClick={openCategoryModal}><Plus size={16} />Add category</Button></div>
              <div className="overflow-x-auto rounded-lg border border-cardline">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-offwhite-200 text-xs uppercase tracking-wide text-charcoal/55"><tr>{['Category', 'Base unit', 'Pack sizes', 'Items'].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {meta.categoryConfig.map((c) => <tr key={c.hi} className="border-t border-cardline"><td className="px-3 py-2.5 font-semibold">{categoryLabel(c.hi)}</td><td className="px-3 py-2.5">{unitText(c.unit)}</td><td className="px-3 py-2.5 text-xs text-charcoal/70">{c.sizes.length ? c.sizes.map((s) => `${s} ${unitText(c.unit)}`).join(', ') : c.hi === PACKING_CATEGORY ? 'Each container is a separate item with its size' : 'Loose stock only'}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{items.filter((i) => i.category === c.hi).length}</td></tr>)}
                    {meta.categories.filter((c) => !meta.categoryConfig.some((k) => k.hi === c)).map((c) => <tr key={c} className="border-t border-cardline"><td className="px-3 py-2.5 font-semibold">{categoryLabel(c)}</td><td className="px-3 py-2.5">—</td><td className="px-3 py-2.5 text-xs text-charcoal/70">Configured on the item</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{items.filter((i) => i.category === c).length}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <Modal open={Boolean(itemModal)} onClose={() => setItemModal(null)} title={itemModal?.mode === 'edit' ? `Edit ${itemModal.item.name}` : 'Add medicine'} className="max-w-3xl">
        {itemModal && <ItemForm key={itemModal.item?.id || itemModal.prefill?.name || 'new'} mode={itemModal.mode} item={itemModal.item} prefill={itemModal.prefill} items={items} meta={meta} onSizesChanged={() => refresh()} onClose={() => setItemModal(null)} onSaved={(message) => { setItemModal(null); refresh(message); }} />}
      </Modal>
      <Modal open={categoryModal} onClose={() => setCategoryModal(false)} title="Add medicine category" className="max-w-lg">
        <form onSubmit={saveCategory} className="space-y-4">
          {categoryError && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{categoryError}</p>}
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>Category name *</span>
            <input className={inputClass} required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9 /&()+.'-]*" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Example: Herbal Tea" />
            <span className="block text-[11px] font-normal text-charcoal/50">Use an English category name.</span>
          </label>
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>Base unit *</span>
            <select className={inputClass} value={categoryForm.unit} onChange={(e) => setCategoryForm({ ...categoryForm, unit: e.target.value, usesPackSizes: PACKABLE.includes(e.target.value) ? categoryForm.usesPackSizes : false })}>
              {meta.unitOptions.map((unit) => <option key={unit} value={unit}>{unitText(unit)}</option>)}
            </select>
          </label>
          {PACKABLE.includes(categoryForm.unit) && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-cardline bg-white px-3 py-3 text-sm text-charcoal">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sage" checked={categoryForm.usesPackSizes} onChange={(e) => setCategoryForm({ ...categoryForm, usesPackSizes: e.target.checked })} />
              <span><b className="block">Uses bottle / jar sizes</b><span className="text-xs text-charcoal/55">Show standard {unitText(categoryForm.unit)} pack sizes when adding medicines in this category.</span></span>
            </label>
          )}
          <div className="flex justify-end gap-2 border-t border-cardline pt-3"><Button variant="outline" onClick={() => setCategoryModal(false)} disabled={categorySaving}>Cancel</Button><Button type="submit" disabled={categorySaving}>{categorySaving ? 'Saving...' : 'Add category'}</Button></div>
        </form>
      </Modal>
      <Drawer open={Boolean(detailItem)} onClose={() => setDetailId(null)} title={detailItem?.name || ''} widthClass="max-w-lg">
        {detailItem && <ItemDetail item={detailItem} items={items} onAction={act} onDelete={meta.canApprove ? deleteItem : undefined} onEdit={(item) => { setDetailId(null); setItemModal({ mode: 'edit', item }); }} />}
      </Drawer>
    </div>
  );
};

export default MedicineInventory;
