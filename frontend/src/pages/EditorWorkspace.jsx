import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { Link, useParams } from 'react-router-dom';

import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import * as Y from 'yjs';

import { MonacoBinding } from '../y-monaco-local.js';

import {
  Copy,
  Play,
  Save,
  MessageSquare,
  Send,
  Users,
  LogOut,
  ChevronLeft
} from 'lucide-react';

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';

import { useYjsRoom } from '@/hooks/useYjsRoom';
import { useChatSocket } from '@/hooks/useChatSocket';

import {
  fetchFiles,
  createFile,
  updateFile,
} from '@/services/filesApi';

import {
  fetchRoomRequests,
  approveJoinRequest,
  rejectJoinRequest,
} from '@/services/roomsApi';

// import { executeCode } from '@/services/pistonApi';

import {
  getLanguageOption,
  LANGUAGE_OPTIONS,
} from '@/utils/languages';

import { Button } from '@/components/Button';

const COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

const ACTIVE_FILENAME = 'main.js';

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

  const { doc, provider, sources, langs, synced } = useYjsRoom(roomId);

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

  const { peerCount, messages, sendMessage } = useChatSocket(roomId, displayName);

  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState('');
  const [outputErr, setOutputErr] = useState('');
  const [running, setRunning] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [awareUsers, setAwareUsers] = useState([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [isSyncing, setIsSyncing] = useState(true);
  const [showPending, setShowPending] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);


  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const modelRef = useRef(null);
  const dbFileRef = useRef(null);
  const hydratedRef = useRef(false);
  const chatEndRef = useRef(null);

  // Hydration from Firestore
  useEffect(() => {
    // CRITICAL: Wait for doc to be synced with the server before hydration.
    // This prevents duplicate content if two users join at the same time.
    if (!synced || !doc || !sources || !langs || !roomId) return;

    if (hydratedRef.current) {
      setIsSyncing(false);
      return;
    }

    (async () => {
      try {
        const files = await fetchFiles(roomId);
        const mainFile = files.find(f => f.filename === ACTIVE_FILENAME);
        
        if (mainFile) {
          dbFileRef.current = mainFile;
          setLanguage(mainFile.language || 'javascript');
        }

        doc.transact(() => {
          // Use top-level deterministic type to prevent overwrite race conditions
          const t = doc.getText(ACTIVE_FILENAME);
          if (t.length === 0 && mainFile?.content) {
            t.insert(0, mainFile.content);
          }
          if (!langs.has(ACTIVE_FILENAME)) {
            langs.set(ACTIVE_FILENAME, mainFile?.language || 'javascript');
          }
        });
        
        hydratedRef.current = true;
        setIsSyncing(false);
      } catch (e) {
        console.warn('Hydration failed:', e.message);
        setIsSyncing(false);
      }
    })();
  }, [doc, sources, langs, roomId, synced]);

  // Cleanup effect for binding and model
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        console.log('[Editor] Destroying binding');
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (modelRef.current) {
        console.log('[Editor] Disposing model');
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
  }, [roomId]);

