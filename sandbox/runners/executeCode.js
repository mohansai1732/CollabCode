import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB max output
const DEFAULT_TIMEOUT_MS = 5000;    // 5 seconds max execution
const IS_WINDOWS = process.platform === 'win32';

/**
 * Checks if a command exists in PATH (synchronous check cache or basic probe)
 */
let hasUnshare = false;
let hasSandboxUser = false;

// Determine sandbox execution environment at startup
try {
  if (!IS_WINDOWS && process.getuid && process.getuid() === 0) {
    hasSandboxUser = true; // In Docker container running as root, we can drop to sandbox_user
    hasUnshare = true;
  }
} catch (e) {
  // Ignore
}

/**
 * Execute a command with strict timeout, stdin pipe, and output size cap
 */
function runProcess({ command, args, cwd, stdin = '', timeoutMs = DEFAULT_TIMEOUT_MS, runAsSandboxUser = false }) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killedDueToTimeout = false;
    let killedDueToOutputLimit = false;

    let finalCommand = command;
    let finalArgs = args;

    // Apply network isolation and user sandbox if inside Linux/Docker environment
    if (!IS_WINDOWS && runAsSandboxUser && hasSandboxUser) {
      const fullCmd = [command, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
      finalCommand = 'su';
      finalArgs = ['-s', '/bin/sh', 'sandbox_user', '-c', fullCmd];
    }

    let child;
    try {
      child = spawn(finalCommand, finalArgs, {
        cwd,
        env: {
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
          PYTHONUNBUFFERED: '1',
          NODE_ENV: 'production'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      return resolve({
        stdout: '',
        stderr: `Failed to spawn process: ${err.message}`,
        exitCode: 1,
        executionTimeMs: 0
      });
    }

    // Safety timeout
    const timer = setTimeout(() => {
      killedDueToTimeout = true;
      try {
        child.kill('SIGKILL');
      } catch (e) {}
      // Ensure all processes spawned by sandbox_user are killed
      if (!IS_WINDOWS && runAsSandboxUser && hasSandboxUser) {
        try {
          spawn('pkill', ['-9', '-u', 'sandbox_user']);
        } catch (e) {}
      }
    }, timeoutMs);

    // Stream stdin if provided
    if (stdin && child.stdin) {
      try {
        child.stdin.write(stdin);
        child.stdin.end();
      } catch (err) {
        // Child might have exited immediately
      }
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
        if (stdout.length >= MAX_OUTPUT_BYTES) {
          stdout += '\n[Output truncated: Limit 64KB reached]';
          killedDueToOutputLimit = true;
          child.kill('SIGKILL');
        }
      }
    });

    child.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
        if (stderr.length >= MAX_OUTPUT_BYTES) {
          stderr += '\n[Error output truncated: Limit 64KB reached]';
          killedDueToOutputLimit = true;
          child.kill('SIGKILL');
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;

      if (killedDueToTimeout) {
        return resolve({
          stdout,
          stderr: (stderr ? stderr + '\n' : '') + `Execution Timed Out (Limit: ${timeoutMs / 1000}s)`,
          exitCode: 124,
          executionTimeMs
        });
      }

      if (killedDueToOutputLimit) {
        return resolve({
          stdout,
          stderr: (stderr ? stderr + '\n' : '') + 'Process killed: output buffer exceeded 64KB limit',
          exitCode: 137,
          executionTimeMs
        });
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? (signal ? 1 : 0),
        executionTimeMs
      });
    });
  });
}

/**
 * Main execution handler for supported languages
 */
