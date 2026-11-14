const exceptionPending = (po) => Boolean(po?.exceptionPayment?.required && !po.exceptionPayment.approvedAt);
const assertExceptionApproved = (po) => {
  if (exceptionPending(po)) throw Object.assign(new Error('Doctor must verify the exception payment before the next PO step'), { statusCode: 409 });
};
module.exports = { exceptionPending, assertExceptionApproved };
