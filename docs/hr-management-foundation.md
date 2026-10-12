# ManoVaidya HR Management Foundation

## Scope

This foundation is part of the existing ManoVaidya CRM. It does not create a separate application, login system, or telephony service.

The current HR branch contains:

- Unified HR Dashboard
- Candidate Register and Candidate Profile
- Manual Call Register
- Candidate call history
- Pending and overdue follow-ups
- Call edit audit history
- Admin-only call voiding
- Filtered Excel export
- Hiring requirements with Admin approval
- Job descriptions linked to approved requirements
- Recruitment campaigns linked to active job descriptions, with approved budget and actual spend
- Candidate screening and campaign attribution
- Interview scheduling and structured evaluations
- Salary offers with Admin approval
- Accepted-offer onboarding checklists
- Recruitment workload summary on the HR Dashboard
- Employee Directory linked to completed onboarding
- Daily attendance with full day, half day, short day, work-from-home and calculated work duration
- HR-managed leave requests with approval, rejection and cancellation
- Holiday calendar
- Training plans with employee participation tracking
- Versioned HR policies with Admin publishing
- Employee operations summary on the HR Dashboard
- Employee-linked KPIs with numeric targets, actual achievement and weightage, plus structured performance reviews
- Appraisal proposals with Admin approval
- Performance improvement plans and confidential grievances
- Monthly payroll records with server-calculated net pay and Admin approval
- Exit approval, clearance and automatic employee status closure
- Daily, weekly and monthly calculated HR analytics with documented exceptions and CSV export
- Consolidated lifecycle register reporting with CSV export

Employee-operation modules will build on this recruitment foundation.

## Calling Boundary

All candidate calls are made manually outside the CRM. The CRM does not provide:

- Click-to-call or dialer links
- Incoming or outgoing call detection
- Automatic call duration
- Call recording
- Telephony webhooks
- Paid calling APIs

Every call record has `source: hr_entered` and is not represented as automatically verified.

## Roles and Permissions

| Capability | Admin | HR | Existing CRM roles |
| --- | --- | --- | --- |
| Open HR Dashboard | Yes | Yes | No |
| Create/edit candidates | Yes | Yes | No |
| Add/edit manual calls | Yes | Yes | No |
| Complete/cancel follow-ups | Yes | Yes | No |
| View call audit history | Yes | Yes | No |
| Export filtered calls | Yes | Yes | No |
| Void a call record | Yes, reason required | No | No |
| Approve/reject hiring requirements | Yes | No | No |
| Approve/reject salary offers | Yes | No | No |
| Manage JDs, campaigns and screening | Yes | Yes | No |
| Schedule/evaluate connected interview rounds | Yes | Yes | No |
| Prepare, submit and communicate offers | No | Yes | No |
| Edit and approve/reject salary offers | Yes | No | No |
| Manage onboarding checklist | Yes | Yes | No |
| Create/edit employee records | Yes | Yes | No |
| Record/edit attendance | Yes | Yes | No |
| Create/edit pending leave requests | View only | Yes | No |
| Approve/reject/cancel leave requests | View only | Yes | No |
| Maintain holiday calendar | Yes | Yes | No |
| Manage training and participation | Yes | Yes | No |
| Draft HR policies | Yes | Yes | No |
| Publish/archive HR policies | Yes | No | No |
| Manage KPIs and performance reviews | Yes | Yes | No |
| Manage PIP and grievance records | Yes | Yes | No |
| Prepare appraisal, payroll and exit records | Yes | Yes | No |
| Give final appraisal/payroll/exit approval | Yes | No | No |
| Export HR lifecycle reports | Yes | Yes | No |
| Edit any HR record, including finalized records | Yes | Workflow-limited | No |
| Permanently delete HR records | Yes | No | No |

The `HR` role uses the existing `User` model and JWT authentication. Existing Manager accounts do not receive HR access.

## Data Model

### HrCandidate

Stores candidate identity, contact details, applied position, recruitment stage, source, notes, latest call summary, next follow-up, total call count, actor details, and activity timeline.

Candidate IDs use the format `HR-CAN-YYYY-000001`.

### HrCallRecord

Stores one record per manual call, including candidate snapshot, date, time, type, outcome, remarks, optional follow-up, logged-in recorder, timestamps, edit snapshots, and optional Admin void details.

Call IDs use the format `HR-CALL-YYYY-000001`.

### HrCounter

Provides atomic yearly sequences for candidate, call, requirement, JD, campaign, interview, offer and onboarding IDs.

### Recruitment Records

