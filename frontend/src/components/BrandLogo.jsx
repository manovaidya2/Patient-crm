const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

const BrandLogo = ({ size = 'sm', className = '' }) => (
  <img
    src="/manovaidya-logo.jfif"
    alt="Manovaidya"
    className={`${sizeClasses[size] || sizeClasses.sm} shrink-0 rounded-lg object-cover ${className}`}
  />
);

export default BrandLogo;
