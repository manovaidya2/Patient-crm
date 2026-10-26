// Logging out everywhere after a password change.
// Every token carries the time it was issued (iat). When a user's password changes, `passwordChangedAt` is set, and
// any token issued before it stops working: the API answers 401 and the other devices are sent to the login page.

// A token is still good if it was issued after the last password change.
const tokenStillValid = (user, decoded) => {
  if (!user?.passwordChangedAt) return true;
  return Number(decoded?.iat || 0) * 1000 >= new Date(user.passwordChangedAt).getTime();
};

// Closes the live (socket) connections of a user, except the one using `keepToken` (the device that made the change).
const dropOtherSockets = (io, userId, keepToken = '') => {
  if (!io?.of) return 0;
  let dropped = 0;
  for (const socket of io.of('/').sockets.values()) {
    if (String(socket.userId || '') === String(userId) && socket.authToken !== keepToken) {
      socket.emit('session:ended', { reason: 'password_changed' });
      socket.disconnect(true);
      dropped += 1;
    }
  }
  return dropped;
};

const PASSWORD_CHANGED_MESSAGE = 'Your password was changed. Please log in again.';

module.exports = { tokenStillValid, dropOtherSockets, PASSWORD_CHANGED_MESSAGE };
