// The form of a session whose own template has not been given yet (the Development Trackers DT-01 ... DT-03 for now):
// the call details, how it went and the final status. When its template comes it is added to index.js and used.
const B = require('./blocks');

const basicTemplate = (session) => ({
  code: session.code,
  key: `MV-${session.code}-BASIC`,
  version: 1,
  basic: true,
  kind: session.kind,
  seq: session.seq,
  day: session.day,
  title: session.title,
  subtitle: 'इस session का पूरा template अभी नहीं आया है — तब तक यह छोटा form भरें',
  meta: [['Scheduled', `Day ${session.day}`], ['Responsible', 'PCC']],
  sections: [
    B.callInfo({ family: session.kind === 'family' }),
    { title: 'STEP 01 — Call', blocks: [{ t: 'response', id: 'response', label: 'Response', family: session.kind === 'family', req: true }] },
    {
      title: 'Session record',
      blocks: [
        { t: 'one', id: 'safety', label: 'कोई नई या बढ़ी हुई स्वास्थ्य परेशानी?', options: B.NEW_CONCERN, req: true },
        ...B.triage({ show: { id: 'safety', not: ['No New Concern'] } }),
        { t: 'text', id: 'summary', label: 'क्या बात हुई (summary)', long: true, req: true },
        B.taskRegister(3),
        { t: 'final', id: 'final', label: 'Final Status (एक चुनें)', options: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation'], req: true },
        { t: 'text', id: 'caseNote', label: 'Case Note', long: true },
      ],
    },
  ],
});

module.exports = { basicTemplate };