`HrHiringRequirement`, `HrJobDescription`, `HrCampaign`, `HrInterview`, `HrOffer`, and `HrOnboarding` keep each recruitment step separately auditable. Candidates retain their campaign attribution, screening assessment and lifecycle activity timeline.

### Employee Operations Records

- `HrEmployee` stores the employee master record and can link back to completed onboarding and candidate records.
- `HrAttendance` stores one daily record per employee and calculates worked minutes from check-in and check-out.
- `HrLeaveRequest` stores leave duration, reason and HR decision details.
- `HrHoliday` stores the organization holiday calendar with one holiday per date.
- `HrTraining` stores schedules, trainers, assigned employees and participation outcomes.
- `HrPolicy` stores versioned policy content. HR prepares drafts and Admin publishes or archives them.
- `HrLifecycleRecord` stores employee-linked KPI, performance, appraisal, PIP, grievance, payroll and exit records with module-specific validated data and an actor timeline.

Employee and candidate creation compares a normalized name and phone-number identity. Name case/extra spaces and common Indian phone formatting (`+91`, spaces or hyphens) cannot be used to create a duplicate person record.

## Follow-up Rules

- A call without a next follow-up has `not_required` status.
- A future pending follow-up is displayed as `pending`.
- A past pending follow-up is dynamically displayed as `overdue`.
- HR or Admin can mark it `completed` or `cancelled`.
- Completed, cancelled, and voided records do not appear in the pending queue.
- Editing a call records the fields changed, old/new values, actor, and timestamp.

## API

