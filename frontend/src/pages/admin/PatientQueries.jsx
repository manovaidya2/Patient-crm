import { MessageCircleQuestion } from 'lucide-react';

const PatientQueries = () => (
  <div className="mx-auto max-w-[1800px]">
    <div className="mb-5 border-b border-cardline pb-5">
      <p className="text-xs font-semibold uppercase text-charcoal/50">Receptionist Workspace</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Help Desk / Patient Queries</h1>
    </div>

    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-cardline bg-offwhite-100">
      <div className="text-center text-charcoal/50">
        <MessageCircleQuestion size={34} strokeWidth={1.6} className="mx-auto mb-3 text-sage" />
        <p className="text-sm">No patient queries yet.</p>
      </div>
    </div>
  </div>
);

export default PatientQueries;
