self.onmessage = async (e) => {
  const { code, stdin } = e.data;
  
  let output = '';
  
  // Intercept console.log and console.error
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  console.log = (...args) => {
    output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
  };
  console.error = (...args) => {
    output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
  };

  try {
    // Provide a prompt replacement for stdin
    let stdinLines = stdin ? stdin.split('\n') : [];
    self.prompt = () => {
      return stdinLines.length > 0 ? stdinLines.shift() : null;
    };

    // Execute the JavaScript code
    // Use an IIFE to prevent variable bleeding if eval runs multiple times
    const executionWrapper = new Function(`
      return (async function() {
        ${code}
      })();
    `);
    
    await executionWrapper();

    self.postMessage({ output, error: null });
  } catch (error) {
    self.postMessage({ output, error: error.toString() });
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
};
