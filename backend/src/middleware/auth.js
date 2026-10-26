const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isRetiredRole } = require('../constants/roles');
const { tokenStillValid, PASSWORD_CHANGED_MESSAGE } = require('../utils/sessionGuard');
const { attachCrmAudit } = require('./crmAudit');

// Verifies the JWT and attaches the logged-in user to req.user
const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    // Logged out here because the password was changed (on this or another device).
    if (!tokenStillValid(user, decoded)) {
      return res.status(401).json({ success: false, message: PASSWORD_CHANGED_MESSAGE, reason: 'password_changed' });
    }

    if (isRetiredRole(user.role)) {
      return res.status(403).json({ success: false, message: 'The Psychologist role has been retired. Family sessions are now done by the PCC. Ask the admin to give your account a new role.' });
    }

    req.user = user;
    attachCrmAudit(req, res);
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

// Restricts a route to specific roles, e.g. authorize('admin')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    next();
  };
};

module.exports = { protect, authorize };
