import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { executeCode } from './runners/executeCode.js';

const app = express();

const ALLOWED_LANGUAGES = new Set([
  'c',
  'cpp',
  'c++',
  'java',
  'python',
  'py',
  'javascript',
  'js',
  'node',
]);

const MAX_CODE_LENGTH = 100_000;  // 100 KB max code string
const MAX_STDIN_LENGTH = 65_536;   // 64 KB max stdin string

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Healthcheck endpoint for Docker / Kubernetes / Cloud monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'collabcode-sandbox',
    supportedLanguages: ['c', 'cpp', 'java', 'python', 'javascript'],
    timestamp: new Date().toISOString()
  });
});

// Code execution endpoint
app.post('/execute', async (req, res) => {
  try {
    // 1. Authenticate using shared secret if SANDBOX_API_SECRET is configured
    if (process.env.SANDBOX_API_SECRET) {
      const authHeader = req.headers['x-sandbox-secret'] || req.headers['authorization'];
      if (!authHeader || authHeader !== process.env.SANDBOX_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-Sandbox-Secret header.' });
      }
    }

    const { language, code, stdin = '', timeoutMs } = req.body;

    // 2. Validate Language
    if (!language || typeof language !== 'string') {
      return res.status(400).json({ error: 'Field "language" is required (string).' });
    }

    const cleanLang = language.toLowerCase().trim();
    if (!ALLOWED_LANGUAGES.has(cleanLang)) {
      return res.status(400).json({
        error: `Unsupported language: "${language}". Supported: c, cpp, java, python, javascript.`,
      });
    }

    // 3. Validate Code
    if (code === undefined || typeof code !== 'string') {
      return res.status(400).json({ error: 'Field "code" is required (string).' });
    }

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({
        error: `Code exceeds maximum allowed size of ${MAX_CODE_LENGTH} characters.`,
      });
    }

    if (typeof stdin === 'string' && stdin.length > MAX_STDIN_LENGTH) {
      return res.status(400).json({
        error: `Stdin exceeds maximum allowed size of ${MAX_STDIN_LENGTH} characters.`,
      });
    }

    if (code.trim().length === 0) {
      return res.status(200).json({
        stdout: '',
        stderr: '',
        exitCode: 0,
        executionTimeMs: 0
      });
    }

    // 4. Cap timeout safely between 1s and 10s (default 5s)
    const safeTimeout = Math.min(Math.max(Number(timeoutMs) || 5000, 1000), 10000);

    const result = await executeCode({
      language: cleanLang,
      code,
      stdin: typeof stdin === 'string' ? stdin : '',
      timeoutMs: safeTimeout
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('[Sandbox Error]:', err);
    res.status(500).json({
      error: 'Internal execution sandbox error',
      details: err.message
    });
  }
});

const PORT = Number(process.env.PORT) || 2000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CollabCode Sandbox] Running on port ${PORT} (0.0.0.0)`);
});

// Graceful shutdown handling
function shutdown() {
  console.log('[CollabCode Sandbox] Shutting down gracefully...');
  server.close(() => {
    console.log('[CollabCode Sandbox] HTTP server closed. Exiting process.');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
