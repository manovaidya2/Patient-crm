const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { STORED_ROLES } = require('../constants/roles');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: STORED_ROLES,
      required: [true, 'Role is required'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // When and by whom the login was turned off (the person is then hidden from every list but stays on old records).
    deactivatedAt: { type: Date, default: null },
    deactivatedByName: { type: String, trim: true, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// When the password last changed: tokens issued before this stop working (logged out on every other device).
userSchema.add({ passwordChangedAt: { type: Date, default: null } });

// Hash password before saving, only if it was modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  // One second back so a token issued right after the change (same second) is still accepted.
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare plain password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};


// Staff pickers: the active people of one role.
userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);
