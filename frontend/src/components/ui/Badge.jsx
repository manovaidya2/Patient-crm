// One pill style for every status. Orange = waiting on you, green = done, grey = later, red = overdue/failed.
const tones = {
  teal: 'bg-[#E9EFE9] text-sage',
  active: 'bg-[#E6F2EA] text-[#1F6B41]',
  green: 'bg-[#E6F2EA] text-[#1F6B41]',
  inactive: 'bg-[#F3EEE2] text-charcoal/60',
  default: 'bg-[#F3EEE2] text-charcoal/70',
  amber: 'bg-[#FBF0DC] text-[#7C5B2E]',
  orange: 'bg-[#FFF1E6] text-[#C2410C]',
  action: 'bg-[#F97316] text-white',
  purple: 'bg-[#EFE9FA] text-[#4C2F8F]',
  danger: 'bg-[#FDE2E1] text-[#9F1D1D]',
};

const Badge = ({ children, tone = 'teal', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone] || tones.default} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
