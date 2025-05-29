import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { CommandProcessor } from './command-processor.js';

class BrowserMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'browser-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.browser = null;
    this.page = null;
    this.commandProcessor = new CommandProcessor(this);
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'open_browser',
          description: 'Opens a browser instance',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'navigate_to',
          description: 'Navigate to a specific URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL to navigate to',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'get_page_content',
          description: 'Get the text content of the current page',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector to extract specific content (optional)',
              },
            },
          },
        },
        {
          name: 'get_top_stories',
          description: 'Get top stories from Reddit homepage',
          inputSchema: {
            type: 'object',
            properties: {
              count: {
                type: 'number',
                description: 'Number of stories to retrieve (default: 3)',
              },
            },
          },
        },
        {
          name: 'close_browser',
          description: 'Close the browser instance',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'process_command',
          description: 'Process natural language commands like "open reddit and tell me the top three stories"',
          inputSchema: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'Natural language command to process',
              },
            },
            required: ['command'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'open_browser':
            return await this.openBrowser();
          
          case 'navigate_to':
            return await this.navigateTo(args.url);
          
          case 'get_page_content':
            return await this.getPageContent(args.selector);
          
          case 'get_top_stories':
            return await this.getTopStories(args.count || 3);
          
          case 'close_browser':
            return await this.closeBrowser();
          
          case 'process_command':
            return await this.commandProcessor.processCommand(args.command);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async openBrowser() {
    if (this.browser) {
      return {
        content: [
          {
            type: 'text',
            text: 'Browser is already open',
          },
        ],
      };
    }

    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    
    return {
      content: [
        {
          type: 'text',
          text: 'Browser opened successfully',
        },
      ],
    };
  }

  async navigateTo(url) {
    if (!this.page) {
      throw new Error('Browser not opened. Please open browser first.');
    }

    // Add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    await this.page.goto(url);
    
    return {
      content: [
        {
          type: 'text',
          text: `Navigated to ${url}`,
        },
      ],
    };
  }

  async getPageContent(selector) {
    if (!this.page) {
      throw new Error('Browser not opened. Please open browser first.');
    }

    let content;
    if (selector) {
      content = await this.page.textContent(selector);
    } else {
      content = await this.page.textContent('body');
    }

    return {
      content: [
        {
          type: 'text',
          text: content || 'No content found',
        },
      ],
    };
  }

  async getTopStories(count = 3) {
    if (!this.page) {
      await this.openBrowser();
    }

    await this.page.goto('https://reddit.com');
    
    // Wait for the page to load
    await this.page.waitForLoadState('networkidle');
    
    // Get the top stories
    const stories = await this.page.evaluate((count) => {
      const posts = document.querySelectorAll('[data-testid="post-container"]');
      const topStories = [];
      
      for (let i = 0; i < Math.min(count, posts.length); i++) {
        const post = posts[i];
        const titleElement = post.querySelector('h3');
        const linkElement = post.querySelector('a[data-click-id="body"]');
        
        if (titleElement) {
          topStories.push({
            title: titleElement.textContent.trim(),
            link: linkElement ? linkElement.href : null,
          });
        }
      }
      
      return topStories;
    }, count);

    return {
      content: [
        {
          type: 'text',
          text: `Top ${count} Reddit stories:\n\n` + 
                stories.map((story, i) => 
                  `${i + 1}. ${story.title}\n   ${story.link || 'No link available'}`
                ).join('\n\n'),
        },
      ],
    };
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      
      return {
        content: [
          {
            type: 'text',
            text: 'Browser closed successfully',
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: 'Browser was not open',
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Browser MCP server running on stdio');
  }
}

const server = new BrowserMCPServer();
server.run().catch(console.error);