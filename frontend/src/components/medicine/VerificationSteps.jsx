// Evidence reviewed by the assigned PCC before the final PASS / HOLD decision.
export default function VerificationSteps({ job }) {
  return (
    <div className="space-y-3 rounded-lg border border-sage/30 bg-[#F3F6F2] p-3">
      <p className="text-sm font-bold text-charcoal">Verify packing and treatment-paper records</p>
      {['pack1', 'photos', 'pack2'].map((key) => {
        const stage = job.stages.find((s) => s.key === key);
        if (!stage) return null;
        return (
          <div key={key} className="rounded-lg border border-cardline bg-white p-3 text-sm">
            <p className="font-bold">{stage.n}. {stage.label}</p>
            <p className="text-xs text-charcoal/65">{stage.state === 'done' ? `Done by ${stage.doneByName}${stage.doneAt ? ` · ${new Date(stage.doneAt).toLocaleString('en-IN')}` : ''}` : 'Not done'}</p>
            {stage.state === 'done' && <ul className="mt-2 space-y-1">
              {stage.checks.filter((_, i) => stage.checksDone?.[i] !== false).map((check) => <li key={check}>{check}</li>)}
              {Object.entries(stage.values || {}).filter(([, value]) => value !== '' && value != null).map(([name, value]) => <li key={name}>{stage.fields.find((f) => f.key === name)?.label || name}: {String(value)}</li>)}
              {stage.notes && <li>Notes: {stage.notes}</li>}
            </ul>}
          </div>
        );
      })}
    </div>
  );
}
