// Purchase order numbers: "PO-" + a random 4-digit number (PO-1000 .. PO-9999). A number already used by any
// purchase order (generated or old typed-in) is never handed out again. When the 4-digit numbers are nearly used up,
// it moves on to 5 digits so creating a PO never gets stuck. The unique index on generated numbers is the final
// guard against two people creating a PO at the same instant (see createWithPoNumber).
const ATTEMPTS_PER_WIDTH = 60;

const randomNumber = (digits, random = Math.random) => {
  const min = 10 ** (digits - 1);
  return String(min + Math.floor(random() * (9 * min)));
};

const nextPoNumber = async (PurchaseOrder, { random = Math.random } = {}) => {
  for (let digits = 4; digits <= 8; digits += 1) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_WIDTH; attempt += 1) {
      const candidate = `PO-${randomNumber(digits, random)}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await PurchaseOrder.exists({ poNumber: candidate }))) return candidate;
    }
  }
  throw Object.assign(new Error('Could not generate a purchase order number. Try again.'), { statusCode: 503 });
};

const isDuplicatePoNumber = (error) => error?.code === 11000 && Object.keys(error.keyPattern || error.keyValue || {}).includes('poNumber');

// Creates the purchase order with a fresh number, picking another if someone took the same number in the meantime.
const createWithPoNumber = async (PurchaseOrder, data, options = {}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const poNumber = await nextPoNumber(PurchaseOrder, options);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await PurchaseOrder.create({ ...data, poNumber, generated: true });
    } catch (error) {
      if (!isDuplicatePoNumber(error)) throw error;
    }
  }
  throw Object.assign(new Error('Could not generate a purchase order number. Try again.'), { statusCode: 503 });
};

module.exports = { nextPoNumber, createWithPoNumber, isDuplicatePoNumber, randomNumber };
