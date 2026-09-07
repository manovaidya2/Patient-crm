const tones = {
  teal: 'bg-sage-muted/25 text-sage',
  active: 'bg-sage-muted/30 text-sage',
  inactive: 'bg-offwhite-300/45 text-charcoal/55',
  amber: 'bg-offwhite-300/70 text-[#7C5B2E]',
  danger: 'bg-[#8C3B2E]/10 text-[#8C3B2E]',
};

const Badge = ({ children, tone = 'teal' }) => {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

export default Badge;
