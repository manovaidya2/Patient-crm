import { useState } from 'react';
import CourierHandoverList from './CourierHandoverList.jsx';

// Self Pickup Schedule / Porter / Courier Schedule: one tab per stage. A case moves to the next tab by itself (scheduled,
// on the way once dispatched, delivered once the receipt is confirmed) and keeps showing its In Transit step.
// tabs: [{ key, label, section: 'pending' | 'delivered', received?: true | false, subtitle, empty }]
export default function ScheduleTabs({ mode, title, tabs }) {
  const [current, setCurrent] = useState(tabs[0].key);
  const tab = tabs.find((t) => t.key === current) || tabs[0];
  return (
    <CourierHandoverList
      key={tab.key}
      section={tab.section}
      received={tab.received}
      mode={mode}
      title={title}
      subtitle={tab.subtitle}
      emptyText={tab.empty}
      tabs={(
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" aria-pressed={t.key === tab.key} onClick={() => setCurrent(t.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${t.key === tab.key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage/60'}`}>{t.label}</button>
          ))}
        </div>
      )}
    />
  );
}