All routes require the existing CRM login and either `admin` or `hr` role.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/hr/dashboard` | Real call and follow-up metrics |
| GET | `/api/hr/candidates` | Search/filter candidates |
| POST | `/api/hr/candidates` | Create candidate |
| GET | `/api/hr/candidates/:id` | Candidate profile |
| PATCH | `/api/hr/candidates/:id` | Update candidate |
| GET | `/api/hr/calls` | Search/filter call records |
| POST | `/api/hr/calls` | Add manual call |
| PATCH | `/api/hr/calls/:id` | Edit with audit history |
| POST | `/api/hr/calls/:id/follow-up` | Complete/cancel follow-up |
| POST | `/api/hr/calls/:id/void` | Admin-only void with reason |
| GET | `/api/hr/calls/export` | Export current filters to Excel |
| GET | `/api/hr/recruitment/summary` | Recruitment workload counts |
| GET/POST/PATCH | `/api/hr/requirements` | Hiring requirements |
| POST | `/api/hr/requirements/:id/status` | Submit or Admin approve/reject |
| GET/POST/PATCH | `/api/hr/job-descriptions` | Job descriptions |
| GET/POST/PATCH | `/api/hr/campaigns` | Recruitment campaigns |
| PUT | `/api/hr/candidates/:id/screening` | Candidate screening |
| GET/POST/PATCH | `/api/hr/interviews` | Interview schedule |
| POST | `/api/hr/interviews/:id/evaluation` | Structured interview evaluation |
| GET/POST/PATCH | `/api/hr/offers` | Salary offers |
| POST | `/api/hr/offers/:id/status` | Offer approval and response workflow |
| GET/POST | `/api/hr/onboarding` | Accepted-offer onboarding |
| PATCH | `/api/hr/onboarding/:id/checklist/:key` | Update onboarding task |
| GET | `/api/hr/operations/summary` | Employee operations workload counts |
| GET/POST/PATCH | `/api/hr/employees` | Employee Directory records |
| GET | `/api/hr/employees/onboarding-options` | Completed onboarding not yet converted |
| GET/POST/PATCH | `/api/hr/attendance` | Daily attendance register |
| GET/POST/PATCH | `/api/hr/leaves` | Leave requests |
| POST | `/api/hr/leaves/:id/status` | HR leave approval/rejection/cancellation |
| GET/POST/PATCH | `/api/hr/holidays` | Holiday calendar |
| GET/POST/PATCH | `/api/hr/training` | Training plans |
| PATCH | `/api/hr/training/:id/participants/:employeeId` | Participation result |
| GET/POST/PATCH | `/api/hr/policies` | Policy drafts |
| POST | `/api/hr/policies/:id/status` | Admin publish/archive action |
| GET/POST/PATCH | `/api/hr/lifecycle/:module` | Lifecycle register for KPI through exit modules |
| POST | `/api/hr/lifecycle/:module/:id/status` | Controlled workflow transition |
| GET | `/api/hr/lifecycle/summary` | Real lifecycle dashboard/report counts |
| GET | `/api/hr/lifecycle/reports/metrics` | Daily, weekly or monthly calculated HR metrics |
| GET | `/api/hr/lifecycle/reports/metrics/export` | Export the selected calculated report to CSV |
| GET | `/api/hr/lifecycle/reports/export` | Filterable lifecycle CSV export |

## Dashboard Calculations

Counts are generated from MongoDB records and exclude voided calls.

- Today/yesterday use India calendar dates.
- Week starts on Monday.
- Month starts on the first day of the current month.
- Each separate active call record counts as one call.
- Outcome counts are grouped from stored outcomes.
- Pending callbacks have a future follow-up time and pending status.
- Overdue follow-ups have a past follow-up time and pending status.

## Calculated HR Reports

The HR Reports page calculates the following metrics from CRM records for a selected daily, Monday-to-Sunday weekly, or calendar-month period:

| Metric | Calculation |
| --- | --- |
| Interview attendance rate | Attended / scheduled x 100 |
| Candidate qualification rate | Qualified / applications x 100 |
| Selection rate | Selected / completed interviews x 100 |
| Offer acceptance rate | Accepted / issued offers x 100 |
| Joining rate | Completed onboarding / accepted offers x 100 |
| Cost per joining | Actual recruitment spend / joined employees |
| Average time to hire | Acceptance date - application date |
| Training completion | Completed assignments / assigned modules x 100 |
| Weighted KPI achievement | Weighted actual / target x 100 |

The report applies consistent exceptions so operational changes do not distort the figures:

- Cancelled interviews are excluded. No-shows remain scheduled but are not attended.
- The qualification cohort is candidates created in the selected period; a shortlisted screening is qualified.
- Selection requires a completed interview with a `selected` recommendation.
- Draft, unapproved and withdrawn offers are excluded. Declined offers remain issued.
- Joining requires completed onboarding linked to an accepted offer.
- Cost per joining uses actual spend from non-cancelled campaigns starting in the selected period; campaign budget is not treated as spend.
- Time to hire averages calendar days for accepted offers issued in the selected period.
- Cancelled training is excluded and only completed participant assignments count as completed.
- KPI achievement includes active or completed KPIs ending in the selected period with numeric target, actual value and positive weightage.
- A metric without a denominator displays `Not available` instead of a misleading zero.

## Workflow Rules

- HR submits a hiring requirement; only Admin can approve or reject it.
- A job description requires an approved hiring requirement.
- A campaign requires an active job description.
- New candidate campaign links must point to an active campaign.
- Interview evaluation records a 1-5 rating and recommendation. A `next_round` result creates a connected round from the previous interview.
- HR submits an offer; only Admin can approve or reject salary details.
- Admin can edit an offer while it awaits approval; HR owns offer submission, sent and candidate-response updates.
- Candidate-profile actions retain the selected candidate through interview and offer forms.
- An offer can be marked sent only after approval.
- Onboarding can start only after the offer is accepted.
- Completing every onboarding task moves the candidate to `joined`.
- A completed onboarding can be converted into one employee record only once.
- Each employee can have only one attendance record per date.
- Pending or approved leave date ranges cannot overlap for the same employee.
- HR alone creates, edits, approves, rejects or cancels leave requests; Admin retains read-only visibility.
- Monthly salary is required on an offer. Annual CTC is optional and defaults to monthly salary multiplied by 12.
- Only Admin can publish/archive policies.
- Published policies cannot be silently edited; a new version should be drafted.
- Appraisal, payroll and exit records require Admin final approval.
- Payroll net pay is calculated server-side from basic salary, allowances and deductions; one payroll record is allowed per employee/month.
- Completing an exit changes the linked employee status to `exited` and records the action on the employee timeline.
- Grievance and payroll records are stored as confidential lifecycle records.
- Admin can edit records after normal workflow locking, including approved, completed and finalized records.
- Admin-only permanent deletion is available across recruitment, calls, employee operations and lifecycle registers.
- Deleting a candidate removes linked calls, interviews, offers, onboarding and employee records. Deleting an employee removes linked attendance, leave and lifecycle records and unlinks training participation.
- Deleting a requirement, job description or campaign cleans dependent campaign links without deleting otherwise valid candidates.
- Dashboard totals and calculated reports query current records, so deleted records are removed from subsequent calculations and exports automatically.

## Current Phase Status

The planned HR phases are implemented. Further work should be driven by live operational feedback, statutory payroll requirements and organization-specific appraisal policy rather than placeholder modules.
