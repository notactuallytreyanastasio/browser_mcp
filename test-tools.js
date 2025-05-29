import { spawn } from 'child_process';

// Test if the server loads and lists tools correctly
async function testServer() {
  console.log('Testing MCP server tools...');
  
  const serverProcess = spawn('node', ['src/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  // Send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" }
    }
  };

  // Send tools/list request
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };

  let output = '';
  let hasResponse = false;

  serverProcess.stdout.on('data', (data) => {
    output += data.toString();
    
    // Look for tools response
    if (output.includes('get_top_stories_multi')) {
      console.log('✅ New tools found in server!');
      hasResponse = true;
      serverProcess.kill();
    } else if (output.includes('"tools":[')) {
      console.log('❌ Tools list found but missing get_top_stories_multi');
      console.log('Tools response:', output);
      hasResponse = true;
      serverProcess.kill();
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  // Send requests
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
  setTimeout(() => {
    serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
  }, 1000);

  // Timeout after 5 seconds
  setTimeout(() => {
    if (!hasResponse) {
      console.log('❌ Timeout - no response from server');
      console.log('Output received:', output);
    }
    serverProcess.kill();
  }, 5000);
}

testServer().catch(console.error);