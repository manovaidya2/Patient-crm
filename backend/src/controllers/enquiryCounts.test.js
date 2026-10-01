const { test } = require('node:test');
const assert = require('node:assert/strict');
const Enquiry = require('../models/Enquiry');
const { list } = require('./enquiryController');
const { ROLES } = require('../constants/roles');
test('cards count the full selected view, independently of status and pagination', async () => {
  const originalFind = Enquiry.find;
  const originalCount = Enquiry.countDocuments;
  try {
    for (const [role, view] of [[ROLES.RECEPTIONIST, 'assigned'], [ROLES.PSYCHOLOGIST, 'created'], [ROLES.ADMIN, 'following']]) {
      let rowFilter; let skipped;
      Enquiry.find = (filter) => {
        rowFilter = filter;
        const chain = { select() { return this; }, sort() { return this; }, skip(value) { skipped = value; return this; }, limit() { return this; }, lean: async () => [] };
        return chain;
      };
      Enquiry.countDocuments = async (filter) => {
        assert.equal(filter.deletedAt, null);
        assert.ok(filter.$or, 'search applies to counts too');
        if (role !== ROLES.ADMIN) assert.equal(filter.participants, 'user1');
        else assert.equal(filter.participants, undefined);
        if (view === 'assigned') assert.equal(filter.assignedTo, 'user1');
        if (view === 'created') assert.equal(filter.createdBy, 'user1');
        return { open: 35, in_progress: 4, resolved: 2, closed: 8 }[filter.status];
      };
      let result;
      await list({ user: { _id: 'user1', role }, query: { view, status: 'closed', page: '2', search: 'Patient' } }, { json(data) { result = data; } }, (error) => { throw error; });
      assert.equal(rowFilter.status, 'closed');
      assert.equal(skipped, 25);
      assert.deepEqual(result.summary, { open: 35, in_progress: 4, resolved: 2, closed: 8, total: 49 });
      assert.equal(result.total, 8);
    }
  } finally { Enquiry.find = originalFind; Enquiry.countDocuments = originalCount; }
});