// refreshpedningrequests
    useEffect(() => {

      if (!user?.id) return;

      loadPendingRequests();

      const interval = setInterval(() => {

        loadPendingRequests();

      }, 3000);

      return () => clearInterval(interval);

    }, [user?.id]);

  // Awareness (Collaborators)
  useEffect(() => {
    if (!provider || !user) return;
    provider.awareness.setLocalStateField('user', {
      id: user.id, // Store Clerk user ID for de-duplication
      name: displayName,
      color: userColor,
    });
  }, [provider, displayName, userColor, user]);

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


  const bindEditor = useCallback((editor, monacoNs) => {
    if (!doc || !sources || !provider) return;


    bindingRef.current?.destroy();
    
    // Always use the deterministic top-level Y.Text
    const ytext = doc.getText(ACTIVE_FILENAME);
    const lang = langs.get(ACTIVE_FILENAME) || language;

    const uri = monacoNs.Uri.parse(`file:///${roomId}/${ACTIVE_FILENAME}`);

    // monaco editor sync relies on the model URI to identify documents, so we create a unique URI for this room and file. This also allows Monaco to manage the editor state (like undo/redo) correctly across sessions.
// let model = monacoNs.editor.getModel(uri);

// if (!model) {
//   model = monacoNs.editor.createModel('', lang, uri);
// }

// modelRef.current = model;

// editor.setModel(model);
// Dispose stale Monaco model
const existingModel =
  monacoNs.editor.getModel(uri);

if (existingModel) {
  existingModel.dispose();
}

// Create fresh synced model
const model = monacoNs.editor.createModel(
  ytext.toString(),
  lang,
  uri
);

modelRef.current = model;

editor.setModel(model);

// Clear stale diagnostics
monacoNs.editor.setModelMarkers(
  model,
  'owner',
  []
);



// const binding = new MonacoBinding(
//   monacoNs,
//   ytext,
//   model,
//   new Set([editor]),
//   provider.awareness
// );
const binding = new MonacoBinding(
  monacoNs,
  ytext,
  model,
  new Set(),
  provider.awareness
);

bindingRef.current = binding;
editorRef.current = editor;
  }, [doc, sources, provider, langs, language, roomId]);


  const handleLanguageSelect = (next) => {
    setLanguage(next);
    if (!doc || !langs) return;
    doc.transact(() => { langs.set(ACTIVE_FILENAME, next); });
    if (modelRef.current) monaco.editor.setModelLanguage(modelRef.current, next);
  };

  const handleSave = async () => {
    if (!doc) return;
    const content = doc.getText(ACTIVE_FILENAME).toString();
    const meta = dbFileRef.current;

    try {
      let savedFile;
      console.log('Attempting to save...', { id: meta?.id || meta?._id, roomId, ACTIVE_FILENAME });
      
      if (meta?.id || meta?._id) {
        savedFile = await updateFile(meta.id || meta._id, roomId, { content, language });
      } else {
        savedFile = await createFile({ roomId, filename: ACTIVE_FILENAME, language, content });
      }

      if (savedFile) {
        dbFileRef.current = savedFile;
        setOutput('Saved successfully at ' + new Date().toLocaleTimeString());
        setOutputErr('');
      }
    } catch (e) {
      console.error('Save error:', e);
      const msg = e.response?.data?.message || e.message;
      setOutputErr('Save failed: ' + msg);
    }

  };

  const [pyodide, setPyodide] = useState(null);

  // Initialize Pyodide
  useEffect(() => {
    if (language === 'python' && !pyodide) {
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
      // Retry after a short delay if not ready
      const timer = setTimeout(loadPyodide, 500);
      return () => clearTimeout(timer);
    }
  }, [language, pyodide]);

  const runJS = (code) => {
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;

    // Redirect console.log and console.error
    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      originalLog(...args);
    };
    console.error = (...args) => {
      logs.push('Error: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      originalError(...args);
    };

    try {
      // Use eval but wrap it to capture any immediate errors
      // Note: In production apps, you'd use a Web Worker or a sandbox iframe
      // for better security and to prevent infinite loops from freezing the UI.
      const result = eval(code);
      if (result !== undefined) logs.push(`=> ${result}`);
      setOutput(logs.join('\n'));
    } catch (e) {
      setOutputErr(e.message);
    } finally {
      // Restore console
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
      // Create a virtual stdout to capture print() calls
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

  const handleRun = async () => {
    try {
      setRunning(true);
      setOutput('');
      setOutputErr('');

      if (!doc) {
        setOutputErr('Document not initialized');
        return;
      }

      // const content = doc.getText(ACTIVE_FILENAME).toString();
      const content = editorRef.current?.getValue() || '';
      if (!content.trim()) {
        setOutputErr('Code editor is empty');
        return;
      }

      if (language === 'javascript') {
        runJS(content);
      } else if (language === 'python') {
        await runPython(content);
      }

    } catch (e) {
      console.error('Run error:', e);
      setOutputErr(e.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const loadPendingRequests =
    async () => { 

      if (!user?.id) return;

      try {

        const requests =
          await fetchRoomRequests(user.id);

        setPendingRequests(requests);

      } catch (err) {

        console.error(
          'Failed to load requests:',
          err
        );
      }
    };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopyOk(true);
    setTimeout(() => setCopyOk(false), 2000);
  };

  if (isSyncing) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-zinc-400 animate-pulse">Initializing workspace...</p>
        </div>
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
          <span className="text-zinc-500 font-mono text-sm">ROOM:</span>
          <code className="bg-zinc-800 px-2 py-1 rounded text-amber-200 text-sm font-mono">{roomId}</code>
        </div>

        <Button variant="secondary" size="sm" onClick={copyLink} className="gap-2">
            <Copy className="w-4 h-4" />
            {copyOk ? 'Copied' : 'Invite'}
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
                  key={req._id}
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

                        await approveJoinRequest(req);

                        // instantly update UI
                        setPendingRequests(prev =>
                          prev.filter(
                            r => r.id !== req.id
                          )
                        );

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

                        await rejectJoinRequest(req.id);

                        // instantly update UI
                        setPendingRequests(prev =>
                          prev.filter(
                            r => r.id !== req.id
                          )
                        );

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
            value={language}
            onChange={(e) => handleLanguageSelect(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
          >
            {LANGUAGE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <Button variant="primary" size="sm" onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Save
          </Button>

          <Button size="sm" onClick={handleRun} disabled={running} className="gap-2 bg-green-600 hover:bg-green-700 border-none">
            <Play className="w-4 h-4" />
            {running ? 'Running...' : 'Run'}
          </Button>
        </div>
      </header>

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Side: Collaborators & Info */}
        <Panel defaultSize={20} minSize={15} className="border-r border-zinc-800 bg-zinc-900/30">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Workspace</h3>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {roomId.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ACTIVE_FILENAME}</p>
                  <p className="text-xs text-zinc-500 uppercase">{language}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Collaborators ({awareUsers.length})</h3>
              <div className="space-y-3">
                {awareUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 group">
                    <div className="relative">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${u.color}, ${u.color}dd)` }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-zinc-900 rounded-full" />
                    </div>
                    <span className="text-sm text-zinc-300">
                      {u.name}
                      {u.name === displayName && <span className="ml-2 text-[10px] text-zinc-500">(You)</span>}
                    </span>
                  </div>
                ))}
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
              language={language}
              onMount={(ed, mon) => bindEditor(ed, mon)}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 20 },
                smoothScrolling: true,
                cursorSmoothCaretAnimation: "on",
                fontFamily: "'JetBrains Mono', monospace",
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

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.user === displayName ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-zinc-500 mb-1">{m.user}</span>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        m.user === displayName ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
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
                      onKeyDown={(e) => e.key === 'Enter' && (sendMessage(chatInput), setChatInput(''))}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-sm outline-none px-2"
                    />
                    <button 
                      onClick={() => (sendMessage(chatInput), setChatInput(''))}
                      className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
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
          <span>Terminal Output</span>
          {output && <span className="text-green-500 lowercase">Success</span>}
          {outputErr && <span className="text-red-500 lowercase">Error</span>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {outputErr && <pre className="text-red-400 whitespace-pre-wrap">{outputErr}</pre>}
          {output && <pre className="text-green-400 whitespace-pre-wrap">{output}</pre>}
          {!output && !outputErr && <p className="text-zinc-600 italic">Ready to run code...</p>}
        </div>
      </div>
    </div>
  );
}
