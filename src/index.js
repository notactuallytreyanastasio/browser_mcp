import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { CommandProcessor } from './command-processor.js';
import { Database } from './database.js';
import { SessionManager } from './session-manager.js';

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
    this.database = new Database();
    this.commandProcessor = new CommandProcessor(this);
    this.sessionManager = new SessionManager();
    this.setupToolHandlers();
    this.initDatabase();
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
        {
          name: 'open_visual_browser',
          description: 'Opens a visible browser window for interactive learning',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to navigate to (optional)',
              },
            },
          },
        },
        {
          name: 'start_learning_mode',
          description: 'Starts click detection mode to learn element patterns',
          inputSchema: {
            type: 'object',
            properties: {
              pattern_name: {
                type: 'string',
                description: 'Name for the pattern being learned',
              },
            },
            required: ['pattern_name'],
          },
        },
        {
          name: 'extract_learned_elements',
          description: 'Extract elements using learned patterns',
          inputSchema: {
            type: 'object',
            properties: {
              pattern_name: {
                type: 'string',
                description: 'Name of the pattern to use for extraction',
              },
            },
            required: ['pattern_name'],
          },
        },
        {
          name: 'get_learned_patterns',
          description: 'Get all learned patterns for the current site',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'check_learning_status',
          description: 'Check if learning mode is active and how many elements have been clicked',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'clear_learning_mode',
          description: 'Clear learning mode and unselect all elements without saving',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'apply_saved_pattern',
          description: 'Apply a previously saved pattern to extract data from the current page',
          inputSchema: {
            type: 'object',
            properties: {
              pattern_name: {
                type: 'string',
                description: 'Name of the saved pattern to apply',
              },
            },
            required: ['pattern_name'],
          },
        },
        {
          name: 'list_all_patterns',
          description: 'List all saved patterns across all domains',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_session_stats',
          description: 'Get session statistics and rate limiting info',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'test_browser_health',
          description: 'Test if browser automation is working correctly',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_top_stories_multi',
          description: 'Get top stories from multiple sites and subreddits in one command. Example: "Get the top 10 stories from /r/television /r/news and hacker news"',
          inputSchema: {
            type: 'object',
            properties: {
              sites: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of sites/subreddits like ["/r/television", "/r/news", "hacker news", "news.ycombinator.com"]'
              },
              count: {
                type: 'number',
                description: 'Number of stories to get from each site (default: 10)',
                default: 10
              },
              format: {
                type: 'string',
                enum: ['markdown', 'json', 'plain'],
                description: 'Output format (default: markdown)',
                default: 'markdown'
              },
              save_links: {
                type: 'boolean',
                description: 'Whether to save extracted links to database (default: true)',
                default: true
              }
            },
            required: ['sites']
          },
        },
        {
          name: 'query_links',
          description: 'Query saved links with filters and search',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of links to return (default: 50)',
                default: 50
              },
              is_curated: {
                type: 'boolean',
                description: 'Filter by curated status'
              },
              is_public: {
                type: 'boolean',
                description: 'Filter by public status'
              },
              source_site: {
                type: 'string',
                description: 'Filter by source site (e.g., "reddit.com")'
              },
              search_text: {
                type: 'string',
                description: 'Search in title, description, and notes'
              },
              min_score: {
                type: 'number',
                description: 'Minimum score (1-5)'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags'
              }
            }
          },
        },
        {
          name: 'curate_link',
          description: 'Mark a link as curated and optionally add metadata',
          inputSchema: {
            type: 'object',
            properties: {
              link_id: {
                type: 'number',
                description: 'ID of the link to curate'
              },
              score: {
                type: 'number',
                description: 'Rating 1-5 (optional)'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for categorization (optional)'
              },
              notes: {
                type: 'string',
                description: 'Personal notes about the link (optional)'
              },
              is_public: {
                type: 'boolean',
                description: 'Make link public for sharing (optional)'
              },
              description: {
                type: 'string',
                description: 'Custom description (optional)'
              }
            },
            required: ['link_id']
          },
        },
        {
          name: 'execute_sql',
          description: 'Execute a SELECT SQL query on the database',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL SELECT query to execute'
              },
              params: {
                type: 'array',
                items: { type: 'string' },
                description: 'Parameters for prepared statement (optional)'
              }
            },
            required: ['query']
          },
        },
        {
          name: 'get_database_schema',
          description: 'Get the database schema and table structure',
          inputSchema: {
            type: 'object',
            properties: {}
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
          
          case 'open_visual_browser':
            return await this.openVisualBrowser(args.url);
          
          case 'start_learning_mode':
            return await this.startLearningMode(args.pattern_name);
          
          case 'extract_learned_elements':
            return await this.extractLearnedElements(args.pattern_name);
          
          case 'get_learned_patterns':
            return await this.getLearnedPatterns();
          
          case 'check_learning_status':
            return await this.checkLearningStatus();
          
          case 'clear_learning_mode':
            return await this.clearLearningMode();
          
          case 'apply_saved_pattern':
            return await this.applySavedPattern(args.pattern_name);
          
          case 'list_all_patterns':
            return await this.listAllPatterns();
          
          case 'get_top_stories_multi':
            return await this.getTopStoriesMulti(args.sites, args.count || 10, args.format || 'markdown', args.save_links !== false);
          
          case 'query_links':
            return await this.queryLinks(args);
          
          case 'curate_link':
            return await this.curateLink(args);
          
          case 'execute_sql':
            return await this.executeSql(args.query, args.params || []);
          
          case 'get_database_schema':
            return await this.getDatabaseSchema();
          
          case 'get_session_stats':
            return await this.getSessionStats();
          
          case 'test_browser_health':
            return await this.testBrowserHealth();
          
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

    try {
      console.error('Starting browser launch...');
      
      this.browser = await chromium.launch({ 
        headless: true, 
        slowMo: 200, // Slower for more human-like behavior
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      
      console.error('Browser launched, creating context...');
      
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: this.sessionManager.getRandomUserAgent()
      });
      
      console.error('Context created, opening page...');
      
      this.page = await context.newPage();
      
      console.error('Page opened, setting up detection prevention...');
      
      // Set up detection prevention
      await this.sessionManager.handleDetectionPrevention(this.page);
      
      console.error('Browser setup complete');
      
      return {
        content: [
          {
            type: 'text',
            text: 'Browser opened successfully with session management',
          },
        ],
      };
    } catch (error) {
      console.error('Browser launch failed:', error);
      
      // Cleanup on failure
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          console.error('Failed to close browser after error:', e);
        }
        this.browser = null;
        this.page = null;
      }
      
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  async navigateTo(url) {
    if (!this.page) {
      throw new Error('Browser not opened. Please open browser first.');
    }

    // Add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const domain = new URL(url).hostname;
    
    // Set up session for this domain
    await this.sessionManager.setupPageForDomain(this.page, domain);
    
    // Respect rate limits
    await this.sessionManager.respectRateLimit(domain);
    
    // Navigate with timeout and proper waiting
    await this.page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Save session after successful navigation
    await this.sessionManager.savePageSession(this.page, domain);
    
    return {
      content: [
        {
          type: 'text',
          text: `Navigated to ${url} with session management`,
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

    // Try old.reddit.com first - more reliable for scraping
    await this.page.goto('https://old.reddit.com');
    
    // Wait for content to load
    await this.page.waitForLoadState('networkidle');
    
    try {
      // Get the top stories from old.reddit.com
      const stories = await this.page.evaluate((count) => {
        const posts = document.querySelectorAll('.thing.link');
        const topStories = [];
        
        for (let i = 0; i < Math.min(count, posts.length); i++) {
          const post = posts[i];
          const titleElement = post.querySelector('.title a.title');
          const scoreElement = post.querySelector('.score.unvoted');
          const commentsElement = post.querySelector('.comments');
          const subredditElement = post.querySelector('.subreddit');
          
          if (titleElement) {
            const title = titleElement.textContent.trim();
            const link = titleElement.href;
            const score = scoreElement ? scoreElement.textContent.trim() : '0';
            const comments = commentsElement ? commentsElement.textContent.trim() : '0 comments';
            const subreddit = subredditElement ? subredditElement.textContent.trim() : '';
            
            topStories.push({
              title,
              link,
              score,
              comments,
              subreddit
            });
          }
        }
        
        return topStories;
      }, count);

      if (stories.length === 0) {
        // Fallback to new reddit if old.reddit fails
        await this.page.goto('https://reddit.com');
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000); // Wait for JS to load
        
        const newRedditStories = await this.page.evaluate((count) => {
          const selectors = [
            '[data-testid="post-container"]',
            'article[data-testid="post-container"]',
            '.Post',
            '[data-click-id="background"]'
          ];
          
          let posts = [];
          for (const selector of selectors) {
            posts = document.querySelectorAll(selector);
            if (posts.length > 0) break;
          }
          
          const topStories = [];
          
          for (let i = 0; i < Math.min(count, posts.length); i++) {
            const post = posts[i];
            let titleElement = post.querySelector('h3') || 
                             post.querySelector('[data-click-id="body"] h3') ||
                             post.querySelector('.Post-title') ||
                             post.querySelector('[slot="title"]');
            
            if (titleElement) {
              const title = titleElement.textContent.trim();
              const linkElement = post.querySelector('a[data-click-id="body"]') || 
                                post.querySelector('.Post-title a') ||
                                post.querySelector('a[href*="/r/"]');
              
              topStories.push({
                title,
                link: linkElement ? linkElement.href : 'https://reddit.com',
                score: 'N/A',
                comments: 'N/A',
                subreddit: 'N/A'
              });
            }
          }
          
          return topStories;
        }, count);
        
        return {
          content: [
            {
              type: 'text',
              text: `Top ${count} Reddit stories (from new Reddit):\n\n` + 
                    (newRedditStories.length > 0 ? 
                      newRedditStories.map((story, i) => 
                        `${i + 1}. ${story.title}\n   Link: ${story.link}`
                      ).join('\n\n') :
                      'No stories found. Reddit may be blocking automated access.'),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Top ${count} Reddit stories:\n\n` + 
                  stories.map((story, i) => 
                    `${i + 1}. ${story.title}\n   ${story.subreddit} • ${story.score} points • ${story.comments}\n   Link: ${story.link}`
                  ).join('\n\n'),
          },
        ],
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching Reddit stories: ${error.message}\n\nReddit may be blocking automated access or their page structure has changed.`,
          },
        ],
      };
    }
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

  async initDatabase() {
    try {
      await this.database.init();
      console.error('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
    }
  }

  async openVisualBrowser(url) {
    if (this.browser) {
      await this.browser.close();
    }

    // Launch browser in HEAD mode (visible)
    this.browser = await chromium.launch({ 
      headless: false,
      slowMo: 200 // Slower for better visibility
    });
    this.page = await this.browser.newPage();
    
    // Set user agent
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      await this.page.goto(url);
    }

    return {
      content: [
        {
          type: 'text',
          text: url ? `Visual browser opened and navigated to ${url}` : 'Visual browser opened. Ready for interaction.',
        },
      ],
    };
  }

  async startLearningMode(patternName) {
    if (!this.page) {
      throw new Error('No browser page open. Use open_visual_browser first.');
    }

    const currentUrl = this.page.url();
    const domain = new URL(currentUrl).hostname;

    // Inject click detection script directly into the page
    await this.page.evaluate(() => {
      window.clickedElements = [];
      window.learningMode = true;
      
      // Remove existing indicator if present
      const existingIndicator = document.getElementById('learning-mode-indicator');
      if (existingIndicator) existingIndicator.remove();
      
      // Add visual indicator
      const indicator = document.createElement('div');
      indicator.id = 'learning-mode-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #ff4444;
        color: white;
        padding: 10px;
        border-radius: 5px;
        z-index: 99999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      indicator.textContent = 'LEARNING MODE ACTIVE - Click elements to capture';
      document.body.appendChild(indicator);

      // Remove existing listeners
      if (window.learningClickHandler) {
        document.removeEventListener('click', window.learningClickHandler, true);
      }

      // Add click listener
      window.learningClickHandler = (event) => {
        if (window.learningMode) {
          event.preventDefault();
          event.stopPropagation();
          
          const element = event.target;
          
          // Check if element is already selected by looking for our custom attribute
          const isAlreadySelected = element.hasAttribute('data-learning-selected');
          
          if (isAlreadySelected) {
            // UNSELECT: Remove from array and clear styling
            const elementIndex = parseInt(element.getAttribute('data-learning-index'));
            
            // Remove from clickedElements array
            window.clickedElements.splice(elementIndex, 1);
            
            // Update indices for remaining elements
            window.clickedElements.forEach((el, index) => {
              const foundElement = document.querySelector(`[data-learning-index="${el.originalIndex}"]`);
              if (foundElement) {
                foundElement.setAttribute('data-learning-index', index);
              }
            });
            
            // Clear selection styling
            element.style.border = element.getAttribute('data-original-border') || '';
            element.style.backgroundColor = element.getAttribute('data-original-bg') || '';
            element.style.boxShadow = element.getAttribute('data-original-shadow') || '';
            
            // Remove our tracking attributes
            element.removeAttribute('data-learning-selected');
            element.removeAttribute('data-learning-index');
            element.removeAttribute('data-original-border');
            element.removeAttribute('data-original-bg');
            element.removeAttribute('data-original-shadow');
            
            console.log('Element unselected');
          } else {
            // SELECT: Add to array and apply styling
            const rect = element.getBoundingClientRect();
            
            // Store original styles
            element.setAttribute('data-original-border', element.style.border || '');
            element.setAttribute('data-original-bg', element.style.backgroundColor || '');
            element.setAttribute('data-original-shadow', element.style.boxShadow || '');
            
            // Generate multiple selector strategies
            const selectors = [];
            
            // ID selector
            if (element.id) {
              selectors.push(`#${element.id}`);
            }
            
            // Class selector
            if (element.className && typeof element.className === 'string') {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) {
                selectors.push(`.${classes.join('.')}`);
              }
            }
            
            // Tag + attributes
            let tagSelector = element.tagName.toLowerCase();
            if (element.getAttribute('data-testid')) {
              selectors.push(`[data-testid="${element.getAttribute('data-testid')}"]`);
            }
            if (element.getAttribute('role')) {
              tagSelector += `[role="${element.getAttribute('role')}"]`;
            }
            selectors.push(tagSelector);
            
            // nth-child selector for more reliability
            const parent = element.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children);
              const index = siblings.indexOf(element) + 1;
              selectors.push(`${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-child(${index})`);
            }
            
            const elementInfo = {
              selectors: [...new Set(selectors)], // Remove duplicates
              text: element.textContent.trim(),
              tagName: element.tagName.toLowerCase(),
              type: element.type || 'unknown',
              href: element.href || null,
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              originalIndex: window.clickedElements.length
            };
            
            window.clickedElements.push(elementInfo);
            
            // Mark as selected and store index
            element.setAttribute('data-learning-selected', 'true');
            element.setAttribute('data-learning-index', window.clickedElements.length - 1);
            
            // Visual feedback for selection
            element.style.border = '3px solid #ff4444';
            element.style.backgroundColor = 'rgba(255, 68, 68, 0.1)';
            element.style.boxShadow = '0 0 10px rgba(255, 68, 68, 0.5)';
            
            console.log('Element selected:', elementInfo);
          }
          
          // Update counter in indicator
          const indicator = document.getElementById('learning-mode-indicator');
          if (indicator) {
            indicator.textContent = `LEARNING MODE - ${window.clickedElements.length} elements selected (click again to unselect)`;
          }
        }
      };
      
      document.addEventListener('click', window.learningClickHandler, true);
    });

    return {
      content: [
        {
          type: 'text',
          text: `Learning mode started for pattern "${patternName}". Click on elements you want to extract. The system will learn the selectors. Each click will be recorded.`,
        },
      ],
    };
  }

  async extractLearnedElements(patternName) {
    if (!this.page) {
      throw new Error('No browser page open.');
    }

    const currentUrl = this.page.url();
    const domain = new URL(currentUrl).hostname;

    // Get clicked elements from the page
    const clickedElements = await this.page.evaluate(() => {
      return window.clickedElements || [];
    });

    if (clickedElements.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No elements were clicked. Use start_learning_mode and click on elements first.',
          },
        ],
      };
    }

    // Save the pattern to database
    const pattern = {
      name: patternName,
      description: `Pattern learned from ${clickedElements.length} clicked elements`,
      selectors: clickedElements.map(el => el.selectors).flat(),
      sampleData: clickedElements
    };

    const patternId = await this.database.savePattern(domain, pattern);
    console.error(`Pattern "${patternName}" saved to database with ID: ${patternId}`);

    // Extract current data using learned selectors
    const extractedData = [];
    for (const element of clickedElements) {
      for (const selector of element.selectors) {
        try {
          const elements = await this.page.$$(selector);
          for (const el of elements) {
            const text = await el.textContent();
            const href = await el.getAttribute('href');
            if (text && text.trim()) {
              extractedData.push({
                selector,
                text: text.trim(),
                href: href,
                type: element.type
              });
            }
          }
          break; // Use first working selector
        } catch (error) {
          continue; // Try next selector
        }
      }
    }

    // Clear learning mode
    await this.page.evaluate(() => {
      window.learningMode = false;
      
      // Clear all selected elements styling
      const selectedElements = document.querySelectorAll('[data-learning-selected]');
      selectedElements.forEach(element => {
        element.style.border = element.getAttribute('data-original-border') || '';
        element.style.backgroundColor = element.getAttribute('data-original-bg') || '';
        element.style.boxShadow = element.getAttribute('data-original-shadow') || '';
        
        element.removeAttribute('data-learning-selected');
        element.removeAttribute('data-learning-index');
        element.removeAttribute('data-original-border');
        element.removeAttribute('data-original-bg');
        element.removeAttribute('data-original-shadow');
      });
      
      window.clickedElements = [];
      const indicator = document.getElementById('learning-mode-indicator');
      if (indicator) indicator.remove();
      
      // Remove click handler
      if (window.learningClickHandler) {
        document.removeEventListener('click', window.learningClickHandler, true);
        window.learningClickHandler = null;
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: `Pattern "${patternName}" saved! Extracted ${extractedData.length} elements:\n\n` +
                extractedData.map((item, i) => 
                  `${i + 1}. ${item.text}${item.href ? ` (${item.href})` : ''}`
                ).join('\n'),
        },
      ],
    };
  }

  async getLearnedPatterns() {
    if (!this.page) {
      throw new Error('No browser page open.');
    }

    const currentUrl = this.page.url();
    const domain = new URL(currentUrl).hostname;
    
    const patterns = await this.database.getPatterns(domain);

    return {
      content: [
        {
          type: 'text',
          text: patterns.length > 0 ? 
            `Learned patterns for ${domain}:\n\n` +
            patterns.map((p, i) => 
              `${i + 1}. ${p.pattern_name} - ${p.description} (used ${p.success_count} times)`
            ).join('\n') :
            `No learned patterns found for ${domain}`,
        },
      ],
    };
  }

  async checkLearningStatus() {
    if (!this.page) {
      throw new Error('No browser page open.');
    }

    const status = await this.page.evaluate(() => {
      return {
        learningMode: window.learningMode || false,
        clickedElements: window.clickedElements ? window.clickedElements.length : 0,
        hasHandler: !!window.learningClickHandler,
        hasIndicator: !!document.getElementById('learning-mode-indicator')
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: `Learning Status:\n` +
                `- Learning Mode Active: ${status.learningMode}\n` +
                `- Elements Selected: ${status.clickedElements}\n` +
                `- Click Handler Installed: ${status.hasHandler}\n` +
                `- Visual Indicator Present: ${status.hasIndicator}\n\n` +
                (status.learningMode ? 
                  'Learning mode is active! Click elements to select/unselect them.' :
                  'Learning mode is not active. Use start_learning_mode first.'),
        },
      ],
    };
  }

  async clearLearningMode() {
    if (!this.page) {
      throw new Error('No browser page open.');
    }

    const elementsCleared = await this.page.evaluate(() => {
      const elementsCount = window.clickedElements ? window.clickedElements.length : 0;
      
      window.learningMode = false;
      
      // Clear all selected elements styling
      const selectedElements = document.querySelectorAll('[data-learning-selected]');
      selectedElements.forEach(element => {
        element.style.border = element.getAttribute('data-original-border') || '';
        element.style.backgroundColor = element.getAttribute('data-original-bg') || '';
        element.style.boxShadow = element.getAttribute('data-original-shadow') || '';
        
        element.removeAttribute('data-learning-selected');
        element.removeAttribute('data-learning-index');
        element.removeAttribute('data-original-border');
        element.removeAttribute('data-original-bg');
        element.removeAttribute('data-original-shadow');
      });
      
      window.clickedElements = [];
      const indicator = document.getElementById('learning-mode-indicator');
      if (indicator) indicator.remove();
      
      // Remove click handler
      if (window.learningClickHandler) {
        document.removeEventListener('click', window.learningClickHandler, true);
        window.learningClickHandler = null;
      }
      
      return elementsCount;
    });

    return {
      content: [
        {
          type: 'text',
          text: `Learning mode cleared. ${elementsCleared} selected elements were unselected without saving.`,
        },
      ],
    };
  }

  async applySavedPattern(patternName) {
    if (!this.page) {
      throw new Error('No browser page open.');
    }

    const currentUrl = this.page.url();
    const domain = new URL(currentUrl).hostname;
    
    // Get all patterns for this domain
    const patterns = await this.database.getPatterns(domain);
    const pattern = patterns.find(p => p.pattern_name === patternName);
    
    if (!pattern) {
      return {
        content: [
          {
            type: 'text',
            text: `Pattern "${patternName}" not found for domain ${domain}. Available patterns: ${patterns.map(p => p.pattern_name).join(', ') || 'none'}`,
          },
        ],
      };
    }

    console.error(`Applying pattern "${patternName}" with ${pattern.selectors.length} selectors`);

    // Extract data using saved selectors
    const extractedData = [];
    const workingSelectors = [];
    
    for (const selector of pattern.selectors) {
      try {
        const elements = await this.page.$$(selector);
        console.error(`Selector "${selector}" found ${elements.length} elements`);
        
        if (elements.length > 0) {
          workingSelectors.push(selector);
          for (const el of elements) {
            const text = await el.textContent();
            const href = await el.getAttribute('href');
            const tagName = await el.evaluate(node => node.tagName.toLowerCase());
            
            if (text && text.trim()) {
              extractedData.push({
                selector,
                text: text.trim(),
                href: href,
                tagName: tagName
              });
            }
          }
          break; // Use first working selector to avoid duplicates
        }
      } catch (error) {
        console.error(`Error with selector "${selector}":`, error.message);
        continue; // Try next selector
      }
    }

    // Increment success count for this pattern
    if (extractedData.length > 0) {
      await this.database.incrementPatternSuccess(pattern.id);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Applied pattern "${patternName}" on ${domain}:\n\n` +
                `Working selectors: ${workingSelectors.join(', ')}\n` +
                `Extracted ${extractedData.length} elements:\n\n` +
                extractedData.map((item, i) => 
                  `${i + 1}. ${item.text}${item.href ? ` (${item.href})` : ''}`
                ).join('\n') +
                (extractedData.length === 0 ? '\nNo elements found. The page structure may have changed.' : ''),
        },
      ],
    };
  }

  async listAllPatterns() {
    // Get all patterns from database
    const allPatterns = await new Promise((resolve, reject) => {
      this.database.db.all(
        `SELECT p.*, s.domain, s.name as site_name 
         FROM patterns p 
         JOIN sites s ON p.site_id = s.id 
         ORDER BY s.domain, p.success_count DESC, p.updated_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    if (allPatterns.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No saved patterns found. Create some patterns using the learning mode first.',
          },
        ],
      };
    }

    // Group by domain
    const patternsByDomain = {};
    allPatterns.forEach(pattern => {
      if (!patternsByDomain[pattern.domain]) {
        patternsByDomain[pattern.domain] = [];
      }
      patternsByDomain[pattern.domain].push(pattern);
    });

    let output = `All Saved Patterns (${allPatterns.length} total):\n\n`;
    
    for (const [domain, patterns] of Object.entries(patternsByDomain)) {
      output += `📍 ${domain}:\n`;
      patterns.forEach((pattern, i) => {
        output += `  ${i + 1}. ${pattern.pattern_name} - ${pattern.description}\n`;
        output += `     Success count: ${pattern.success_count}, Created: ${pattern.created_at}\n`;
      });
      output += '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async getTopStoriesMulti(sites, count = 10, format = 'markdown') {
    console.error(`Getting top ${count} stories from sites: ${sites.join(', ')}`);
    
    const allStories = [];
    const errors = [];
    
    for (const site of sites) {
      try {
        console.error(`Processing site: ${site}`);
        
        // Normalize site input
        const siteInfo = this.normalizeSiteInput(site);
        const stories = await this.extractStoriesFromSite(siteInfo, count);
        
        allStories.push({
          site: siteInfo.displayName,
          url: siteInfo.url,
          stories: stories.slice(0, count)
        });
        
      } catch (error) {
        console.error(`Error extracting from ${site}:`, error.message);
        errors.push({ site, error: error.message });
      }
    }

    // Format output
    return {
      content: [
        {
          type: 'text',
          text: this.formatMultiSiteOutput(allStories, errors, format),
        },
      ],
    };
  }

  normalizeSiteInput(site) {
    const siteNormalized = site.toLowerCase().trim();
    
    // Handle Reddit subreddits
    if (siteNormalized.startsWith('/r/') || siteNormalized.startsWith('r/')) {
      const subreddit = siteNormalized.replace(/^\/?(r\/)?/, '');
      return {
        url: `https://reddit.com/r/${subreddit}`,
        domain: 'www.reddit.com',
        pattern: 'reddit_stories',
        displayName: `/r/${subreddit}`,
        type: 'reddit'
      };
    }
    
    // Handle Hacker News
    if (siteNormalized.includes('hacker') || siteNormalized.includes('news.ycombinator')) {
      return {
        url: 'https://news.ycombinator.com',
        domain: 'news.ycombinator.com',
        pattern: 'hacker_news_stories',
        displayName: 'Hacker News',
        type: 'hackernews'
      };
    }
    
    // Handle direct URLs
    if (site.startsWith('http')) {
      const url = new URL(site);
      return {
        url: site,
        domain: url.hostname,
        pattern: null, // Will try to find pattern
        displayName: url.hostname,
        type: 'custom'
      };
    }
    
    throw new Error(`Unknown site format: ${site}. Use /r/subreddit, hacker news, or full URLs.`);
  }

  async extractStoriesFromSite(siteInfo, count) {
    console.error(`Extracting from ${siteInfo.displayName} at ${siteInfo.url}`);
    
    // Navigate to the site
    if (!this.browser) {
      await this.openBrowser();
    }
    
    const domain = new URL(siteInfo.url).hostname;
    
    // Set up session for this domain
    await this.sessionManager.setupPageForDomain(this.page, domain);
    
    // Respect rate limits
    await this.sessionManager.respectRateLimit(domain, 2000, 5000);
    
    // Navigate with proper session handling
    await this.page.goto(siteInfo.url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Save session after navigation
    await this.sessionManager.savePageSession(this.page, domain);
    
    // Try to find and apply appropriate pattern
    let patternName = siteInfo.pattern;
    if (!patternName) {
      // Auto-detect pattern for this domain
      const patterns = await this.database.getPatterns(siteInfo.domain);
      if (patterns.length > 0) {
        patternName = patterns[0].pattern_name; // Use most successful pattern
        console.error(`Auto-detected pattern: ${patternName}`);
      }
    }
    
    if (!patternName) {
      throw new Error(`No saved pattern found for ${siteInfo.domain}. Please create a pattern first using learning mode.`);
    }
    
    // Apply the pattern
    const patterns = await this.database.getPatterns(siteInfo.domain);
    const pattern = patterns.find(p => p.pattern_name === patternName);
    
    if (!pattern) {
      throw new Error(`Pattern "${patternName}" not found for ${siteInfo.domain}`);
    }
    
    // Extract using selectors
    const stories = [];
    for (const selector of pattern.selectors) {
      try {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          for (const el of elements) {
            const text = await el.textContent();
            const href = await el.getAttribute('href');
            
            if (text && text.trim()) {
              // Make relative URLs absolute
              let fullUrl = href;
              if (href && !href.startsWith('http')) {
                fullUrl = new URL(href, siteInfo.url).toString();
              }
              
              stories.push({
                title: text.trim(),
                url: fullUrl,
                selector: selector
              });
            }
          }
          break; // Use first working selector
        }
      } catch (error) {
        continue;
      }
    }
    
    // Remove duplicates and limit count
    const uniqueStories = stories.filter((story, index, self) => 
      index === self.findIndex(s => s.title === story.title)
    );
    
    console.error(`Extracted ${uniqueStories.length} stories from ${siteInfo.displayName}`);
    return uniqueStories.slice(0, count);
  }

  formatMultiSiteOutput(allStories, errors, format) {
    let output = '';
    
    if (format === 'markdown') {
      output += `# Top Stories Feed\n\n`;
      
      allStories.forEach(siteData => {
        output += `## ${siteData.site}\n\n`;
        siteData.stories.forEach((story, i) => {
          if (story.url) {
            output += `${i + 1}. [${story.title}](${story.url})\n`;
          } else {
            output += `${i + 1}. ${story.title}\n`;
          }
        });
        output += '\n';
      });
      
      if (errors.length > 0) {
        output += `## Errors\n\n`;
        errors.forEach(error => {
          output += `- **${error.site}**: ${error.error}\n`;
        });
      }
      
    } else if (format === 'json') {
      output = JSON.stringify({ sites: allStories, errors }, null, 2);
    } else {
      // Plain format
      allStories.forEach(siteData => {
        output += `=== ${siteData.site} ===\n`;
        siteData.stories.forEach((story, i) => {
          output += `${i + 1}. ${story.title}\n`;
          if (story.url) output += `   ${story.url}\n`;
        });
        output += '\n';
      });
    }
    
    return output;
  }

  async getSessionStats() {
    const stats = this.sessionManager.getSessionStats();
    
    let output = `# Session Statistics\n\n`;
    
    if (Object.keys(stats).length === 0) {
      output += 'No sessions active yet.\n';
    } else {
      for (const [domain, data] of Object.entries(stats)) {
        output += `## ${domain}\n`;
        output += `- **Requests**: ${data.requestCount}\n`;
        output += `- **Last Request**: ${data.lastRequest ? new Date(data.lastRequest).toLocaleString() : 'Never'}\n`;
        output += `- **Has Session**: ${data.hasSession ? 'Yes' : 'No'}\n\n`;
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async testBrowserHealth() {
    let output = `# Browser Health Check\n\n`;
    
    try {
      // Test 1: Check if browser can be opened
      output += `## Test 1: Browser Launch\n`;
      if (this.browser) {
        output += `✅ Browser already open\n\n`;
      } else {
        output += `🔄 Attempting to launch browser...\n`;
        await this.openBrowser();
        output += `✅ Browser launched successfully\n\n`;
      }
      
      // Test 2: Check if we can navigate to a simple site
      output += `## Test 2: Basic Navigation\n`;
      output += `🔄 Testing navigation to example.com...\n`;
      await this.page.goto('https://example.com', { timeout: 15000 });
      output += `✅ Navigation successful\n\n`;
      
      // Test 3: Check if we can extract content
      output += `## Test 3: Content Extraction\n`;
      const title = await this.page.title();
      output += `✅ Page title extracted: "${title}"\n\n`;
      
      // Test 4: Session management
      output += `## Test 4: Session Management\n`;
      await this.sessionManager.setupPageForDomain(this.page, 'example.com');
      output += `✅ Session management working\n\n`;
      
      output += `## Overall Status: ✅ All systems operational\n`;
      
    } catch (error) {
      output += `## ❌ Error: ${error.message}\n\n`;
      output += `**Troubleshooting:**\n`;
      output += `- Check if Playwright browsers are installed: \`npx playwright install\`\n`;
      output += `- Check if the server has proper permissions\n`;
      output += `- Try restarting Claude Desktop\n`;
      
      console.error('Browser health check failed:', error);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
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