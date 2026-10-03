const isSalesConfirmationColumn = (column) => column.section
  ? column.section === 'confirmation'
  : !/\b(consultation (amount|fee)|advance (consultation|payment|fee)|payment screenshot|fee due|fee verified)\b/i.test(column.label || '')
    && /\b(call|calling|confirmation|confirmed|location sent|reports available|appointment time told)\b/i.test(column.label || '');

module.exports = { isSalesConfirmationColumn };
