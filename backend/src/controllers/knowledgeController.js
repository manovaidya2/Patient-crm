const KnowledgeArticle = require('../models/KnowledgeArticle');
const KnowledgeCategory = require('../models/KnowledgeCategory');
const { asyncHandler } = require('../middleware/errorHandler');

const serialize = (article) => ({
  id: String(article._id), question: article.question, answer: article.answer, category: article.category,
  categoryId: article.categoryId ? String(article.categoryId) : '',
  createdByName: article.createdByName, updatedByName: article.updatedByName,
  createdAt: article.createdAt, updatedAt: article.updatedAt,
});

const listCategories = asyncHandler(async (req, res) => {
  const categories = await KnowledgeCategory.find().sort({ name: 1 }).lean();
  const counts = await KnowledgeArticle.aggregate([{ $match: { categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
  res.json({ success: true, categories: categories.map((category) => ({ id: String(category._id), name: category.name, count: countMap.get(String(category._id)) || 0 })) });
});

const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });
  const category = await KnowledgeCategory.create({ name, createdBy: req.user._id, createdByName: req.user.name });
  res.status(201).json({ success: true, category: { id: String(category._id), name: category.name, count: 0 } });
});

const removeCategory = asyncHandler(async (req, res) => {
  const count = await KnowledgeArticle.countDocuments({ categoryId: req.params.id });
  if (count) return res.status(400).json({ success: false, message: 'Move or remove the questions in this category first' });
  const category = await KnowledgeCategory.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true });
});

const list = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const filter = {};
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  if (search) filter.$or = [{ question: { $regex: search, $options: 'i' } }, { answer: { $regex: search, $options: 'i' } }, { category: { $regex: search, $options: 'i' } }];
  const articles = await KnowledgeArticle.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, articles: articles.map(serialize) });
});

const create = asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').trim();
  const answer = String(req.body.answer || '').trim();
  if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  const categoryId = String(req.body.categoryId || '').trim() || null;
  const category = categoryId ? await KnowledgeCategory.findById(categoryId) : null;
  if (categoryId && !category) return res.status(400).json({ success: false, message: 'Select a valid category' });
  const article = await KnowledgeArticle.create({ question, answer, category: category?.name || String(req.body.category || '').trim(), categoryId: category?._id || null, createdBy: req.user._id, createdByName: req.user.name, updatedByName: req.user.name });
  res.status(201).json({ success: true, article: serialize(article) });
});

const update = asyncHandler(async (req, res) => {
  const article = await KnowledgeArticle.findById(req.params.id);
  if (!article) return res.status(404).json({ success: false, message: 'Knowledge article not found' });
  if (req.body.question !== undefined) article.question = String(req.body.question || '').trim();
  if (req.body.answer !== undefined) article.answer = String(req.body.answer || '').trim();
  if (req.body.category !== undefined) article.category = String(req.body.category || '').trim();
  if (req.body.categoryId !== undefined) {
    const categoryId = String(req.body.categoryId || '').trim() || null;
    const category = categoryId ? await KnowledgeCategory.findById(categoryId) : null;
    if (categoryId && !category) return res.status(400).json({ success: false, message: 'Select a valid category' });
    article.categoryId = category?._id || null;
    article.category = category?.name || article.category;
  }
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

module.exports = { list, listCategories, createCategory, removeCategory, create, update, remove };
