importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');

let pyodideReadyPromise;

async function loadPyodideAndPackages() {
  self.pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
  });
}

pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (e) => {
  const { code, stdin } = e.data;
  
  try {
    await pyodideReadyPromise;
    
    let output = '';
    
    // Redirect stdout and stderr
    self.pyodide.setStdout({ batched: (msg) => { output += msg + '\n'; } });
    self.pyodide.setStderr({ batched: (msg) => { output += msg + '\n'; } });

    // Handle stdin by injecting it into a JS array that Python can read
    self.stdinLines = stdin ? stdin.split('\n') : [];
    
    // Setup Python environment to override input()
    const pySetupCode = `
import sys
import js

def custom_input(prompt=""):
    if len(js.stdinLines) > 0:
        return js.stdinLines.pop(0)
    return ""

__builtins__.input = custom_input
    `;
    
    await self.pyodide.runPythonAsync(pySetupCode);
    
    // Run the actual user code
    await self.pyodide.runPythonAsync(code);
    
    self.postMessage({ output, error: null });
  } catch (err) {
    self.postMessage({ output, error: err.toString() });
  }
};
