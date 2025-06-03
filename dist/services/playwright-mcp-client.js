import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
export class PlaywrightMCPClient {
    client = null;
    transport = null;
    serverProcess = null;
    isConnected = false;
    config;
    constructor(config = {}) {
        this.config = {
            serverCommand: 'npx',
            serverArgs: ['@microsoft/playwright-mcp'],
            browser: 'chromium',
            headless: true,
            viewport: { width: 1280, height: 720 },
            ...config
        };
    }
    async connect() {
        if (this.isConnected) {
            return;
        }
        try {
            console.error('Starting Playwright MCP server...');
            // Start the Playwright MCP server process
            this.serverProcess = spawn(this.config.serverCommand, this.config.serverArgs, {
                stdio: ['pipe', 'pipe', 'inherit'],
                env: {
                    ...process.env,
                    BROWSER: this.config.browser,
                    HEADLESS: this.config.headless ? 'true' : 'false',
                    VIEWPORT_WIDTH: this.config.viewport.width.toString(),
                    VIEWPORT_HEIGHT: this.config.viewport.height.toString(),
                    // Better User-Agent for Reddit
                    USER_AGENT: 'PersonalLinkGarden/1.0 (Compatible Browser for Personal Use; Contact: your-email@example.com)'
                }
            });
            // Create transport using the server's stdio
            this.transport = new StdioClientTransport({
                stdin: this.serverProcess.stdin,
                stdout: this.serverProcess.stdout
            });
            // Create MCP client
            this.client = new Client({
                name: 'intelligent-content-discovery',
                version: '1.0.0'
            }, {
                capabilities: {
                    roots: {
                        listChanged: false
                    }
                }
            });
            // Connect to the server
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.error('✅ Connected to Playwright MCP server');
            // Handle server process events
            this.serverProcess.on('error', (error) => {
                console.error('Playwright MCP server error:', error);
                this.isConnected = false;
            });
            this.serverProcess.on('exit', (code) => {
                console.error(`Playwright MCP server exited with code ${code}`);
                this.isConnected = false;
            });
        }
        catch (error) {
            console.error('Failed to connect to Playwright MCP server:', error);
            throw new Error(`Playwright MCP connection failed: ${error.message}`);
        }
    }
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        try {
            if (this.client) {
                await this.client.close();
                this.client = null;
            }
            if (this.transport) {
                await this.transport.close();
                this.transport = null;
            }
            if (this.serverProcess) {
                this.serverProcess.kill();
                this.serverProcess = null;
            }
            this.isConnected = false;
            console.error('✅ Disconnected from Playwright MCP server');
        }
        catch (error) {
            console.error('Error during disconnect:', error);
        }
    }
    async navigate(url) {
        // Add delay to be respectful, especially for Reddit
        if (url.includes('reddit.com')) {
            await this.sleep(2000); // 2 second delay for Reddit
        }
        else {
            await this.sleep(1000); // 1 second delay for other sites
        }
        return this.executeAction({
            type: 'navigate',
            params: {
                url,
                // Add extra options for better compatibility
                waitUntil: 'networkidle',
                timeout: 30000
            }
        });
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async click(selector) {
        return this.executeAction({
            type: 'click',
            params: { selector }
        });
    }
    async type(selector, text) {
        return this.executeAction({
            type: 'type',
            params: { selector, text }
        });
    }
    async takeScreenshot(fullPage = false) {
        return this.executeAction({
            type: 'screenshot',
            params: { fullPage }
        });
    }
    async getAccessibilitySnapshot() {
        const result = await this.executeAction({
            type: 'snapshot',
            params: {}
        });
        if (!result.success) {
            throw new Error(`Failed to get accessibility snapshot: ${result.error}`);
        }
        return result.data?.elements || [];
    }
    async waitForSelector(selector, timeout = 5000) {
        return this.executeAction({
            type: 'wait',
            params: { selector, timeout }
        });
    }
    async evaluateScript(script) {
        return this.executeAction({
            type: 'evaluate',
            params: { script }
        });
    }
    async executeAction(action) {
        if (!this.isConnected || !this.client) {
            throw new Error('Not connected to Playwright MCP server');
        }
        try {
            const toolName = this.getToolName(action.type);
            const response = await this.client.callTool({
                name: toolName,
                arguments: action.params
            });
            if (response.isError) {
                return {
                    success: false,
                    error: response.content[0]?.text || 'Unknown error'
                };
            }
            // Parse the response content
            const content = response.content[0];
            let data = {};
            if (content?.type === 'text') {
                try {
                    data = JSON.parse(content.text);
                }
                catch {
                    data = { text: content.text };
                }
            }
            else if (content?.type === 'image') {
                data = { image: content.data };
            }
            return {
                success: true,
                data
            };
        }
        catch (error) {
            console.error(`Error executing ${action.type}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    getToolName(actionType) {
        const toolMap = {
            'navigate': 'browser_navigate',
            'click': 'browser_click',
            'type': 'browser_type',
            'screenshot': 'browser_take_screenshot',
            'close': 'browser_close',
            'wait': 'browser_wait_for_selector',
            'evaluate': 'browser_evaluate',
            'snapshot': 'browser_accessibility_snapshot'
        };
        const toolName = toolMap[actionType];
        if (!toolName) {
            throw new Error(`Unknown action type: ${actionType}`);
        }
        return toolName;
    }
    // Learning mode specific methods
    async startLearningSession(sessionName, targetUrl) {
        const sessionId = `learning_${Date.now()}_${sessionName}`;
        // Navigate to target URL to start learning
        const navResult = await this.navigate(targetUrl);
        if (!navResult.success) {
            throw new Error(`Failed to navigate to ${targetUrl}: ${navResult.error}`);
        }
        // Take initial screenshot and snapshot
        const [screenshot, snapshot] = await Promise.all([
            this.takeScreenshot(true),
            this.getAccessibilitySnapshot()
        ]);
        console.error(`🎓 Learning session started: ${sessionId}`);
        console.error(`📍 Target URL: ${targetUrl}`);
        console.error(`📊 Initial elements found: ${snapshot.length}`);
        return sessionId;
    }
    async captureInteraction(sessionId, action, element) {
        const timestamp = Date.now();
        // Execute the action
        const result = await this.executeAction(action);
        // Capture current context
        const [snapshot] = await Promise.all([
            this.getAccessibilitySnapshot()
        ]);
        // Get current page info
        const pageInfo = await this.evaluateScript(`
      JSON.stringify({
        url: window.location.href,
        title: document.title
      })
    `);
        const context = {
            url: pageInfo.success ? JSON.parse(pageInfo.data.text).url : '',
            title: pageInfo.success ? JSON.parse(pageInfo.data.text).title : '',
            snapshot
        };
        const interaction = {
            timestamp,
            action,
            element,
            result,
            context
        };
        console.error(`📝 Captured interaction: ${action.type} - ${result.success ? 'Success' : 'Failed'}`);
        return interaction;
    }
    isReady() {
        return this.isConnected && this.client !== null;
    }
    getConfig() {
        return { ...this.config };
    }
}
//# sourceMappingURL=playwright-mcp-client.js.map