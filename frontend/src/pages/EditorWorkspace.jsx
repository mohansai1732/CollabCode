import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import * as Y from 'yjs';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { Link, useParams } from 'react-router-dom';
import { MonacoBinding } from '../y-monaco-local.js';
import { 
  Play, 
  MessageSquare, 
  Send, 
  Users, 
  LogOut, 
  ChevronLeft, 
  Lock, 
  Clock, 
  FileCode, 
  Plus, 
  Trash2, 
  FileText,
  Folder 
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useYjsRoom } from '@/hooks/useYjsRoom';
import { useChatSocket } from '@/hooks/useChatSocket';
import { getLanguageOption, LANGUAGE_OPTIONS } from '@/utils/languages';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

import { 
  fetchRoomRequests, 
  approveJoinRequest, 
  rejectJoinRequest, 
  fetchRoomById, 
  fetchMyRequests, 
  createJoinRequest, 
  cancelJoinRequest, 
  removeCollaborator, 
  setCollaboratorMuted 
} from '@/services/roomsApi';

import {
  fetchFiles,
  createFile,
  updateFile,
  deleteFile,
} from '@/services/filesApi';

const COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

const EXT_TO_LANG = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  html: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  sql: 'sql',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  php: 'php',
  rb: 'ruby',
};

function detectLangFromFilename(name) {
  if (!name) return 'javascript';
  const parts = name.split('.');
  if (parts.length > 1) {
    const ext = parts.pop().toLowerCase();
    if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  }
  return 'javascript';
}

