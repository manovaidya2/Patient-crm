import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// Calls `handler(payload)` whenever the server emits `event`, and once on (re)connect so nothing missed while offline
// stays stale. The handler can change between renders without reconnecting.
export default function useLiveEvent(event, handler) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; }, [handler]);
  useEffect(() => {
    const socket = io(socketUrl, { auth: { token: localStorage.getItem('crm_token') }, transports: ['websocket', 'polling'] });
    socket.on(event, (payload) => ref.current?.(payload));
    socket.on('connect', () => ref.current?.(null));
    return () => socket.disconnect();
  }, [event]);
}
