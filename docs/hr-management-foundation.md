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
- Recruitment campaigns linked to active job descriptions
- Candidate screening and campaign attribution
- Interview scheduling and structured evaluations
- Salary offers with Admin approval
- Accepted-offer onboarding checklists
- Recruitment workload summary on the HR Dashboard
- Employee Directory linked to completed onboarding
- Daily attendance with check-in, check-out and calculated work duration
- Leave requests with Admin approval/rejection
- Holiday calendar
- Training plans with employee participation tracking
- Versioned HR policies with Admin publishing
- Employee operations summary on the HR Dashboard

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
| Create/edit pending leave requests | Yes | Yes | No |
| Approve/reject leave requests | Yes | No | No |
| Maintain holiday calendar | Yes | Yes | No |
| Manage training and participation | Yes | Yes | No |
| Draft HR policies | Yes | Yes | No |
| Publish/archive HR policies | Yes | No | No |

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
- `HrLeaveRequest` stores leave duration, reason and Admin decision details.
- `HrHoliday` stores the organization holiday calendar with one holiday per date.
- `HrTraining` stores schedules, trainers, assigned employees and participation outcomes.
- `HrPolicy` stores versioned policy content. HR prepares drafts and Admin publishes or archives them.

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
| POST | `/api/hr/leaves/:id/status` | Admin leave approval/rejection |
| GET/POST/PATCH | `/api/hr/holidays` | Holiday calendar |
| GET/POST/PATCH | `/api/hr/training` | Training plans |
| PATCH | `/api/hr/training/:id/participants/:employeeId` | Participation result |
| GET/POST/PATCH | `/api/hr/policies` | Policy drafts |
| POST | `/api/hr/policies/:id/status` | Admin publish/archive action |

## Dashboard Calculations

Counts are generated from MongoDB records and exclude voided calls.

- Today/yesterday use India calendar dates.
- Week starts on Monday.
- Month starts on the first day of the current month.
- Each separate active call record counts as one call.
- Outcome counts are grouped from stored outcomes.
- Pending callbacks have a future follow-up time and pending status.
- Overdue follow-ups have a past follow-up time and pending status.

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
- Only Admin can approve/reject leave and publish/archive policies.
- Published policies cannot be silently edited; a new version should be drafted.

## Next Phases

1. KPIs, Performance, Appraisals, PIP, Grievances, Payroll and Exit Management

Admin approval controls will be introduced with each relevant phase instead of adding non-functional placeholder pages.
