const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('./hrRoutes');

const routePaths = () => router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

test('phase 3 operational routes are mounted under the protected HR router', () => {
  const routes = routePaths();
  for (const expected of [
    'GET /operations/summary', 'GET /employees', 'POST /employees', 'GET /attendance', 'POST /attendance',
    'GET /leaves', 'POST /leaves/:id/status', 'GET /holidays', 'GET /training', 'PATCH /training/:id/participants/:employeeId',
    'GET /policies', 'POST /policies/:id/status',
  ]) assert.ok(routes.includes(expected), expected);
});
