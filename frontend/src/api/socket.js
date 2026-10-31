import { io } from 'socket.io-client';

// One live connection for the whole app (the bell, notifications, the chat and the pages all listen on it), instead
// of a new connection per widget. It is remade when the login changes and closed on logout.
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
let socket = null;
let token = null;

export const getSocket = () => {
  const current = localStorage.getItem('crm_token');
  if (socket && token === current) return socket;
  socket?.disconnect();
  token = current;
  socket = io(socketUrl, { auth: { token: current }, transports: ['websocket', 'polling'] });
  return socket;
};

window.addEventListener('crm:logout', () => { socket?.disconnect(); socket = null; token = null; });
