const DoseTemplate = require('../models/DoseTemplate');
const { asyncHandler } = require('../middleware/errorHandler');

const view = (doc) => ({ id: String(doc._id), text: doc.text });

const listDoseTemplates = asyncHandler(async (req, res) => {
  const templates = await DoseTemplate.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  res.json({ success: true, templates: templates.map(view) });
});

const addDoseTemplate = asyncHandler(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 500) throw Object.assign(new Error('Enter a dose instruction of 1 to 500 characters'), { statusCode: 400 });
  let template;
  try {
    template = await DoseTemplate.findOneAndUpdate({ text }, { $setOnInsert: { text, createdByName: req.user.name } }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    template = await DoseTemplate.findOne({ text });
  }
  res.json({ success: true, template: view(template) });
});

module.exports = { listDoseTemplates, addDoseTemplate };
