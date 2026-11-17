import { Plus, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

export const extraComponentsComplete = (components = []) => components.every((component) => component.code && component.name && component.unit && Number(component.qty) > 0 && Number.isFinite(Number(component.qty)));

export default function ExtraComponentsEditor({ components = [], onChange, stockOptions = [], medicineName }) {
  return <section className="space-y-2 sm:col-span-2" aria-label={`Additional components for ${medicineName}`}>
    {components.map((component, index) => <div key={index} className="grid gap-2 rounded-lg border border-cardline bg-white p-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
      <FieldLabel label={`Component ${index + 1}`} required><select aria-label={`Component ${index + 1}`} className={poInput} value={component.code} onChange={(event) => {
        const stock = stockOptions.find((item) => item.code === event.target.value);
        onChange(components.map((item, n) => n === index ? { ...item, code: stock?.code || '', name: stock?.name || '', unit: stock?.unit || '' } : item));
      }}><option value="">Select from Stocks</option>{component.code && !stockOptions.some((item) => item.code === component.code) && <option value={component.code}>{component.code} - {component.name}</option>}{stockOptions.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name} ({item.unit})</option>)}</select></FieldLabel>
      <FieldLabel label={`Quantity${component.unit ? ` (${component.unit})` : ''}`} required><input aria-label={`Component ${index + 1} quantity`} className={poInput} type="number" min="0.001" step="0.001" value={component.qty} onChange={(event) => onChange(components.map((item, n) => n === index ? { ...item, qty: event.target.value } : item))} /></FieldLabel>
      <button type="button" className="self-end rounded p-2 text-[#8C3B2E] hover:bg-red-50" aria-label={`Remove component ${index + 1}`} onClick={() => onChange(components.filter((_, n) => n !== index))}><X size={15} /></button>
    </div>)}
    <Button size="sm" variant="outline" disabled={components.length >= 50 || !extraComponentsComplete(components)} onClick={() => onChange([...components, { code: '', name: '', unit: '', qty: '' }])}><Plus size={13} />Add more component</Button>
  </section>;
}
