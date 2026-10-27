const mongoose = require('mongoose');

// Fixed, code-defined fields for the appointment forms. They replace the old "add / edit / delete column"
// screens. `id` is the id the column already had in the database, so every value saved earlier (keyed by that
// id) keeps showing in exactly the same place. To add or change a field, edit this list.
const field = (id, label, type, order, section, extra = {}) => ({ id, label, type, order, section, required: false, options: [], ...extra });

const SALES_FIELDS = [
  field('6ab7ba37bf916b34dfda213e', 'Lead Type', 'select', 0, 'details', { required: true, options: ['B2B', 'B2C'] }),
  field('6ab7ba4fbf916b34dfda21aa', 'Center Id', 'text', 1, 'details'),
  field('6ab7ba47bf916b34dfda217a', 'Center Name', 'text', 2, 'details'),
  field('6ab7b22ebf916b34dfd9f5db', 'Patient Type', 'select', 3, 'details', { options: ['New', 'Existing'] }),
  // Only asked when Patient Type is Existing: their old Patient ID, so no new ID is made and the next phase is used.
  field('6b1f0a3c9d2e4f5a6b7c8d01', 'Old Patient ID', 'text', 3.5, 'details', { showWhen: { columnId: '6ab7b22ebf916b34dfd9f5db', value: 'Existing' } }),
  field('6ab7b2adbf916b34dfd9f5f7', 'Patient Name', 'text', 4, 'details', { required: true }),
  field('6ab7b2b6bf916b34dfd9f609', 'Age', 'text', 5, 'details', { required: true }),
  field('6ab7b2e2bf916b34dfd9f643', 'Gender', 'select', 6, 'details', { options: ['Male', 'Female'] }),
  field('6ab7b2fdbf916b34dfd9f66b', 'Guardian/Parent Name', 'text', 7, 'details'),
  field('6ab7b310bf916b34dfd9f699', 'Relationship', 'text', 8, 'details'),
  field('6aba3f2e0e962ba40a6a4db8', 'Father Occupation', 'text', 9, 'details'),
  field('6aba3f220e962ba40a6a4d98', 'Mother Occupation', 'text', 10, 'details'),
  field('6ab7b33fbf916b34dfd9f6c2', 'Primary Mobile', 'phone', 11, 'details'),
  field('6ab7b34ebf916b34dfd9f6d4', 'Alternate Mobile', 'phone', 12, 'details'),
  field('6ab7b3d5bf916b34dfda083f', 'City', 'text', 13, 'details'),
  field('6ab7b3e7bf916b34dfda0851', 'State', 'text', 14, 'details'),
  field('6ab7b471bf916b34dfda0863', 'Case Category', 'select', 15, 'details', { required: true, options: ['Autism', 'ADHD', 'Autism + ADHD', 'Mental Health', 'Other'] }),
  field('6ab7b494bf916b34dfda0875', 'Mode', 'select', 16, 'details', { options: ['Online', 'Clinic Visit'] }),
  field('6ab7b4ccbf916b34dfda08ab', 'Appointment Time Told Them', 'time', 17, 'confirmation'),
  field('6ab7c37bbf916b34dfda552c', 'Calls Confirmation Date', 'date', 21, 'confirmation'),
  field('6ab7c388bf916b34dfda5559', 'Call Confirmation Time', 'time', 22, 'confirmation'),
  field('6abcec361235a043d2cbe603', 'Status of confirmation', 'select', 23, 'confirmation', { options: ['Confirmed', 'Rescheduled', 'Not comming', 'Not interested', 'Call not picked'] }),
  field('6aba3ff20e962ba40a6a54e9', 'Clinic location Sent', 'select', 24, 'confirmation', { options: ['Sent', 'Not Sent'] }),
  field('6aba42990e962ba40a6a651d', 'Previous Reports Available', 'checkbox', 25, 'confirmation'),
  field('6ab7c3b2bf916b34dfda558b', 'Confirmation Notes', 'text', 26, 'confirmation'),
];

// Reception call confirmation. (Reception details are still dynamic until they are redesigned.)
const RECEPTION_FIELDS = [
  field('6aba531b7172140c6badaee5', 'Primary Concern Confirmation', 'multi_select', 3, 'confirmation', {
    options: ['Speech', 'Hyperactivity', 'Attention', 'Behaviour', 'Understanding/Instruction Following', 'Social Interaction', 'Development', 'Anxiety', 'Sleep', 'Overthinking', 'Panic', 'Mood', 'Stress'],
  }),
  field('6ad1f8d6de5dded53d756a0c', 'Estimated Time', 'time', 18, 'confirmation'),
  field('6ad1f8fbde5dded53d756b39', 'Location and parking check list', 'select', 19, 'confirmation', { options: ['Sent', 'Not Sent'] }),
];

const ARRIVAL_STATUS_ID = '6ab7c235bf916b34dfda543c';

const SALES_FIELD_IDS = new Set(SALES_FIELDS.map((item) => item.id));
// A field shown only when another field has a given value: { columnId, value }.
const SHOW_WHEN = new Map([...SALES_FIELDS, ...RECEPTION_FIELDS].filter((item) => item.showWhen).map((item) => [item.id, item.showWhen]));
const showWhenOf = (id) => SHOW_WHEN.get(String(id)) || null;
const RECEPTION_FIELD_IDS = new Set(RECEPTION_FIELDS.map((item) => item.id));
const isFixedSalesColumn = (id) => SALES_FIELD_IDS.has(String(id));
const isFixedReceptionColumn = (id) => RECEPTION_FIELD_IDS.has(String(id));

const fixedMessage = 'These fields are fixed. Ask the developer to change them.';

// Makes the database copy of the fixed fields identical to the lists above. Safe to run on every start:
// it only touches these ids, never any saved appointment value.
const syncFixedColumns = async ({ SalesColumn, ManagementColumn } = {}) => {
  const Sales = SalesColumn || require('../models/SalesSheetColumn');
  const Management = ManagementColumn || require('../models/AppointmentManagementColumn');
  const system = new mongoose.Types.ObjectId('000000000000000000000000');
  const sync = async (Model, list, extra = {}) => {
    await Promise.all(list.map((item) => Model.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(item.id) },
      {
        $set: { label: item.label, type: item.type, options: item.options, section: item.section, required: item.required, order: item.order, isActive: true, ...extra },
        $setOnInsert: { createdBy: system, createdAt: new Date() },
        $currentDate: { updatedAt: true },
      },
      { upsert: true },
    )));
  };
  await sync(Sales, SALES_FIELDS);
  await sync(Management, RECEPTION_FIELDS, { highlightValue: '' });
  // Arrival Status: add "Online" next to Arriving / Arrived (only adds the option, never removes or reorders).
  await Management.collection.updateOne({ _id: new mongoose.Types.ObjectId(ARRIVAL_STATUS_ID) }, { $addToSet: { options: 'Online' } });
};

module.exports = { SALES_FIELDS, RECEPTION_FIELDS, showWhenOf, isFixedSalesColumn, isFixedReceptionColumn, fixedMessage, syncFixedColumns };
