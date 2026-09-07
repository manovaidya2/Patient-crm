const Input = ({ label, id, error, className = '', ...rest }) => {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-charcoal mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition ${
          error ? 'border-[#8C3B2E]' : ''
        } ${className}`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-[#8C3B2E]">{error}</p>}
    </div>
  );
};

export default Input;
