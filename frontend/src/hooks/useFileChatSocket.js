import { useEffect, useRef, useCallback } from 'react';
import { io as socketIO } from 'socket.io-client';

/**
 * Connects once per mount, but always dispatches to the LATEST versions of
 * the passed callbacks (via refs) — fixes a stale-closure bug where a
 * callback capturing changing state (e.g. activeUserId) would keep using
 * its first-render value for the lifetime of the socket connection.
 */
export default function useFileChatSocket(handlers) {
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // always up to date, no re-subscription needed

  const dispatch = useCallback((name) => (...args) => {
    handlersRef.current?.[name]?.(...args);
  }, []);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
    const token = localStorage.getItem('sfms_token');
    const sock = socketIO(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    socketRef.current = sock;

    const onNewMessage      = dispatch('onNewMessage');
    const onSent            = dispatch('onSent');
    const onSeen            = dispatch('onSeen');
    const onReactionAdded   = dispatch('onReactionAdded');
    const onReactionRemoved = dispatch('onReactionRemoved');
    const onDeleted         = dispatch('onDeleted');
    const onReconnect       = dispatch('onReconnect');

    sock.on('message:new', onNewMessage);
    sock.on('message:sent', onSent);
    sock.on('messages:seen', onSeen);
    sock.on('message:reaction_added', onReactionAdded);
    sock.on('message:reaction_removed', onReactionRemoved);
    sock.on('message:deleted', onDeleted);
    sock.io.on('reconnect', onReconnect);

    return () => { sock.disconnect(); };
  }, [dispatch]);

  return socketRef;
}