export default function EditorWorkspace() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { roomId } = useParams();

  // 1. Auth Guard: Redirect to landing if not logged in
  useEffect(() => {
    if (isLoaded && !user) {
      window.location.href = '/?redirect_url=' + encodeURIComponent(window.location.pathname);
    }
  }, [isLoaded, user]);

  // Access check & room states
  const [room, setRoom] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [myRequest, setMyRequest] = useState(null);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [removedInfo, setRemovedInfo] = useState({ isRemoved: false, hostName: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // Multi-File State
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [fileCreateError, setFileCreateError] = useState('');
  const [fileToDelete, setFileToDelete] = useState(null);

  // Workspace, editor & chat states
  const [output, setOutput] = useState('');
  const [outputErr, setOutputErr] = useState('');
  const [running, setRunning] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [awareUsers, setAwareUsers] = useState([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [isSyncing, setIsSyncing] = useState(true);
  const [showPending, setShowPending] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedCollaborator, setSelectedCollaborator] = useState(null);

  // Active File Reference
  const activeFile = useMemo(() => {
    if (!files || files.length === 0) return null;
    return files.find(f => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

  const activeLanguage = useMemo(() => {
    return activeFile?.language || 'python';
  }, [activeFile]);

  // Component Refs
  const editorRef = useRef(null);
  const monacoNsRef = useRef(null);
  const bindingRef = useRef(null);
  const modelRef = useRef(null);
  const hydratedRef = useRef(false);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // Track chat scroll position
  const handleChatScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight <= 100;
  }, []);

  // Helper to check if a collaborator is muted
  const isUserMuted = useCallback((targetUserId) => {
    if (!targetUserId) return false;
    if (targetUserId === user?.id && isMuted) return true;
    const aware = awareUsers.find(u => u.userId === targetUserId);
    if (aware && aware.muted === true) return true;
    if (room?.collaborators && Array.isArray(room.collaborators)) {
      const match = room.collaborators.find(c => {
        const cId = typeof c === 'string' ? c : c.userId;
        return cId === targetUserId;
      });
      if (match && typeof match === 'object' && match.muted === true) {
        return true;
      }
    }
    return false;
  }, [room?.collaborators, user?.id, isMuted, awareUsers]);

  // 2. Access Check: Verify permissions
  useEffect(() => {
    if (!isLoaded || !user || !roomId) return;

    let active = true;

    const checkAccess = async () => {
      try {
        const roomData = await fetchRoomById(roomId, user.id);
        if (!active) return;

        if (!roomData) {
          setRoom(null);
          setCheckingAccess(false);
          return;
        }

        setRoom(roomData);

        const isCollaborator = roomData.ownerId === user.id ||
          roomData.collaborators?.some(collaborator =>
            (typeof collaborator === 'string' ? collaborator : collaborator.userId) === user.id
          );

        if (isCollaborator) {
          setHasAccess(true);
          setCheckingAccess(false);
          const myCollab = roomData.collaborators?.find(c =>
            (typeof c === 'string' ? c : c.userId) === user.id
          );
          if (myCollab && typeof myCollab === 'object' && myCollab.muted === true) {
            setIsMuted(true);
          } else {
            setIsMuted(false);
          }
        } else {
          // Fetch user's requests
          const myRequests = await fetchMyRequests(user.id);
          if (!active) return;

          const pendingReq = myRequests.find(r => r.roomId === roomId && r.status === 'pending');
          setMyRequest(pendingReq || null);
          setHasAccess(false);
          setCheckingAccess(false);
        }
      } catch (err) {
        console.error('Access check failed:', err);
        if (active) {
          setCheckingAccess(false);
        }
      }
    };

    checkAccess();

    return () => {
      active = false;
    };
  }, [isLoaded, user?.id, roomId]);

  // 3. Polling: Auto-transition when approved by host
  useEffect(() => {
    if (hasAccess || !user || !roomId || !myRequest || removedInfo.isRemoved) return;

    const interval = setInterval(async () => {
      try {
        const roomData = await fetchRoomById(roomId, user.id);
        if (roomData) {
          const isCollaborator = roomData.ownerId === user.id ||
            roomData.collaborators?.some(collaborator =>
              (typeof collaborator === 'string' ? collaborator : collaborator.userId) === user.id
            );
          if (isCollaborator) {
            setRoom(roomData);
            setHasAccess(true);
          }
        }
      } catch (err) {
        console.error('Polling room status failed:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasAccess, user?.id, roomId, myRequest, removedInfo.isRemoved]);

  const handleSendRequest = async () => {
    if (!user || !room) return;
    try {
      setIsSendingRequest(true);
      setRequestError('');
      const reqId = await createJoinRequest(user, room);
      setMyRequest({
        id: reqId,
        roomId: room.id,
        roomName: room.name,
        roomLanguage: room.language || 'javascript',
        roomOwner: room.ownerId,
        roomOwnerName: room.ownerName || null,
        userId: user.id,
        userName: user.fullName,
        status: 'pending',
        createdAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to create join request:', err);
      setRequestError('Failed to send join request. Please try again.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!myRequest) return;
    try {
      setIsSendingRequest(true);
      await cancelJoinRequest(myRequest.id, user.id);
      setMyRequest(null);
    } catch (err) {
      console.error('Failed to cancel request:', err);
      setRequestError('Failed to cancel request. Please try again.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  // Real-time socket callbacks
  const handleMemberUpdated = useCallback(({ roomId: eventRoomId, collaborator }) => {
    if ((eventRoomId && eventRoomId !== roomId) || !collaborator) return;
    setRoom(prev => {
      if (!prev) return prev;
      const currentCollaborators = Array.isArray(prev.collaborators) ? prev.collaborators : [];
      let found = false;
      const updated = currentCollaborators.map(c => {
        const cId = typeof c === 'string' ? c : c.userId;
        if (cId === collaborator.userId) {
          found = true;
          return { ...(typeof c === 'object' ? c : { userId: cId }), ...collaborator };
        }
        return typeof c === 'object' ? c : { userId: c };
      });
      if (!found) {
        updated.push({ ...collaborator });
      }
      return {
        ...prev,
        collaborators: updated
      };
    });

    setAwareUsers(prev => prev.map(u => u.userId === collaborator.userId ? { ...u, muted: collaborator.muted === true } : u));

    if (collaborator.userId === user?.id) {
      const muted = collaborator.muted === true;
      setIsMuted(muted);
      if (editorRef.current) {
        editorRef.current.updateOptions({
          readOnly: muted,
          domReadOnly: muted,
        });
      }
    }
  }, [roomId, user?.id]);

  const handleMemberRemoved = useCallback(({ roomId: eventRoomId, userId: removedUserId }) => {
    if (eventRoomId && eventRoomId !== roomId) return;
    setRoom(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        collaborators: (prev.collaborators || []).filter(c =>
          (typeof c === 'string' ? c : c.userId) !== removedUserId
        )
      };
    });
    setAwareUsers(prev => prev.filter(u => u.userId !== removedUserId));
  }, [roomId]);

  const handleRoomRemoved = useCallback((data) => {
    if (data?.roomId && data.roomId !== roomId) return;
    const hostName = data?.hostName || room?.ownerName || 'Host';
    setRemovedInfo({
      isRemoved: true,
      hostName,
    });
    setHasAccess(false);
    setIsMuted(false);
  }, [roomId, room?.ownerName]);

  // Host action: Toggle Mute / Unmute
  const handleToggleMute = async (targetUserId, muteStatus) => {
    if (!user || !roomId || actionLoading) return;
    try {
      setActionLoading(true);
      await setCollaboratorMuted(roomId, targetUserId, muteStatus, user.id);
      setRoom(prev => {
        if (!prev) return prev;
        const currentCollaborators = Array.isArray(prev.collaborators) ? prev.collaborators : [];
        let found = false;
        const updated = currentCollaborators.map(c => {
          const cId = typeof c === 'string' ? c : c.userId;
          if (cId === targetUserId) {
            found = true;
            return { ...(typeof c === 'object' ? c : { userId: cId }), muted: muteStatus, mutedReason: muteStatus ? 'host' : null };
          }
          return typeof c === 'object' ? c : { userId: c };
        });
        if (!found) {
          updated.push({ userId: targetUserId, muted: muteStatus, mutedReason: muteStatus ? 'host' : null });
        }
        return {
          ...prev,
          collaborators: updated
        };
      });
      setAwareUsers(prev => prev.map(u => u.userId === targetUserId ? { ...u, muted: muteStatus } : u));
    } catch (err) {
      console.error('Failed to toggle mute status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Host action: Remove collaborator from room
  const handleRemoveCollaborator = async () => {
    if (!selectedCollaborator || !user || !roomId || actionLoading) return;
    try {
      setActionLoading(true);
      await removeCollaborator(
        roomId,
        selectedCollaborator.userId,
        user.id,
      );
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          collaborators: (prev.collaborators || []).filter(c =>
            (typeof c === 'string' ? c : c.userId) !== selectedCollaborator.userId
          )
        };
      });
      setAwareUsers(prev => prev.filter(u => u.userId !== selectedCollaborator.userId));
      setShowRemoveModal(false);
      setSelectedCollaborator(null);
    } catch (err) {
      console.error('Failed to remove collaborator:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const { doc, provider, sources, langs, synced } = useYjsRoom(
    hasAccess && !removedInfo.isRemoved ? roomId : null
  );

  // Stable Naming from Clerk
  const displayName = useMemo(() => {
    if (!isLoaded) return 'Connecting...';
    if (user) {
      return user.fullName || user.firstName || user.username || 'User';
    }
    return 'Authenticating...';
  }, [user, isLoaded]);

  // Stable Color based on name hash
  const userColor = useMemo(() => {
    if (displayName === 'Connecting...' || displayName === 'Authenticating...') return COLORS[0];
    let hash = 0;
    for (let i = 0; i < displayName.length; i++) {
      hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLORS[Math.abs(hash) % COLORS.length];
  }, [displayName]);

  const { peerCount, messages, sendMessage } = useChatSocket(
    hasAccess && !removedInfo.isRemoved ? roomId : null,
    displayName,
    user?.id,
    {
      onMemberUpdated: handleMemberUpdated,
      onMemberRemoved: handleMemberRemoved,
      onRoomRemoved: handleRoomRemoved,
    }
  );

  // Auto-scroll chat to bottom when messages update
  useEffect(() => {
    if (!chatOpen || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const lastMsg = messages[messages.length - 1];
    const isOwnMessage = lastMsg && lastMsg.user === displayName;

    if (isNearBottomRef.current || isOwnMessage) {
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [messages, chatOpen, displayName]);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    isNearBottomRef.current = true;
    sendMessage(chatInput);
    setChatInput('');
  };

  // Hydration of Multi-Files from Firestore & Yjs
  useEffect(() => {
    if (!synced || !doc || !sources || !langs || !roomId) return;

    if (hydratedRef.current) {
      setIsSyncing(false);
      return;
    }

    (async () => {
      try {
        const fetchedFiles = await fetchFiles(roomId);
        setFiles(fetchedFiles);

        if (fetchedFiles.length > 0) {
          setActiveFileId(prevId => {
            if (prevId && fetchedFiles.some(f => f.id === prevId)) return prevId;
            return fetchedFiles[0].id;
          });
        }

        doc.transact(() => {
          fetchedFiles.forEach(file => {
            const t = doc.getText(file.id);
            if (t.length === 0 && file.content) {
              t.insert(0, file.content);
            }
            if (!langs.has(file.id)) {
              langs.set(file.id, file.language || 'python');
            }
          });
        });

        hydratedRef.current = true;
        setIsSyncing(false);
      } catch (e) {
        console.warn('Hydration failed:', e.message);
        setIsSyncing(false);
      }
    })();
  }, [doc, sources, langs, roomId, synced]);

  // Bind Editor to the currently Active File
  const bindActiveFile = useCallback((editor, monacoNs, file) => {
    if (!editor || !monacoNs || !doc || !provider || !file) return;

    bindingRef.current?.destroy();

    const ytext = doc.getText(file.id);
    const lang = file.language || langs?.get(file.id) || 'javascript';
    const uri = monacoNs.Uri.parse(`file:///${roomId}/${file.id}/${file.filename}`);

    let model = monacoNs.editor.getModel(uri);
    if (!model) {
      model = monacoNs.editor.createModel(
        ytext.toString(),
        lang,
        uri
      );
    } else {
      monacoNs.editor.setModelLanguage(model, lang);
    }

    modelRef.current = model;
    editor.setModel(model);

    editor.updateOptions({
      readOnly: isMuted,
      domReadOnly: isMuted,
    });

    const binding = new MonacoBinding(
      monacoNs,
      ytext,
      model,
      new Set(),
      provider.awareness
    );

    bindingRef.current = binding;
  }, [doc, provider, langs, roomId, isMuted]);

  // Re-bind when active file, editor or doc changes
  useEffect(() => {
    if (editorRef.current && monacoNsRef.current && activeFile) {
      bindActiveFile(editorRef.current, monacoNsRef.current, activeFile);
    }
  }, [activeFile?.id, bindActiveFile]);

  // Mount editor handler
  const handleEditorMount = (editor, monacoNs) => {
    editorRef.current = editor;
    monacoNsRef.current = monacoNs;
    if (activeFile) {
      bindActiveFile(editor, monacoNs, activeFile);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
  }, [roomId]);

  // Language Change for Active File
  const handleLanguageSelect = async (nextLang) => {
    if (!activeFile) return;

    // Update in local state
    setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, language: nextLang } : f));

    // Update in Yjs
    if (doc && langs) {
      doc.transact(() => {
        langs.set(activeFile.id, nextLang);
      });
    }

    // Update in Monaco
    if (modelRef.current && monacoNsRef.current) {
      monacoNsRef.current.editor.setModelLanguage(modelRef.current, nextLang);
    }

    // Update in Firestore
    try {
      await updateFile(activeFile.id, roomId, { language: nextLang });
    } catch (err) {
      console.warn('Failed to update file language on server:', err.message);
    }
  };

  // Create New File
  const handleCreateFile = async (e) => {
    e?.preventDefault();
    if (!roomId) return;

    const cleanName = newFileName.trim();
    if (!cleanName) {
      setFileCreateError('Please enter a filename.');
      return;
    }

    const parts = cleanName.split('.');
    if (parts.length < 2 || !parts[parts.length - 1].trim()) {
      setFileCreateError('Please include a valid file extension (e.g. script.js, utils.py, main.cpp, index.html).');
      return;
    }

    setCreatingFile(true);
    setFileCreateError('');

    try {
      const chosenLang = detectLangFromFilename(cleanName);

      const newFile = await createFile({
        roomId,
        filename: cleanName,
        language: chosenLang,
        content: '',
      });

      // Update local state
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);

      // Initialize in Yjs doc
      if (doc && langs) {
        doc.transact(() => {
          langs.set(newFile.id, chosenLang);
        });
      }

      setShowNewFileModal(false);
      setNewFileName('');
    } catch (err) {
      console.error('Failed to create file:', err);
      setFileCreateError(err.response?.data?.message || err.message || 'Failed to create file');
    } finally {
      setCreatingFile(false);
    }
  };

  // Delete File
  const handleDeleteFile = async () => {
    if (!fileToDelete || !roomId) return;

    try {
      await deleteFile(fileToDelete.id, roomId);

      const remaining = files.filter(f => f.id !== fileToDelete.id);
      setFiles(remaining);

      if (activeFileId === fileToDelete.id) {
        if (remaining.length > 0) {
          setActiveFileId(remaining[0].id);
        }
      }

      setFileToDelete(null);
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  // Refresh pending requests
  useEffect(() => {
    if (!user?.id || !room || room.ownerId !== user.id || !hasAccess || removedInfo.isRemoved) return;

    loadPendingRequests();

    const interval = setInterval(() => {
      loadPendingRequests();
    }, 3000);

    return () => clearInterval(interval);
  }, [user?.id, room?.ownerId, roomId, hasAccess, removedInfo.isRemoved]);

  // Sync Monaco editor options when mute status changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        readOnly: isMuted,
        domReadOnly: isMuted,
      });
    }
  }, [isMuted]);

  // Awareness (Collaborators)
  useEffect(() => {
    if (!provider || !user) return;
    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: displayName,
      color: userColor,
      muted: isMuted,
      activeFileId: activeFileId,
    });
  }, [provider, displayName, userColor, user, isMuted, activeFileId]);

  useEffect(() => {
    if (!provider) return;
    const upd = () => {
      const uniqueUsers = new Map();
      provider.awareness.getStates().forEach((st, id) => {
        if (st?.user) {
          const uId = st.user.id || id;
          if (!uniqueUsers.has(uId)) {
            uniqueUsers.set(uId, {
              id,
              userId: uId,
              name: st.user.name,
              color: st.user.color,
              muted: st.user.muted === true,
              activeFileId: st.user.activeFileId,
            });
          }
        }
      });
      setAwareUsers(Array.from(uniqueUsers.values()));
    };
    upd();
    provider.awareness.on('change', upd);
    return () => provider.awareness.off('change', upd);
  }, [provider]);

  // Python Engine (Pyodide)
  const [pyodide, setPyodide] = useState(null);

  useEffect(() => {
    if (activeLanguage === 'python' && !pyodide) {
      const loadPyodide = async () => {
        try {
          if (typeof window.loadPyodide !== 'function') {
            console.warn('Pyodide script not yet loaded from CDN...');
            return;
          }
          console.log('Loading Pyodide engine...');
          const py = await window.loadPyodide();
          setPyodide(py);
          console.log('Pyodide loaded.');
        } catch (e) {
          console.error('Failed to load Pyodide:', e);
        }
      };
      const timer = setTimeout(loadPyodide, 500);
      return () => clearTimeout(timer);
    }
  }, [activeLanguage, pyodide]);

  const runJS = (code) => {
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      originalLog(...args);
    };
    console.error = (...args) => {
      logs.push('Error: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      originalError(...args);
    };

    try {
      const result = eval(code);
      if (result !== undefined) logs.push(`=> ${result}`);
      setOutput(logs.join('\n'));
    } catch (e) {
      setOutputErr(e.message);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  };

  const runPython = async (code) => {
    if (!pyodide) {
      setOutputErr('Python engine is still loading... please wait a few seconds.');
      return;
    }

    try {
      pyodide.runPython(`
        import sys
        import io
        sys.stdout = io.StringIO()
      `);

      await pyodide.runPythonAsync(code);

      const stdout = pyodide.runPython('sys.stdout.getvalue()');
      setOutput(stdout || 'Python code executed successfully with no output.');
    } catch (e) {
      setOutputErr(e.message);
    }
  };

  const inviteUrl = `${window.location.origin}/join/${roomId}`;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch (err) {
      console.error('Failed to copy invite link:', err);
    }
  };

  const handleRun = async () => {
    try {
      setRunning(true);
      setOutput('');
      setOutputErr('');

      if (!doc || !activeFile) {
        setOutputErr('Document not initialized');
        return;
      }

      const content = editorRef.current?.getValue() || '';
      if (!content.trim()) {
        setOutputErr('Code editor is empty');
        return;
      }

      if (activeLanguage === 'javascript') {
        runJS(content);
      } else if (activeLanguage === 'python') {
        await runPython(content);
      } else {
        setOutputErr(`In-browser execution for ${activeLanguage} is not supported directly yet.`);
      }

    } catch (e) {
      console.error('Run error:', e);
      setOutputErr(e.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const loadPendingRequests = async () => {
    if (!user?.id) return;
    try {
      const requests = await fetchRoomRequests(roomId, user.id);
      setPendingRequests(requests);
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  };

  if (removedInfo.isRemoved) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-4">
        <Card className="max-w-md w-full p-8 text-center" glass>
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-500">
            <LogOut className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Removed from Room</h2>
          <p className="text-zinc-400 mb-6">
            You were removed from the room by <strong className="text-white">{removedInfo.hostName}</strong>.
          </p>
          <Link to="/dashboard" className="w-full block">
            <Button variant="primary" className="w-full">
              Return to Dashboard
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (checkingAccess || (hasAccess && isSyncing)) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-zinc-400 animate-pulse">
            {checkingAccess ? 'Verifying access permissions...' : 'Initializing workspace...'}
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-4">
        <Card className="max-w-md w-full p-8 text-center" glass>
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-500">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Room Not Found</h2>
          <p className="text-zinc-400 mb-6">
            The room code may be incorrect, or the room may have been deleted.
          </p>
          <Link to="/dashboard" className="w-full block">
            <Button variant="primary" className="w-full">
              Back to Dashboard
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-4">
        <Card className="max-w-md w-full p-8 text-center" glass>
          {myRequest ? (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6 text-amber-500">
                <Clock className="w-8 h-8 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Access Pending</h2>
              <p className="text-zinc-400 mb-6">
                Waiting for the host to approve your request to join <strong>{room.name}</strong>.
              </p>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Room Name:</span>
                  <span className="text-white font-medium">{room.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Language:</span>
                  <span className="text-white uppercase font-mono">{room.language || 'javascript'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Host:</span>
                  <span className="text-white font-medium font-mono text-xs">
                    {room.ownerName && room.ownerName !== 'Unknown' ? room.ownerName : room.ownerId}
                  </span>
                </div>
              </div>

              {requestError && (
                <p className="text-red-400 text-sm mb-4">{requestError}</p>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  className="bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  onClick={handleCancelRequest}
                  disabled={isSendingRequest}
                >
                  {isSendingRequest ? 'Canceling...' : 'Cancel Request'}
                </Button>
                <Link to="/dashboard" className="w-full">
                  <Button variant="secondary" className="w-full">
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6 text-amber-500">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Room Code Required</h2>
              <p className="text-zinc-400 mb-6">
                Direct URL joining is disabled. To join this room, please ask the host for the 6-character <strong>Room Code</strong> and enter it in the <strong>Join Room</strong> modal on your Dashboard.
              </p>

              <Link to="/dashboard" className="w-full">
                <Button variant="primary" className="w-full">
                  Go to Dashboard to Enter Code
                </Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl px-6 py-3">
        <Link to="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold">Back</span>
        </Link>

        <div className="h-6 w-px bg-zinc-800" />

        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-mono text-sm">ROOM CODE:</span>
          <code className="bg-zinc-800 px-2 py-1 rounded text-amber-200 text-sm font-mono tracking-wider font-bold">{roomId}</code>
        </div>

        {room.ownerId == user.id && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyInvite}
            >
              Invite
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPending(!showPending)}
              className="gap-2 relative"
            >
              <Users className="w-4 h-4" />
              Requests
              {pendingRequests.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-semibold">
                  {pendingRequests.length}
                </span>
              )}
            </Button>
          </>
        )}

        {showPending && (
          <div className="absolute top-14 left-0 w-70 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">
                Pending Requests
              </h3>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">
                No pending requests
              </div>
            ) : (
              pendingRequests.map((req) => (
                <div
                  key={req._id || req.id}
                  className="p-4 border-b border-zinc-800"
                >
                  <p className="text-white text-sm font-medium">
                    {req.userName}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    wants to join this room
                  </p>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={async () => {
                        try {
                          await approveJoinRequest(req, user.id);
                          setPendingRequests(prev => prev.filter(r => r.id !== req.id));
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="px-3 py-1 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white"
                    >
                      Accept
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          await rejectJoinRequest(req, user.id);
                          setPendingRequests(prev => prev.filter(r => r.id !== req.id));
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="px-3 py-1 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {isMuted && (
            <span className="px-2.5 py-1 text-xs rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 font-medium">
              🔇 Read-only (Muted by Host)
            </span>
          )}
          {!chatOpen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChatOpen(true)}
              className="gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
          )}

          <select
            value={activeLanguage}
            onChange={(e) => handleLanguageSelect(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
          >
            {LANGUAGE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <Button size="sm" onClick={handleRun} disabled={running} className="gap-2 bg-green-600 hover:bg-green-700 border-none">
            <Play className="w-4 h-4" />
            {running ? 'Running...' : 'Run'}
          </Button>
        </div>
      </header>

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Side: Multi-File Explorer & Collaborators */}
        <Panel defaultSize={20} minSize={15} className="border-r border-zinc-800 bg-zinc-900/30">
          <div className="flex flex-col h-full">
            
            {/* Multi-File Explorer Section */}
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Files ({files.length})</h3>
                </div>
                <button
                  onClick={() => {
                    setFileCreateError('');
                    setNewFileName('');
                    setShowNewFileModal(true);
                  }}
                  className="p-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 transition text-xs flex items-center gap-1 font-medium cursor-pointer"
                  title="New File"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-[11px] pr-1">New</span>
                </button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {files.map((file) => {
                  const isActive = file.id === activeFile?.id;
                  return (
                    <div
                      key={file.id}
                      onClick={() => setActiveFileId(file.id)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition border ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                        <span className="truncate">{file.filename}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-mono text-zinc-500 px-1 py-0.5 rounded bg-zinc-800/50">
                          {file.language || 'code'}
                        </span>
                        {files.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFileToDelete(file);
                            }}
                            className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-0.5 rounded hover:bg-zinc-800"
                            title="Delete file"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collaborators Section */}
            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Collaborators ({awareUsers.length})</h3>
              <div className="space-y-3">
                {awareUsers.map((u) => {
                  const isTargetMuted = isUserMuted(u.userId);
                  const isHost = room?.ownerId === user?.id;
                  const isSelf = u.userId === user?.id || u.name === displayName;

                  return (
                    <div key={u.id || u.userId} className="flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg"
                            style={{ background: `linear-gradient(135deg, ${u.color}, ${u.color}dd)` }}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-zinc-900 rounded-full" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-zinc-300 truncate flex items-center gap-1.5">
                            {u.name}
                            {isSelf && <span className="text-[10px] text-zinc-500">(You)</span>}
                            {u.userId === room?.ownerId && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/30">Host</span>
                            )}
                          </span>
                          {isTargetMuted && (
                            <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                              🔇 Muted
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Host action menu */}
                      {isHost && !isSelf && (
                        <div className="relative group/menu">
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition cursor-pointer text-xs font-bold"
                            title="Collaborator Options"
                          >
                            ⋮
                          </button>

                          <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 z-50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleToggleMute(u.userId, !isTargetMuted)}
                              disabled={actionLoading}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition cursor-pointer ${isTargetMuted
                                  ? 'bg-blue-600/20 text-blue-400 font-medium hover:bg-blue-600/30'
                                  : 'text-zinc-200 hover:bg-zinc-800'
                                }`}
                            >
                              {isTargetMuted ? '🔊 Unmute' : '🔇 Mute'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSelectedCollaborator(u); setShowRemoveModal(true); }}
                              disabled={actionLoading}
                              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-600 hover:text-white flex items-center gap-2 transition border-t border-zinc-800 cursor-pointer"
                            >
                              🗑 Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-zinc-800" />

        {/* Middle: Editor */}
        <Panel defaultSize={chatOpen ? 55 : 80}>
          <div className="h-full relative">
            <Editor
              height="100%"
              theme="vs-dark"
              language={activeLanguage}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 28, bottom: 20 },
                smoothScrolling: true,
                cursorSmoothCaretAnimation: "on",
                fontFamily: "'JetBrains Mono', monospace",
                readOnly: isMuted,
                domReadOnly: isMuted,
              }}
            />
          </div>
        </Panel>

        {chatOpen && (
          <>
            <PanelResizeHandle className="w-px bg-zinc-800" />
            <Panel defaultSize={25} minSize={20} className="bg-zinc-900/50 border-l border-zinc-800">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold">Live Chat</span>
                  </div>
                  <button onClick={() => setChatOpen(false)} className="text-zinc-500 hover:text-white">×</button>
                </div>

                <div
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 overflow-y-auto p-4 space-y-4 chat-scrollbar"
                >
                  {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.user === displayName ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-zinc-500 mb-1">{m.user}</span>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.user === displayName ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
                        }`}>
                        {m.message}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 border-t border-zinc-800">
                  <div className="flex gap-2 p-2 bg-zinc-950 rounded-xl border border-zinc-800">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-sm outline-none px-2"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Footer: Output */}
      <div className="h-40 bg-zinc-950 border-t border-zinc-800 p-4 font-mono text-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 text-zinc-500 text-xs font-bold uppercase tracking-widest">
          <span>Terminal Output ({activeFile?.filename || 'Active File'})</span>
          {output && <span className="text-green-500 lowercase">Success</span>}
          {outputErr && <span className="text-red-500 lowercase">Error</span>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {outputErr && <pre className="text-red-400 whitespace-pre-wrap">{outputErr}</pre>}
          {output && <pre className="text-green-400 whitespace-pre-wrap">{output}</pre>}
          {!output && !outputErr && <p className="text-zinc-600 italic">Ready to run {activeFile?.filename || 'code'}...</p>}
        </div>
      </div>

      {/* Modal: New File */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                Create New File
              </h2>
              <p className="text-zinc-400 mt-1 text-xs">
                Add a new file to collaborate on in room <span className="font-mono text-indigo-300 font-semibold">{roomId}</span>.
              </p>
            </div>

            <form onSubmit={handleCreateFile} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Filename <span className="text-zinc-500 font-normal normal-case">(with extension)</span>
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    setFileCreateError('');
                  }}
                  placeholder="e.g. script.js, index.py"
                  autoFocus
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition font-mono"
                />

                {/* Auto-detected language indicator */}
                <div className="mt-2 text-xs flex items-center gap-1.5">
                  {newFileName.trim().includes('.') && newFileName.trim().split('.').pop() ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Auto-detected: <strong className="uppercase font-mono">{detectLangFromFilename(newFileName.trim())}</strong>
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      Must include extension (e.g. <span className="font-mono text-zinc-400">.js, .py</span>)
                    </span>
                  )}
                </div>
              </div>

              {fileCreateError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                  {fileCreateError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFileModal(false)}
                  disabled={creatingFile}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFile || !newFileName.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {creatingFile ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete File */}
      {fileToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                Delete File
              </h2>
              <p className="text-zinc-400 mt-2 text-sm">
                Are you sure you want to delete <strong className="text-white font-mono">{fileToDelete.filename}</strong>? This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-zinc-900/80">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFile}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm text-white font-medium transition shadow-lg shadow-red-600/30 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Removing Collaborator */}
      {showRemoveModal && selectedCollaborator && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-semibold text-white">
                Remove Collaborator
              </h2>
              <p className="text-zinc-400 mt-2 text-sm">
                Are you sure you want to remove <strong className="text-white">{selectedCollaborator?.name}</strong> from this room? They will lose access immediately.
              </p>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-zinc-900/80">
              <button
                type="button"
                onClick={() => {
                  setShowRemoveModal(false);
                  setSelectedCollaborator(null);
                }}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveCollaborator}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm text-white font-medium transition disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}