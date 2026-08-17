import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001');

// This is the normal application Socket.IO connection. It intentionally does not
// carry Yjs updates; document sync remains exclusively in useYjsRoom.
export function useChatSocket(roomId, displayName, userId, { onMemberUpdated, onMemberRemoved, onRoomRemoved } = {}) {
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);
  const callbacksRef = useRef({ onMemberUpdated, onMemberRemoved, onRoomRemoved });

  useEffect(() => {
    callbacksRef.current = { onMemberUpdated, onMemberRemoved, onRoomRemoved };
  }, [onMemberUpdated, onMemberRemoved, onRoomRemoved]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const onConnect = () => { 
      setConnected(true); 
      socket.emit('room:join', { roomId, userId }); 
    };
    const onCount = ({ count }) => setPeerCount(count);
    const onMessage = message => {
      if (message && message.text) {
        setMessages(previous => [...previous, { message: message.text, user: message.user, ts: message.ts }]);
      }
    };
    const onMemberUpd = data => callbacksRef.current.onMemberUpdated?.(data);
    const onMemberRem = data => callbacksRef.current.onMemberRemoved?.(data);
    const onRoomRem = data => callbacksRef.current.onRoomRemoved?.(data);

    socket.on('connect', onConnect);
    socket.on('reconnect', onConnect);
    socket.on('room:count', onCount);
    socket.on('chat:message', onMessage);
    socket.on('room:member-updated', onMemberUpd);
    socket.on('room:member-removed', onMemberRem);
    socket.on('room:removed', onRoomRem);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('reconnect', onConnect);
      socket.off('room:count', onCount);
      socket.off('chat:message', onMessage);
      socket.off('room:member-updated', onMemberUpd);
      socket.off('room:member-removed', onMemberRem);
      socket.off('room:removed', onRoomRem);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, userId]);

  const sendMessage = text => {
    if (text?.trim() && socketRef.current) {
      socketRef.current.emit('chat:message', { roomId, user: displayName, text: text.trim() });
    }
  };
  return { connected, peerCount, messages, sendMessage };
}
