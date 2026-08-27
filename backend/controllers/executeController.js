import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function executeCode(req, res) {
  const { language, code, stdin = '' } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: 'Language and code are required.' });
  }

  const supportedLanguages = ['cpp14', 'cpplatest', 'java11', 'javalatest'];
  if (!supportedLanguages.includes(language)) {
    return res.status(400).json({ error: `Language ${language} is not supported by the backend execution engine.` });
  }

  const runId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `collabcode_exec_${runId}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    let fileName = '';
    let runCommand = '';

    // Convert Windows path to Docker compatible format if needed
    // Docker Desktop on Windows handles standard paths, but it's safer to use forward slashes
    const mountPath = tempDir.replace(/\\/g, '/');

    if (language === 'cpp14' || language === 'cpplatest') {
      fileName = 'main.cpp';
      const stdFlag = language === 'cpp14' ? '-std=c++14' : '-std=c++20';
      runCommand = `docker run --rm -v "${mountPath}:/app" -w /app gcc:latest bash -c "g++ ${stdFlag} main.cpp && ./a.out < input.txt"`;
    } else if (language === 'java11') {
      fileName = 'Main.java';
      runCommand = `docker run --rm -v "${mountPath}:/app" -w /app openjdk:11 bash -c "javac Main.java && java Main < input.txt"`;
    } else if (language === 'javalatest') {
      fileName = 'Main.java';
      runCommand = `docker run --rm -v "${mountPath}:/app" -w /app openjdk:latest bash -c "javac Main.java && java Main < input.txt"`;
    }

    // Normalize line endings to Linux format (LF) to prevent issues inside the Linux container
    const normalizedCode = code.replace(/\r\n/g, '\n');
    const normalizedStdin = stdin.replace(/\r\n/g, '\n');

    // Write code and stdin files
    await fs.writeFile(path.join(tempDir, fileName), normalizedCode);
    await fs.writeFile(path.join(tempDir, 'input.txt'), normalizedStdin);

    // Execute in Docker with a timeout of 15 seconds
    const { stdout, stderr } = await execPromise(runCommand, { timeout: 15000 });

    res.json({ output: stdout, error: stderr });
  } catch (error) {
    console.error('Execution error:', error);
    
    // Determine if it's a timeout, compilation error, or runtime error
    let errorMessage = error.message;
    if (error.killed && error.signal === 'SIGTERM') {
      errorMessage = 'Execution Timed Out (Limit: 15s)';
    } else if (error.stderr) {
      errorMessage = error.stderr; // Usually compilation or runtime error
    } else if (error.stdout) {
      errorMessage = error.stdout;
    }
    
    res.json({ output: '', error: errorMessage });
  } finally {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Failed to cleanup temp directory: ${tempDir}`, cleanupError);
    }
  }
}
