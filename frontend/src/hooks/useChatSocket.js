import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001');

// This is the normal application Socket.IO connection. It intentionally does not
// carry Yjs updates; document sync remains exclusively in useYjsRoom.
export function useChatSocket(roomId, displayName, userId) {
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userId) return;
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    const onConnect = () => { setConnected(true); socket.emit('room:join', { roomId, userId }); };
    const onCount = ({ count }) => setPeerCount(count);
    const onMessage = message => setMessages(previous => [...previous, { message: message.text, user: message.user, ts: message.ts }]);
    socket.on('connect', onConnect); socket.on('room:count', onCount); socket.on('chat:message', onMessage);
    return () => { socket.off('connect', onConnect); socket.off('room:count', onCount); socket.off('chat:message', onMessage); socket.disconnect(); socketRef.current = null; };
  }, [roomId, userId]);

  const sendMessage = text => {
    if (text?.trim()) socketRef.current?.emit('chat:message', { roomId, user: displayName, text: text.trim() });
  };
  return { connected, peerCount, messages, sendMessage };
}
