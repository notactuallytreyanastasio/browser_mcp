import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testBrowserMCP() {
  console.log('Starting browser MCP server...');
  
  const serverProcess = spawn('node', ['src/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: process.cwd()
  });

  const transport = new StdioClientTransport({
    reader: serverProcess.stdout,
    writer: serverProcess.stdin
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    console.log('Connecting to MCP server...');
    await client.connect(transport);

    console.log('Testing natural language command: "open reddit and tell me the top three stories"');
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'process_command',
          arguments: {
            command: 'open reddit and tell me the top three stories'
          }
        }
      }
    );

    console.log('Result:', result);
    console.log('Content:', result.content[0].text);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    serverProcess.kill();
    console.log('Test completed');
  }
}

testBrowserMCP().catch(console.error);