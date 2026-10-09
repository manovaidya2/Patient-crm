export const CALL_TYPES = [
  ['first_call', 'First Call'], ['follow_up', 'Follow-up Call'], ['other', 'Other'],
];

export const CALL_OUTCOMES = [
  ['connected', 'Connected'], ['no_answer', 'No Answer'], ['busy', 'Busy'],
  ['switched_off', 'Switched Off'], ['callback_requested', 'Callback Requested'],
  ['interested', 'Interested'], ['not_interested', 'Not Interested'],
  ['wrong_number', 'Wrong Number'], ['other', 'Other'],
];

export const CANDIDATE_STAGES = [
  ['new', 'New'], ['calling', 'Calling'], ['interested', 'Interested'], ['screening', 'Screening'],
  ['interview_scheduled', 'Interview Scheduled'], ['interviewed', 'Interviewed'], ['selected', 'Selected'],
  ['offer_sent', 'Offer Sent'], ['joined', 'Joined'], ['rejected', 'Rejected'],
  ['on_hold', 'On Hold'], ['withdrawn', 'Withdrawn'],
];

export const EMPLOYMENT_TYPES = [
  ['full_time', 'Full Time'], ['part_time', 'Part Time'], ['contract', 'Contract'],
  ['internship', 'Internship'], ['consultant', 'Consultant'],
];

export const REQUIREMENT_STATUSES = [
  ['draft', 'Draft'], ['pending_approval', 'Pending Approval'], ['approved', 'Approved'],
  ['rejected', 'Rejected'], ['closed', 'Closed'],
];

export const INTERVIEW_TYPES = [
  ['phone', 'Phone'], ['video', 'Video'], ['in_person', 'In Person'],
  ['technical', 'Technical'], ['hr', 'HR'],
];

export const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

export const toIndiaDateTimeInputs = (value) => {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
  };
};

export const labelFor = (options, value) => options.find(([key]) => key === value)?.[1] || String(value || '').replaceAll('_', ' ');

export const formatDateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : 'Not set';

export const todayInput = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export const timeInput = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date());
