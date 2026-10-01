const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, CREATABLE_ROLES } = require('../constants/roles');
const { departmentForRole, resolveDepartment, departmentFilter, DEPARTMENTS } = require('../constants/knowledgeDepartments');
const Category = require('../models/KnowledgeCategory');
const Article = require('../models/KnowledgeArticle');
const controller = require('./knowledgeController');

test('every staff role gets one library; only psychologist and assistant doctor share', () => {
  assert.equal(DEPARTMENTS.length, CREATABLE_ROLES.length - 1);
  for (const role of CREATABLE_ROLES) {
    const own = departmentForRole(role);
    assert.equal(resolveDepartment({ user: { role }, query: {} }), own);
    for (const other of DEPARTMENTS.filter((value) => value !== own)) {
      assert.throws(() => resolveDepartment({ user: { role }, query: { department: other } }), { statusCode: 403 });
      assert.throws(() => resolveDepartment({ user: { role }, body: { department: other } }), { statusCode: 403 });
    }
  }
  assert.equal(departmentForRole(ROLES.PSYCHOLOGIST), ROLES.ASSISTANT_DOCTOR);
  for (const department of DEPARTMENTS) assert.equal(resolveDepartment({ user: { role: ROLES.ADMIN }, query: { department } }), department);
  assert.throws(() => resolveDepartment({ user: { role: ROLES.ADMIN }, query: { department: 'admin' } }), { statusCode: 400 });
});

test('legacy documents are only included in reception filter', () => {
  assert.ok(departmentFilter(ROLES.RECEPTIONIST).$or.some((item) => item.department?.$exists === false));
  assert.deepEqual(departmentFilter(ROLES.ACCOUNTANT), { department: ROLES.ACCOUNTANT });
});

test('article list scopes search to department instead of replacing its filter', async () => {
  const original = Article.find;
  let filter;
  Article.find = (value) => { filter = value; return { sort: () => ({ lean: async () => [] }) }; };
  try {
    await controller.list({ user: { role: ROLES.RECEPTIONIST }, query: { search: '[test]' } }, { json() {} }, (err) => { throw err; });
    assert.ok(filter.$or);
    assert.equal(filter.$and[0].$or[0].question.$regex, '\\[test\\]');
  } finally { Article.find = original; }
});

test('creating a question cannot target another department category', async () => {
  const originalFind = Category.findOne;
  const originalCreate = Article.create;
  let created = false;
  Category.findOne = async (filter) => { assert.equal(filter.department, ROLES.MEDICINE_DEPARTMENT); return null; };
  Article.create = async () => { created = true; };
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
  try {
    await controller.create({ user: { role: ROLES.MEDICINE_DEPARTMENT }, query: {}, body: { question: 'Q', answer: 'A', categoryId: 'other' } }, response, (err) => { throw err; });
    assert.equal(response.statusCode, 400);
    assert.equal(created, false);
  } finally { Category.findOne = originalFind; Article.create = originalCreate; }
});
