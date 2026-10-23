// White surface on the cream page, soft border, 14px corners (the app-wide card).
const Card = ({ children, className = '', padded = true }) => {
  return (
    <div
      className={`bg-white border border-[#E8DFCB] rounded-[14px] shadow-card ${
        padded ? 'p-4 sm:p-5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;
