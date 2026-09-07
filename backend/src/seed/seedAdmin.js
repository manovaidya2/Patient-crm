// Run with: npm run seed
// Creates the first Admin login using values from .env (ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD)
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');

const seedAdmin = async () => {
  await connectDB();

  const email = (process.env.ADMIN_EMAIL || 'admin@crm.com').toLowerCase().trim();
  const name = process.env.ADMIN_NAME || 'Super Admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    console.log(`Admin already exists with email: ${email}. Skipping seed.`);
  } else {
    await User.create({
      name,
      email,
      password,
      role: ROLES.ADMIN,
      isActive: true,
    });
    console.log('Admin account created successfully:');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log('Please log in and keep these credentials safe.');
  }

  await mongoose.connection.close();
  process.exit(0);
};

seedAdmin().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
