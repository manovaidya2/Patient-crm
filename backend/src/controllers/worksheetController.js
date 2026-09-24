const ExcelJS = require('exceljs');
const User = require('../models/User');
const WorksheetColumn = require('../models/WorksheetColumn');
const WorksheetManualRow = require('../models/WorksheetManualRow');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS } = require('../constants/roles');

const WORKSHEET_ROLES = [ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.MANAGER];
const VIEWER_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_COLUMNS = 60;

const DEFAULT_COLUMNS = [
  { label: 'Date', key: 'date', type: 'date' },
  { label: 'Patient', key: 'patient', type: 'text' },
  { label: 'Work', key: 'work', type: 'text' },
  { label: 'Details', key: 'details', type: 'text' },
];

// The old global unique index on `key` must go now that columns are per-user.
WorksheetColumn.syncIndexes().catch((error) => {
  console.error('WorksheetColumn index sync failed:', error.message);
});

const toLocalDate = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const startOfDay = (value) => {
  const date = toLocalDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = toLocalDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const pad = (number) => String(number).padStart(2, '0');
const toIsoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Accepts ISO, dd/mm/yyyy, dd-mm-yyyy or a real Date; returns yyyy-mm-dd or '' when not a date.
const normalizeDateText = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : toIsoDay(value);
  const text = String(value ?? '').trim();
  if (!text) return '';
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${pad(match[2])}-${pad(match[1])}`;
  }
  return '';
};

const getAllowedUsers = async (user) => {
  if (user.role === ROLES.ASSISTANT_DOCTOR || user.role === ROLES.PSYCHOLOGIST) {
    return [{ id: user._id, name: user.name, role: user.role, roleLabel: ROLE_LABELS[user.role] || user.role }];
  }

  const roles = user.role === ROLES.MANAGER
    ? [ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST]
    : WORKSHEET_ROLES;

  const users = await User.find({ role: { $in: roles }, isActive: true })
    .select('name role')
    .sort({ role: 1, name: 1 });

  return users.map((row) => ({
    id: row._id,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
  }));
};

const findAllowedUser = (allowedUsers, userId) =>
  allowedUsers.find((user) => String(user.id) === String(userId));

const slugify = (label) =>
  String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const uniqueKey = (label, takenKeys) => {
  const base = `col_${slugify(label) || 'column'}`;
  let key = base;
  let counter = 2;
  while (takenKeys.has(key)) {
    key = `${base}_${counter}`;
    counter += 1;
  }
  takenKeys.add(key);
  return key;
};

const ownedColumnsFilter = (ownerId) => ({
  $or: [
    { user: ownerId },
    { user: null, createdBy: ownerId },
  ],
});

// Columns owned by this worksheet user. Old shared columns stay with whoever created them.
const loadColumns = async (worksheetUser) => {
  let columns = await WorksheetColumn.find(ownedColumnsFilter(worksheetUser.id)).sort({ order: 1, createdAt: 1 });

  if (!columns.some((column) => column.user)) {
    try {
      await WorksheetColumn.insertMany(
        DEFAULT_COLUMNS.map((column, index) => ({
          ...column,
          user: worksheetUser.id,
          order: index,
          createdBy: worksheetUser.id,
          createdByName: worksheetUser.name,
        })),
        { ordered: false }
      );
    } catch (error) {
      // A parallel request may have seeded the defaults already.
    }
    columns = await WorksheetColumn.find(ownedColumnsFilter(worksheetUser.id)).sort({ order: 1, createdAt: 1 });
  }

  return columns;
};

const formatColumn = (column) => ({
  id: column._id,
  key: column.key,
  label: column.label,
  type: column.type || 'text',
});

// Old rows stored Date/Patient/Work/Details as fixed fields; surface them in the matching default columns.
const rowValues = (row) => {
  const values = { ...(row.customValues || {}) };
  // Rows saved by the new sheet always use default/col_ keys; only pre-redesign rows (empty or custom_ keys) need the fallback.
  if (Object.keys(values).some((key) => !key.startsWith('custom_'))) return values;
  const legacy = {
    date: row.workDate ? toIsoDay(new Date(row.workDate)) : '',
    patient: [row.patientCode, row.patientName].filter(Boolean).join(' - '),
    work: row.workType || '',
    details: row.details || '',
  };
  Object.entries(legacy).forEach(([key, value]) => {
    if (values[key] === undefined && value) values[key] = value;
  });
  return values;
};

const formatRow = (row) => ({
  id: row._id,
  userId: row.user,
  values: rowValues(row),
  source: row.source || 'manual',
  createdAt: row.workDate || row.createdAt,
  savedAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const cleanValues = (input, columns) => {
  const allowedKeys = new Set(columns.map((column) => column.key));
  const values = {};
  Object.entries(input && typeof input === 'object' ? input : {}).forEach(([key, value]) => {
    if (!allowedKeys.has(key)) return;
    const text = value instanceof Date ? toIsoDay(value) : String(value ?? '').trim();
    if (text) values[key] = text.slice(0, 2000);
  });
  return values;
};

// Keeps the fixed fields the CRM assistant reads in step with the free-form values.
const legacyFieldsFrom = (values, columns) => {
  const dateColumn = columns.find((column) => column.type === 'date' && values[column.key]);
  const parsedDate = dateColumn ? normalizeDateText(values[dateColumn.key]) : '';
  const filled = columns.filter((column) => values[column.key]);
  const workColumn = filled.find((column) => column.type !== 'date') || filled[0];
  return {
    workDate: parsedDate ? toLocalDate(parsedDate) : new Date(),
    workType: workColumn ? String(values[workColumn.key]).slice(0, 200) : '',
    details: filled.map((column) => `${column.label}: ${values[column.key]}`).join(' | ').slice(0, 2000),
  };
};

const ensureViewer = (req, res, action) => {
  if (VIEWER_ROLES.includes(req.user.role)) return true;
  res.status(403).json({ success: false, message: `You do not have permission to ${action}` });
  return false;
};

const resolveWorksheetUser = async (req, res, requestedUserId) => {
  const allowedUsers = await getAllowedUsers(req.user);
  const worksheetUser = requestedUserId
    ? findAllowedUser(allowedUsers, requestedUserId)
    : findAllowedUser(allowedUsers, req.user._id) || (allowedUsers.length === 1 ? allowedUsers[0] : null);
  if (!worksheetUser) {
    res.status(403).json({ success: false, message: 'You cannot change this worksheet' });
    return { allowedUsers, worksheetUser: null };
  }
  return { allowedUsers, worksheetUser };
};

const getWorksheet = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'view worksheet')) return;

  const dateMode = req.query.dateMode === 'day' ? 'day' : 'all';
  const dateValue = req.query.date || new Date();
  const dateRange = dateMode === 'all' ? null : { start: startOfDay(dateValue), end: endOfDay(dateValue) };

  const allowedUsers = await getAllowedUsers(req.user);
  const selectedUser =
    findAllowedUser(allowedUsers, req.query.userId) ||
    findAllowedUser(allowedUsers, req.user._id) ||
    allowedUsers[0] ||
    null;

  const countMatch = {
    user: { $in: allowedUsers.map((user) => user.id) },
    ...(dateRange ? { workDate: { $gte: dateRange.start, $lte: dateRange.end } } : {}),
  };
  const counts = await WorksheetManualRow.aggregate([
    { $match: countMatch },
    { $group: { _id: '$user', count: { $sum: 1 } } },
  ]);
  const countByUser = new Map(counts.map((entry) => [String(entry._id), entry.count]));

  const tabs = allowedUsers.map((user) => ({
    id: String(user.id),
    name: user.name,
    role: user.role,
    roleLabel: user.roleLabel,
    count: countByUser.get(String(user.id)) || 0,
  }));

  if (!selectedUser) {
    return res.status(200).json({ success: true, dateMode, date: null, tabs, selectedUserId: '', columns: [], rows: [] });
  }

  const [columns, rows] = await Promise.all([
    loadColumns(selectedUser),
    WorksheetManualRow.find({
      user: selectedUser.id,
      ...(dateRange ? { workDate: { $gte: dateRange.start, $lte: dateRange.end } } : {}),
    }).sort({ workDate: -1, createdAt: -1 }),
  ]);

  res.status(200).json({
    success: true,
    dateMode,
    date: dateMode === 'all' ? null : startOfDay(dateValue),
    tabs,
    selectedUserId: String(selectedUser.id),
    columns: columns.map(formatColumn),
    rows: rows.map(formatRow),
  });
});

const createWorksheetColumn = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'add worksheet columns')) return;
  const { worksheetUser } = await resolveWorksheetUser(req, res, req.body.userId);
  if (!worksheetUser) return;

  const label = String(req.body.label || '').trim().slice(0, 80);
  if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });

  const columns = await loadColumns(worksheetUser);
  if (columns.some((column) => column.label.toLowerCase() === label.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'This worksheet already has a column with this name' });
  }

  const column = await WorksheetColumn.create({
    user: worksheetUser.id,
    label,
    key: uniqueKey(label, new Set(columns.map((item) => item.key))),
    type: req.body.type === 'date' ? 'date' : 'text',
    order: columns.length,
    createdBy: req.user._id,
    createdByName: req.user.name,
  });

  res.status(201).json({ success: true, column: formatColumn(column) });
});

const findOwnedColumn = async (req, res) => {
  const column = await WorksheetColumn.findById(req.params.id);
  if (!column) {
    res.status(404).json({ success: false, message: 'Column not found' });
    return null;
  }
  const ownerId = column.user || column.createdBy;
  const allowedUsers = await getAllowedUsers(req.user);
  if (!ownerId || !findAllowedUser(allowedUsers, ownerId)) {
    res.status(403).json({ success: false, message: 'You cannot change this column' });
    return null;
  }
  return { column, ownerId };
};

const updateWorksheetColumn = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'edit worksheet columns')) return;
  const found = await findOwnedColumn(req, res);
  if (!found) return;

  const label = String(req.body.label || '').trim().slice(0, 80);
  if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });

  const siblings = await WorksheetColumn.find({
    _id: { $ne: found.column._id },
    ...ownedColumnsFilter(found.ownerId),
  }).select('label');
  if (siblings.some((column) => column.label.toLowerCase() === label.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'This worksheet already has a column with this name' });
  }

  found.column.label = label;
  if (req.body.type === 'date' || req.body.type === 'text') found.column.type = req.body.type;
  if (!found.column.user) found.column.user = found.ownerId;
  await found.column.save();
  res.status(200).json({ success: true, column: formatColumn(found.column) });
});

const deleteWorksheetColumn = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'delete worksheet columns')) return;
  const found = await findOwnedColumn(req, res);
  if (!found) return;

  await WorksheetManualRow.updateMany(
    { user: found.ownerId },
    { $unset: { [`customValues.${found.column.key}`]: '' } }
  );
  await found.column.deleteOne();
  res.status(200).json({ success: true });
});

const createManualWorksheetRow = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'add worksheet rows')) return;
  const { worksheetUser } = await resolveWorksheetUser(req, res, req.body.userId);
  if (!worksheetUser) return;

  const columns = await loadColumns(worksheetUser);
  const values = cleanValues(req.body.values, columns);
  if (!Object.keys(values).length) {
    return res.status(400).json({ success: false, message: 'Fill at least one column' });
  }

  const row = await WorksheetManualRow.create({
    user: worksheetUser.id,
    userName: worksheetUser.name,
    userRole: worksheetUser.role,
    ...legacyFieldsFrom(values, columns),
    customValues: values,
    source: 'manual',
    createdBy: req.user._id,
    createdByName: req.user.name,
  });

  res.status(201).json({ success: true, row: formatRow(row) });
});

const findOwnedRow = async (req, res) => {
  const row = await WorksheetManualRow.findById(req.params.id);
  if (!row) {
    res.status(404).json({ success: false, message: 'Row not found' });
    return null;
  }
  const allowedUsers = await getAllowedUsers(req.user);
  const worksheetUser = findAllowedUser(allowedUsers, row.user);
  if (!worksheetUser) {
    res.status(403).json({ success: false, message: 'You cannot change this row' });
    return null;
  }
  return { row, worksheetUser };
};

const updateWorksheetRow = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'edit worksheet rows')) return;
  const found = await findOwnedRow(req, res);
  if (!found) return;

  const columns = await loadColumns(found.worksheetUser);
  const values = cleanValues(req.body.values, columns);
  if (!Object.keys(values).length) {
    return res.status(400).json({ success: false, message: 'Fill at least one column' });
  }

  Object.assign(found.row, legacyFieldsFrom(values, columns), {
    patientName: '',
    patientCode: '',
    customValues: values,
  });
  found.row.markModified('customValues');
  await found.row.save();
  res.status(200).json({ success: true, row: formatRow(found.row) });
});

const deleteWorksheetRow = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'delete worksheet rows')) return;
  const found = await findOwnedRow(req, res);
  if (!found) return;
  await found.row.deleteOne();
  res.status(200).json({ success: true });
});

// ---------- CSV / Excel import ----------

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^﻿/, '');

  // Google Sheets/Excel exports use a comma, but some regional Excel exports use ; or tab.
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t']
    .map((char) => ({ char, count: firstLine.split(char).length }))
    .sort((a, b) => b.count - a.count)[0].char;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const excelCellToText = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return toIsoDay(value);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return excelCellToText(value.result);
    if (value.hyperlink) return String(value.hyperlink);
    return '';
  }
  return String(value);
};

const parseExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find((item) => item.rowCount > 0);
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      cells.push(excelCellToText(row.getCell(column).value));
    }
    rows.push(cells);
  });
  return rows;
};

const importWorksheet = asyncHandler(async (req, res) => {
  if (!ensureViewer(req, res, 'import worksheet rows')) return;
  const { worksheetUser } = await resolveWorksheetUser(req, res, req.body.userId);
  if (!worksheetUser) return;

  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a CSV or Excel file first' });

  const fileName = String(req.file.originalname || '').toLowerCase();
  let matrix;
  try {
    if (fileName.endsWith('.xlsx')) matrix = await parseExcel(req.file.buffer);
    else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) matrix = parseCsv(req.file.buffer.toString('utf8'));
    else {
      return res.status(400).json({
        success: false,
        message: 'Only .csv or .xlsx files are supported. For an old .xls file or a Google Sheet, use File > Download > CSV / Excel (.xlsx).',
      });
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Could not read this file. Please check it is a valid CSV or .xlsx file.' });
  }

  matrix = matrix
    .map((cells) => cells.map((cell) => String(cell ?? '').trim()))
    .filter((cells) => cells.some(Boolean));
  if (matrix.length < 2) {
    return res.status(400).json({ success: false, message: 'The file needs a header row and at least one data row' });
  }
  if (matrix.length - 1 > MAX_IMPORT_ROWS) {
    return res.status(400).json({ success: false, message: `A file can have at most ${MAX_IMPORT_ROWS} rows` });
  }

  const headers = matrix[0];
  const columns = await loadColumns(worksheetUser);
  const takenKeys = new Set(columns.map((column) => column.key));
  const byLabel = new Map(columns.map((column) => [column.label.toLowerCase(), column]));
  const seenHeaders = new Set();
  const headerColumns = [];
  const newColumns = [];

  for (let index = 0; index < headers.length; index += 1) {
    const label = headers[index].slice(0, 80);
    const lower = label.toLowerCase();
    if (!label || seenHeaders.has(lower)) {
      headerColumns.push(null);
      continue;
    }
    seenHeaders.add(lower);

    let column = byLabel.get(lower);
    if (!column) {
      if (columns.length + newColumns.length >= MAX_IMPORT_COLUMNS) {
        return res.status(400).json({ success: false, message: `A worksheet can have at most ${MAX_IMPORT_COLUMNS} columns` });
      }
      column = {
        user: worksheetUser.id,
        label,
        key: uniqueKey(label, takenKeys),
        type: /date|tarikh/i.test(label) ? 'date' : 'text',
        order: columns.length + newColumns.length,
        createdBy: req.user._id,
        createdByName: req.user.name,
      };
      newColumns.push(column);
      byLabel.set(lower, column);
    }
    headerColumns.push(column);
  }

  const created = newColumns.length ? await WorksheetColumn.insertMany(newColumns) : [];
  const allColumns = [...columns, ...created];
  const typeByKey = new Map(allColumns.map((column) => [column.key, column.type]));

  const docs = [];
  matrix.slice(1).forEach((cells) => {
    const values = {};
    headerColumns.forEach((column, index) => {
      const raw = cells[index];
      if (!column || !raw) return;
      const dateText = typeByKey.get(column.key) === 'date' ? normalizeDateText(raw) : '';
      values[column.key] = (dateText || raw).slice(0, 2000);
    });
    if (!Object.keys(values).length) return;
    docs.push({
      user: worksheetUser.id,
      userName: worksheetUser.name,
      userRole: worksheetUser.role,
      ...legacyFieldsFrom(values, allColumns),
      customValues: values,
      source: 'import',
      createdBy: req.user._id,
      createdByName: req.user.name,
    });
  });

  if (!docs.length) return res.status(400).json({ success: false, message: 'No data rows found in the file' });
  await WorksheetManualRow.insertMany(docs);

  res.status(201).json({
    success: true,
    importedRows: docs.length,
    newColumns: created.map((column) => column.label),
  });
});

module.exports = {
  getWorksheet,
  createWorksheetColumn,
  updateWorksheetColumn,
  deleteWorksheetColumn,
  createManualWorksheetRow,
  updateWorksheetRow,
  deleteWorksheetRow,
  importWorksheet,
};
