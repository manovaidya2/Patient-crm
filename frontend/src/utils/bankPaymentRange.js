const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const bankPaymentRange = ({ filter = 'all', date = '', month = '' } = {}, today = new Date()) => {
  if (filter === 'today') return { from: dateValue(today), to: dateValue(today) };
  if (filter === 'date') return { from: date, to: date };
  if (filter === 'month' && /^\d{4}-\d{2}$/.test(month)) {
    const [year, number] = month.split('-').map(Number);
    return { from: `${month}-01`, to: dateValue(new Date(year, number, 0)) };
  }
  return { from: '', to: '' };
};
