const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLES, ALL_ROLES } = require('../constants/roles');

const allowedRoles = [ROLES.ADMIN, ROLES.SALES_TEAM, ROLES.RECEPTIONIST];
const dateRoom = (date) => `sales-sheet:date:${date}`;

const registerSalesSheetSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('role isActive');
      if (!user?.isActive || !ALL_ROLES.includes(user.role)) return next(new Error('Access denied'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`enquiry:user:${socket.user._id}`);
    if (socket.user.role === ROLES.ADMIN) socket.join('enquiry:admins');
    if (!allowedRoles.includes(socket.user.role)) return;
    socket.join('sales-sheet');
    socket.on('sales-sheet:watch-date', (date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
      for (const room of socket.rooms) {
        if (room.startsWith('sales-sheet:date:')) socket.leave(room);
      }
      socket.join(dateRoom(date));
    });
  });
};

module.exports = { registerSalesSheetSocket, dateRoom };
