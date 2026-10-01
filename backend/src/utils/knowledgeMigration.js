const Category = require('../models/KnowledgeCategory');
const Article = require('../models/KnowledgeArticle');
let ready;
module.exports = function prepareKnowledgeDepartments() {
  if (!ready) ready = (async () => {
    await Category.updateMany({ department: null }, { $set: { department: 'receptionist' } });
    await Article.updateMany({ department: null }, { $set: { department: 'receptionist' } });
    // Replace only the obsolete global-name constraint, never unrelated indexes.
    await Category.collection.createIndex({ department: 1, name: 1 }, { unique: true });
    const indexes = await Category.collection.indexes();
    const old = indexes.find((index) => index.unique && Object.keys(index.key).length === 1 && index.key.name === 1);
    if (old) { try { await Category.collection.dropIndex(old.name); } catch (error) { if (error.code !== 27) throw error; } }
  })().catch((error) => { ready = null; throw error; });
  return ready;
};
