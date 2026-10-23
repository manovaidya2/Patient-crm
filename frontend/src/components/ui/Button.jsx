const variants = {
  primary:
    'bg-sage text-white hover:bg-[#56695D] active:bg-[#4C5D52] shadow-sm',
  outline:
    'border border-cardline bg-white text-charcoal hover:border-sage/50 hover:bg-[#FBF7ED] active:bg-sage-muted/20',
  ghost: 'text-sage hover:bg-sage-muted/20',
  danger: 'bg-[#8C3B2E] text-white hover:bg-[#763023]',
  // The one action that is waiting on this person.
  orange: 'bg-[#F97316] text-white hover:bg-[#EA6A0C] active:bg-[#C2410C] shadow-sm',
};

const sizes = {
  sm: 'px-2.5 sm:px-3 py-1.5 text-xs',
  md: 'px-3 sm:px-3.5 py-2 text-xs sm:text-[13px]',
  lg: 'px-4 sm:px-5 py-2.5 sm:py-3 text-sm',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled = false,
  ...rest
}) => {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex max-w-full items-center justify-center gap-2 rounded-[10px] font-bold max-sm:shrink-0 max-sm:whitespace-normal max-sm:break-normal [&>svg]:shrink-0 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
