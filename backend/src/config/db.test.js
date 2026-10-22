const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateLegacyAccountants } = require('./db');

test('legacy courier users migrate to In Transit without changing other roles', async () => {
  const writes = [];
  const connection = { collection: name => ({
    updateMany: async (filter, update) => { writes.push({ name, filter, update }); return { modifiedCount: 1 }; },
    find: () => ({ toArray: async () => [] }),
  }) };
  await migrateLegacyAccountants(connection, 'dispatch_courier', 'in_transit');
  assert.deepEqual(writes[0].filter, { role: 'dispatch_courier' });
  assert.equal(writes[0].update.$set.role, 'in_transit');
});

test('legacy accountant users are migrated to receptionist', async () => {
  const writes = [];
  const oldCategory = { _id: 'old', name: 'Billing', department: 'accountant' };
  const existingCategory = { _id: 'existing', name: 'Billing', department: 'receptionist' };
  const connection = {
    collection(name) {
      return {
        find(filter) {
          assert.equal(name, 'knowledgecategories');
          assert.deepEqual(filter, { department: 'accountant' });
          return { toArray: async () => [oldCategory] };
        },
        async findOne(filter) {
          assert.equal(name, 'knowledgecategories');
          assert.deepEqual(filter, { department: 'receptionist', name: 'Billing' });
          return existingCategory;
        },
        async updateMany(nextFilter, nextUpdate) {
          writes.push({ name, filter: nextFilter, update: nextUpdate });
          return { modifiedCount: name === 'users' ? 2 : 1 };
        },
        async updateOne() { throw new Error('duplicate category should be merged instead of renamed'); },
        async deleteOne(filter) {
          assert.equal(name, 'knowledgecategories');
          assert.deepEqual(filter, { _id: oldCategory._id });
          return { deletedCount: 1 };
        },
      };
    },
  };

  const result = await migrateLegacyAccountants(connection);
  assert.deepEqual(writes.map((write) => write.name), ['users', 'knowledgearticles', 'knowledgearticles']);
  assert.deepEqual(writes[0].filter, { role: 'accountant' });
  assert.equal(writes[0].update.$set.role, 'receptionist');
  for (const write of writes) assert.ok(write.update.$set.updatedAt instanceof Date);
  assert.deepEqual(writes[1].filter, { categoryId: oldCategory._id });
  assert.equal(writes[1].update.$set.categoryId, existingCategory._id);
  assert.deepEqual(writes[2].filter, { department: 'accountant' });
  assert.deepEqual(result, { users: 2, knowledgeCategories: 0, knowledgeArticles: 2, modifiedCount: 4 });
});