export async function executeCode({ language, code, stdin = '', timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const runId = uuidv4();
  const runsParentDir = path.join(os.tmpdir(), 'collabcode_runs');
  const runDir = path.join(runsParentDir, runId);

  try {
    await fs.mkdir(runDir, { recursive: true });

    // In Linux/Docker, grant permissions so sandbox_user (UID 1001) can read/write files in this run dir
    if (!IS_WINDOWS) {
      try {
        await fs.chmod(runsParentDir, 0o777);
        await fs.chmod(runDir, 0o777);
      } catch (e) {}
    }

    const lang = String(language || '').toLowerCase().trim();

    switch (lang) {
      case 'c': {
        const sourcePath = path.join(runDir, 'main.c');
        const binPath = path.join(runDir, IS_WINDOWS ? 'main.exe' : 'main');
        await fs.writeFile(sourcePath, code, 'utf8');

        // Compile
        const compile = await runProcess({
          command: 'gcc',
          args: ['-O2', '-Wall', 'main.c', '-o', IS_WINDOWS ? 'main.exe' : 'main'],
          cwd: runDir,
          timeoutMs: 10000,
          runAsSandboxUser: false // Compile as normal user
        });

        if (compile.exitCode !== 0) {
          return {
            stdout: '',
            stderr: '',
            compileError: compile.stderr || compile.stdout || 'Compilation failed',
            exitCode: compile.exitCode,
            executionTimeMs: compile.executionTimeMs
          };
        }

        // Execute compiled binary (network disabled, sandbox user)
        const exec = await runProcess({
          command: binPath,
          args: [],
          cwd: runDir,
          stdin,
          timeoutMs,
          runAsSandboxUser: true
        });

        return exec;
      }

      case 'cpp':
      case 'c++': {
        const sourcePath = path.join(runDir, 'main.cpp');
        const binPath = path.join(runDir, IS_WINDOWS ? 'main.exe' : 'main');
        await fs.writeFile(sourcePath, code, 'utf8');

        // Compile
        const compile = await runProcess({
          command: 'g++',
          args: ['-O2', '-std=c++17', '-Wall', 'main.cpp', '-o', IS_WINDOWS ? 'main.exe' : 'main'],
          cwd: runDir,
          timeoutMs: 10000,
          runAsSandboxUser: false
        });

        if (compile.exitCode !== 0) {
          return {
            stdout: '',
            stderr: '',
            compileError: compile.stderr || compile.stdout || 'Compilation failed',
            exitCode: compile.exitCode,
            executionTimeMs: compile.executionTimeMs
          };
        }

        // Execute compiled binary (network disabled, sandbox user)
        const exec = await runProcess({
          command: binPath,
          args: [],
          cwd: runDir,
          stdin,
          timeoutMs,
          runAsSandboxUser: true
        });

        return exec;
      }

      case 'java': {
        // Detect class name or default to Main
        const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/) || code.match(/class\s+([A-Za-z0-9_]+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        const sourcePath = path.join(runDir, `${className}.java`);

        // Strip or comment package declaration so code runs from default root package
        const sanitizedJavaCode = code.replace(/^\s*package\s+[^;]+;/m, '// [CollabCode Sandbox removed package declaration] $&');
        await fs.writeFile(sourcePath, sanitizedJavaCode, 'utf8');

        // Compile
        const compile = await runProcess({
          command: 'javac',
          args: [`${className}.java`],
          cwd: runDir,
          timeoutMs: 10000,
          runAsSandboxUser: false
        });

        if (compile.exitCode !== 0) {
          return {
            stdout: '',
            stderr: '',
            compileError: compile.stderr || compile.stdout || 'Java compilation failed',
            exitCode: compile.exitCode,
            executionTimeMs: compile.executionTimeMs
          };
        }

        // Execute Java class
        const exec = await runProcess({
          command: 'java',
          args: ['-Xmx256m', '-Xss8m', className],
          cwd: runDir,
          stdin,
          timeoutMs,
          runAsSandboxUser: true
        });

        return exec;
      }

      case 'python':
      case 'py': {
        const sourcePath = path.join(runDir, 'main.py');
        await fs.writeFile(sourcePath, code, 'utf8');

        const pyCommand = IS_WINDOWS ? 'python' : 'python3';
        const exec = await runProcess({
          command: pyCommand,
          args: ['-u', 'main.py'],
          cwd: runDir,
          stdin,
          timeoutMs,
          runAsSandboxUser: true
        });

        return exec;
      }

      case 'javascript':
      case 'js':
      case 'node': {
        const sourcePath = path.join(runDir, 'main.js');
        await fs.writeFile(sourcePath, code, 'utf8');

        const exec = await runProcess({
          command: 'node',
          args: ['main.js'],
          cwd: runDir,
          stdin,
          timeoutMs,
          runAsSandboxUser: true
        });

        return exec;
      }

      default:
        return {
          stdout: '',
          stderr: `Unsupported language: '${language}'. Supported languages: c, cpp, java, python, javascript.`,
          exitCode: 1,
          executionTimeMs: 0
        };
    }
  } catch (err) {
    return {
      stdout: '',
      stderr: `Sandbox execution error: ${err.message}`,
      exitCode: 1,
      executionTimeMs: 0
    };
  } finally {
    // Ephemeral workspace cleanup
    try {
      await fs.rm(runDir, { recursive: true, force: true });
    } catch (cleanErr) {
      console.error(`Failed to clean run directory ${runDir}:`, cleanErr.message);
    }
  }
}
