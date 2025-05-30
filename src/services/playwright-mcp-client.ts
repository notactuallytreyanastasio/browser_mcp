import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

export interface PlaywrightMCPConfig {
  serverCommand?: string;
  serverArgs?: string[];
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'screenshot' | 'close';
  params: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
}

export interface ElementSnapshot {
  role: string;
  name: string;
  selector: string;
  bounds: { x: number; y: number; width: number; height: number };
  text?: string;
  value?: string;
}

export interface LearningInteraction {
  timestamp: number;
  action: BrowserAction;
  element?: ElementSnapshot;
  result: ActionResult;
  context: {
    url: string;
    title: string;
    snapshot: ElementSnapshot[];
  };
}

export class PlaywrightMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverProcess: any = null;
  private isConnected = false;
  private config: PlaywrightMCPConfig;

  constructor(config: PlaywrightMCPConfig = {}) {
    this.config = {
      serverCommand: 'npx',
      serverArgs: ['@microsoft/playwright-mcp'],
      browser: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 720 },
      ...config
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      console.error('Starting Playwright MCP server...');
      
      // Start the Playwright MCP server process
      this.serverProcess = spawn(this.config.serverCommand!, this.config.serverArgs!, {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          BROWSER: this.config.browser,
          HEADLESS: this.config.headless ? 'true' : 'false',
          VIEWPORT_WIDTH: this.config.viewport!.width.toString(),
          VIEWPORT_HEIGHT: this.config.viewport!.height.toString()
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
      this.serverProcess.on('error', (error: Error) => {
        console.error('Playwright MCP server error:', error);
        this.isConnected = false;
      });

      this.serverProcess.on('exit', (code: number) => {
        console.error(`Playwright MCP server exited with code ${code}`);
        this.isConnected = false;
      });

    } catch (error) {
      console.error('Failed to connect to Playwright MCP server:', error);
      throw new Error(`Playwright MCP connection failed: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
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

    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  async navigate(url: string): Promise<ActionResult> {
    return this.executeAction({
      type: 'navigate',
      params: { url }
    });
  }

  async click(selector: string): Promise<ActionResult> {
    return this.executeAction({
      type: 'click',
      params: { selector }
    });
  }

  async type(selector: string, text: string): Promise<ActionResult> {
    return this.executeAction({
      type: 'type',
      params: { selector, text }
    });
  }

  async takeScreenshot(fullPage: boolean = false): Promise<ActionResult> {
    return this.executeAction({
      type: 'screenshot',
      params: { fullPage }
    });
  }

  async getAccessibilitySnapshot(): Promise<ElementSnapshot[]> {
    const result = await this.executeAction({
      type: 'snapshot',
      params: {}
    });

    if (!result.success) {
      throw new Error(`Failed to get accessibility snapshot: ${result.error}`);
    }

    return result.data?.elements || [];
  }

  async waitForSelector(selector: string, timeout: number = 5000): Promise<ActionResult> {
    return this.executeAction({
      type: 'wait',
      params: { selector, timeout }
    });
  }

  async evaluateScript(script: string): Promise<ActionResult> {
    return this.executeAction({
      type: 'evaluate',
      params: { script }
    });
  }

  private async executeAction(action: BrowserAction): Promise<ActionResult> {
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
      let data: any = {};

      if (content?.type === 'text') {
        try {
          data = JSON.parse(content.text);
        } catch {
          data = { text: content.text };
        }
      } else if (content?.type === 'image') {
        data = { image: content.data };
      }

      return {
        success: true,
        data
      };

    } catch (error) {
      console.error(`Error executing ${action.type}:`, error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private getToolName(actionType: string): string {
    const toolMap: Record<string, string> = {
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
  async startLearningSession(sessionName: string, targetUrl: string): Promise<string> {
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

  async captureInteraction(
    sessionId: string, 
    action: BrowserAction, 
    element?: ElementSnapshot
  ): Promise<LearningInteraction> {
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

    const interaction: LearningInteraction = {
      timestamp,
      action,
      element,
      result,
      context
    };

    console.error(`📝 Captured interaction: ${action.type} - ${result.success ? 'Success' : 'Failed'}`);
    
    return interaction;
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  getConfig(): PlaywrightMCPConfig {
    return { ...this.config };
  }
}