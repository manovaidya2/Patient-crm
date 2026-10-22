const mongoose = require('mongoose');

const migrateLegacyAccountants = async (connection, oldRole = 'accountant', newRole = 'receptionist') => {
  const updatedAt = new Date();
  const usersCollection = connection.collection('users');
  const categoriesCollection = connection.collection('knowledgecategories');
  const articlesCollection = connection.collection('knowledgearticles');
  const users = await usersCollection.updateMany(
    { role: oldRole },
    { $set: { role: newRole, updatedAt } }
  );
  const legacyCategories = await categoriesCollection.find({ department: oldRole }).toArray();
  let knowledgeCategories = 0;
  let knowledgeArticles = 0;
  for (const category of legacyCategories) {
    const receptionCategory = await categoriesCollection.findOne({ department: newRole, name: category.name });
    if (receptionCategory) {
      const moved = await articlesCollection.updateMany(
        { categoryId: category._id },
        { $set: { categoryId: receptionCategory._id, department: newRole, updatedAt } }
      );
      knowledgeArticles += moved.modifiedCount || 0;
      await categoriesCollection.deleteOne({ _id: category._id });
    } else {
      const moved = await categoriesCollection.updateOne(
        { _id: category._id },
        { $set: { department: newRole, updatedAt } }
      );
      knowledgeCategories += moved.modifiedCount || 0;
    }
  }
  const remainingArticles = await articlesCollection.updateMany(
    { department: oldRole },
    { $set: { department: newRole, updatedAt } }
  );
  knowledgeArticles += remainingArticles.modifiedCount || 0;
  return {
    users: users.modifiedCount || 0,
    knowledgeCategories,
    knowledgeArticles,
    modifiedCount: (users.modifiedCount || 0) + knowledgeCategories + knowledgeArticles,
  };
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    const migration = await migrateLegacyAccountants(conn.connection);
    await migrateLegacyAccountants(conn.connection, 'dispatch_courier', 'in_transit');
    if (migration.modifiedCount) {
      console.log(`Migrated legacy Accountant data to Receptionist: ${migration.users} user(s), ${migration.knowledgeCategories} knowledge category record(s), ${migration.knowledgeArticles} knowledge article(s)`);
    }
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.migrateLegacyAccountants = migrateLegacyAccountants;
