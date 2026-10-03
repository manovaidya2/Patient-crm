const confirmationField = /\b(call|calling|confirmation|confirmed|location sent|reports available|appointment time told)\b/i;
const paymentField = /\b(consultation (amount|fee)|advance (consultation|payment|fee)|payment screenshot|fee due|fee verified)\b/i;

export const columnSection = (column) => column.section || (paymentField.test(column.label || '') ? 'payments' : confirmationField.test(column.label || '') ? 'confirmation' : 'details');
