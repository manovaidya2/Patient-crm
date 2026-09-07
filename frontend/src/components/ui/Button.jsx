const variants = {
  primary:
    'bg-sage text-offwhite-100 hover:bg-[#56695D] active:bg-[#4C5D52] shadow-sm',
  outline:
    'border border-cardline text-charcoal hover:bg-sage-muted/20 active:bg-sage-muted/30',
  ghost: 'text-sage hover:bg-sage-muted/20',
  danger: 'bg-[#8C3B2E] text-offwhite-100 hover:bg-[#763023]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
