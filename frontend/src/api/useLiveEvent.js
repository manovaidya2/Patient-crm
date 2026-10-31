import { useEffect, useRef } from 'react';
import { getSocket } from './socket.js';

// Calls `handler(payload)` whenever the server emits `event` on the app's shared live connection, and on every
// (re)connect so nothing missed while offline stays stale. The handler can change between renders.
export default function useLiveEvent(event, handler) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; }, [handler]);
  useEffect(() => {
    const socket = getSocket();
    const onEvent = (payload) => ref.current?.(payload);
    const onConnect = () => ref.current?.(null);
    socket.on(event, onEvent);
    socket.on('connect', onConnect);
    return () => { socket.off(event, onEvent); socket.off('connect', onConnect); };
  }, [event]);
}
