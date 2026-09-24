const KnowledgeArticle = require('../models/KnowledgeArticle');
const { asyncHandler } = require('../middleware/errorHandler');

const serialize = (article) => ({
  id: String(article._id), question: article.question, answer: article.answer, category: article.category,
  createdByName: article.createdByName, updatedByName: article.updatedByName,
  createdAt: article.createdAt, updatedAt: article.updatedAt,
});

const list = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const filter = search ? { $or: [{ question: { $regex: search, $options: 'i' } }, { answer: { $regex: search, $options: 'i' } }, { category: { $regex: search, $options: 'i' } }] } : {};
  const articles = await KnowledgeArticle.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, articles: articles.map(serialize) });
});

const create = asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').trim();
  const answer = String(req.body.answer || '').trim();
  if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  const article = await KnowledgeArticle.create({ question, answer, category: String(req.body.category || '').trim(), createdBy: req.user._id, createdByName: req.user.name, updatedByName: req.user.name });
  res.status(201).json({ success: true, article: serialize(article) });
});

const update = asyncHandler(async (req, res) => {
  const article = await KnowledgeArticle.findById(req.params.id);
  if (!article) return res.status(404).json({ success: false, message: 'Knowledge article not found' });
  if (req.body.question !== undefined) article.question = String(req.body.question || '').trim();
  if (req.body.answer !== undefined) article.answer = String(req.body.answer || '').trim();
  if (req.body.category !== undefined) article.category = String(req.body.category || '').trim();
  if (!article.question || !article.answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  article.updatedByName = req.user.name;
  await article.save();
  res.json({ success: true, article: serialize(article) });
});

const remove = asyncHandler(async (req, res) => {
  const article = await KnowledgeArticle.findByIdAndDelete(req.params.id);
  if (!article) return res.status(404).json({ success: false, message: 'Knowledge article not found' });
  res.json({ success: true });
});

module.exports = { list, create, update, remove };
