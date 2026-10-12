const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('./hrRoutes');

const routePaths = () => router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

test('employee operations and lifecycle routes are mounted under the protected HR router', () => {
  const routes = routePaths();
  for (const expected of [
    'GET /operations/summary', 'GET /employees', 'POST /employees', 'DELETE /employees/:id', 'GET /attendance', 'POST /attendance', 'DELETE /attendance/:id',
    'GET /leaves', 'DELETE /leaves/:id', 'POST /leaves/:id/status', 'GET /holidays', 'DELETE /holidays/:id', 'GET /training', 'DELETE /training/:id', 'PATCH /training/:id/participants/:employeeId',
    'GET /policies', 'DELETE /policies/:id', 'POST /policies/:id/status',
    'GET /lifecycle/summary', 'GET /lifecycle/reports/metrics', 'GET /lifecycle/reports/metrics/export', 'GET /lifecycle/reports/export', 'GET /lifecycle/:module', 'POST /lifecycle/:module',
    'PATCH /lifecycle/:module/:id', 'DELETE /lifecycle/:module/:id', 'POST /lifecycle/:module/:id/status',
    'DELETE /requirements/:id', 'DELETE /job-descriptions/:id', 'DELETE /campaigns/:id', 'DELETE /interviews/:id',
    'DELETE /offers/:id', 'PATCH /onboarding/:id', 'DELETE /onboarding/:id', 'DELETE /candidates/:id', 'DELETE /calls/:id',
  ]) assert.ok(routes.includes(expected), expected);
});
