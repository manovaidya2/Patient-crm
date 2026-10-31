const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLES, ALL_ROLES } = require('../constants/roles');
const { tokenStillValid } = require('../utils/sessionGuard');

const allowedRoles = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_TEAM, ROLES.RECEPTIONIST];
const dateRoom = (date) => `sales-sheet:date:${date}`;
// Post Counseling Patients: a counselor hears about their own patients, the others about everyone's.
const postCounselingUserRoom = (userId) => `post-counseling:user:${userId}`;
const POST_COUNSELING_ALL_ROOM = 'post-counseling:all';
const postCounselingViewers = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER];
// Medicine fulfilment: everyone who works on or follows a job hears when one changes (e.g. the doctor's sheet edit).
const MEDICINE_JOBS_ROOM = 'medicine-jobs';
const medicineJobViewers = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT, ROLES.IN_TRANSIT];
const emitMedicineJobChanged = (app, jobId) => app?.get?.('io')?.to(MEDICINE_JOBS_ROOM).emit('medicine-job:changed', { id: String(jobId) });

const registerSalesSheetSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('role isActive passwordChangedAt');
      if (!user?.isActive || !ALL_ROLES.includes(user.role)) return next(new Error('Access denied'));
      if (!tokenStillValid(user, decoded)) return next(new Error('Password changed'));
      socket.user = user;
      // Kept so a password change can close this user's other live connections.
      socket.userId = String(user._id);
      socket.authToken = token;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`enquiry:user:${socket.user._id}`);
    if (socket.user.role === ROLES.ADMIN) socket.join('enquiry:admins'); // also gets every Team Chat update
    if (socket.user.role === ROLES.MANAGER) socket.join('enquiry:managers');
    if (socket.user.role === ROLES.POST_COUNSELOR) socket.join(postCounselingUserRoom(socket.user._id));
    if (postCounselingViewers.includes(socket.user.role)) socket.join(POST_COUNSELING_ALL_ROOM);
    if (medicineJobViewers.includes(socket.user.role)) socket.join(MEDICINE_JOBS_ROOM);
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

module.exports = { registerSalesSheetSocket, dateRoom, postCounselingUserRoom, POST_COUNSELING_ALL_ROOM, MEDICINE_JOBS_ROOM, emitMedicineJobChanged };
