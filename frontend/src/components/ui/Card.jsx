const Card = ({ children, className = '', padded = true }) => {
  return (
    <div
      className={`bg-offwhite-100 border border-cardline rounded-xl2 shadow-card ${
        padded ? 'p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;
