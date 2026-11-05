// POs deleted in this browser session: lists that first show their last known rows hide them at once.
const deleted = new Set();
export const markPoDeleted = (id) => { if (id) deleted.add(String(id)); };
export const withoutDeletedPos = (items = []) => (deleted.size ? items.filter((po) => !deleted.has(String(po.id))) : items);
