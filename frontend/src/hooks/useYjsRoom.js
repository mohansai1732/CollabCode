import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001' 
  : (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001');

/**
 * One Y.Doc + SocketIOProvider per roomId. Cleans up on room change / unmount.
 */
export function useYjsRoom(roomId) {
  const [state, setState] = useState({
    doc: null,
    provider: null,
    sources: null,
    langs: null,
    synced: false,
  });

  const providerRef = useRef(null);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const doc = new Y.Doc();
    const sources = doc.getMap('sources');
    const langs = doc.getMap('langs');

    console.log(`[Yjs] Connecting to ${SOCKET_URL} for room ${roomId}`);

    const provider = new SocketIOProvider(SOCKET_URL, roomId, doc, {
      disableBc: false, 
      autoConnect: true,
      // Force websocket transport for better production stability on Render
      // and add more connection options
      transports: ['websocket'],
      reconnectionAttempts: 10,
    });

    providerRef.current = provider;
    // console.log(provider);

    provider.socket.on("room:removed", () => {
      console.log("You were removed from the room.");
    });

    setState({ doc, provider, sources, langs, synced: false });

    const onSynced = (isSynced) => {
      console.log(`[Yjs] Synced status for ${roomId}:`, isSynced);
      if (!cancelled) {
        setState({ doc, provider, sources, langs, synced: !!isSynced });
      }
    };

    provider.on('synced', onSynced);
    
    // Add event listeners for debug
    provider.on('status', ({ status }) => {
      console.log(`[Yjs] Connection status for ${roomId}:`, status);
    });

    provider.connect();

    return () => {
      cancelled = true;
      provider.off('synced', onSynced);
      provider.destroy();
      providerRef.current = null;
      setState({
        doc: null,
        provider: null,
        sources: null,
        langs: null,
        synced: false,
      });
    };
  }, [roomId]);

  return state;
}
