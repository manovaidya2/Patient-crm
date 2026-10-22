# In Transit workflow

## Ownership

- Reception approves consultation receipts only. Its old patient approval, treatment payment, refund and delivery links have moved to In Transit.
- In Transit owns the conversion queue, patient approval, treatment payment verification, medicine requests, patient calls, delivery planning, dispatch/receipt and explanation scheduling.
- Medicine Department accepts requests, confirms ready dates, records preparation and packaging, then releases medicine after patient approval and full verified treatment payment.
- The assigned Assistant Doctor completes medicine explanation with actual completion time and notes. Only that completion activates treatment. Admin retains management access.

## Connected records

The queue reads the existing patient phase, PO, payments, medicine requests and courier records. No duplicate payment or shipment ledger is created. Conversion enters the queue with a PO even when no payment has yet been received. Initial submitted payments must be verified before requesting medicine.

Expected medicine readiness comes from the PO and is confirmed on the medicine request. In Transit may call, record additional payment and schedule courier/porter dispatch or self-pickup while preparation continues. Scheduling does not dispatch or deliver an order.

Medicine release requires full **approved** payment after refunds, no pending payments, patient approval, medicine photos and packaging/checking details. Each request has its own release state; an older release does not authorize a newer request. Dispatch and pickup recheck the current balance and hold status. An admin cancellation/refund cannot be bypassed using a previously released order.

Explanation can be booked after dispatch or pickup. Completion requires confirmed receipt, full approved payment, the assigned doctor, notes and a nonfuture actual time after receipt. The completion and treatment activation are saved together. The stage-scoped doctor assignment survives changes to the patient's general doctor assignment.

## Timeline and reminders

The dashboard includes date/search/status filters, list/board views, live preparation state, payment proofs, PO attachments, delivery plans and full phase activity history. The Treatment Started filter retains completed cases.

Existing in-app reminder polling runs every 15 seconds while the app is open. In Transit and Medicine Department receive urgent reminders from the day before readiness, including overdue cases. Assistant Doctors receive their own due/overdue explanation reminders. In Transit also receives due calls, pickup, dispatch and medicine-ready notifications. These are **in-app reminders**, not SMS, email or background push notifications when the app is closed. Calendar-day calculations use Asia/Kolkata.

## Compatibility and deployment

1. Deploy frontend and backend together.
2. Backend startup migrates existing `dispatch_courier` users and their knowledge-library department to `in_transit`, preserving records and history. Existing accountant-to-reception migration remains intact.
3. Users should sign in again after deployment to refresh stored role information. New In Transit users can be created from Team Members.
4. Existing completed phases remain completed; historical treatment dates are not rewritten. New conversions use the stricter explanation-completion sequence.

Patient document saves use optimistic concurrency: competing changes return HTTP 409 and require refresh instead of silently overwriting each other's payment/release state. Holds/removal block workflow actions; admin removal from the queue preserves the underlying patient and financial records.

## Checks

- Backend: `node --test` from `backend`.
- Frontend: `npm run build` from `frontend`.
- UI smoke: start frontend on port 5173, then run `node scripts/check-transit-ui.cjs` from `backend`. Synthetic API responses cover In Transit, Assistant Doctor and Reception at desktop/mobile widths, board/scheduling controls, runtime errors and horizontal overflow. External requests are blocked. Screenshots are saved in `backend/.cache/transit-ui`.

Production data migration and real staff-account acceptance testing must be done during deployment; local checks do not connect to the live database.
