import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { CommandProcessor } from './command-processor.js';
import { Database } from './database.js';
import { SessionManager } from './session-manager.js';
import { BrowserHistoryMonitor } from './tools/browser-history-monitor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
    this.historyMonitor = new BrowserHistoryMonitor(this.database);
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
          description: 'Apply a previously saved pattern to extract data from the current page and optionally save to database',
          inputSchema: {
            type: 'object',
            properties: {
              pattern_name: {
                type: 'string',
                description: 'Name of the saved pattern to apply',
              },
              save_links: {
                type: 'boolean',
                description: 'Whether to automatically save extracted links to database (default: true)',
                default: true
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
          name: 'query_with_natural_language',
          description: 'Describe what you want to find and get AI-generated SQL with results',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description of what you want to find (e.g., "Show me my highest rated AI-related links from Hacker News")'
              },
              execute: {
                type: 'boolean',
                description: 'Whether to execute the generated query (default: true)',
                default: true
              }
            },
            required: ['description']
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
        {
          name: 'bag_of_links',
          description: 'Get a curated bag of diverse, interesting links from your collection in a clean HTML format',
          inputSchema: {
            type: 'object',
            properties: {
              count: {
                type: 'number',
                description: 'Number of links to include in the bag (default: 10)',
                default: 10
              },
              min_days_old: {
                type: 'number',
                description: 'Minimum days old for links (default: 2)',
                default: 2
              },
              max_days_old: {
                type: 'number',
                description: 'Maximum days old for links (default: 90)',
                default: 90
              }
            }
          },
        },
        {
          name: 'remove_ai_tags',
          description: 'Remove all "ai" tags from your saved links database',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        },
        {
          name: 'tag_cloud',
          description: 'Generate an interactive tag cloud HTML page showing tag frequency and associated links',
          inputSchema: {
            type: 'object',
            properties: {
              max_tags: {
                type: 'number',
                description: 'Maximum number of tags to include (default: 50)',
                default: 50
              },
              links_per_tag: {
                type: 'number',
                description: 'Maximum number of links to show per tag (default: 5)',
                default: 5
              }
            }
          },
        },
        {
          name: 'delete_pattern',
          description: 'Delete a specific learned pattern by name and domain',
          inputSchema: {
            type: 'object',
            properties: {
              pattern_name: {
                type: 'string',
                description: 'Name of the pattern to delete'
              },
              domain: {
                type: 'string',
                description: 'Domain where the pattern exists (e.g., "old.reddit.com")',
                default: 'old.reddit.com'
              }
            },
            required: ['pattern_name']
          },
        },
        {
          name: 'query_metadata',
          description: 'Query the rich metadata stored with extracted links for analytics',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of records to return (default: 10)',
                default: 10
              },
              site: {
                type: 'string',
                description: 'Filter by source site (e.g., "old.reddit.com")'
              }
            }
          },
        },
        {
          name: 'start_crawl',
          description: 'Start an intelligent crawl to discover new subreddits and interesting content based on your interests',
          inputSchema: {
            type: 'object',
            properties: {
              seed_subreddits: {
                type: 'array',
                items: { type: 'string' },
                description: 'Starting subreddits to crawl from (e.g., ["programming", "technology"])',
                default: ["programming", "technology", "datascience"]
              },
              max_subreddits: {
                type: 'number',
                description: 'Maximum number of new subreddits to discover (default: 10)',
                default: 10
              },
              links_per_subreddit: {
                type: 'number',
                description: 'Number of top links to collect from each subreddit (default: 5)',
                default: 5
              },
              discovery_depth: {
                type: 'number',
                description: 'How deep to crawl (1 = direct, 2 = friends of friends, etc.) (default: 2)',
                default: 2
              }
            }
          },
        },
        {
          name: 'archive_url',
          description: 'Archive a webpage for offline viewing with full resource capture',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to archive'
              },
              link_id: {
                type: 'number',
                description: 'Optional link ID to associate with this archive'
              },
              format: {
                type: 'string',
                enum: ['directory', 'mhtml'],
                description: 'Archive format (default: directory)',
                default: 'directory'
              },
              include_screenshot: {
                type: 'boolean',
                description: 'Whether to capture a screenshot (default: true)',
                default: true
              }
            },
            required: ['url']
          },
        },
        {
          name: 'list_archives',
          description: 'List all archived pages with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of archives to return (default: 20)',
                default: 20
              },
              content_type: {
                type: 'string',
                description: 'Filter by content type (webpage, article, etc.)'
              },
              has_screenshot: {
                type: 'boolean',
                description: 'Filter by screenshot availability'
              }
            }
          },
        },
        {
          name: 'browse_archive',
          description: 'Get details about a specific archive and its resources',
          inputSchema: {
            type: 'object',
            properties: {
              archive_id: {
                type: 'number',
                description: 'ID of the archive to browse'
              },
              show_resources: {
                type: 'boolean',
                description: 'Whether to include resource details (default: true)',
                default: true
              }
            },
            required: ['archive_id']
          },
        },
        {
          name: 'sync_browser_history',
          description: 'Sync your browser history to capture natural browsing patterns',
          inputSchema: {
            type: 'object',
            properties: {
              browser: {
                type: 'string',
                enum: ['chrome', 'safari', 'arc', 'brave', 'chromeBeta', 'chromeCanary'],
                description: 'Browser to sync from (default: chrome)',
                default: 'chrome'
              },
              days: {
                type: 'number',
                description: 'Number of days back to sync (default: 7)',
                default: 7
              },
              dry_run: {
                type: 'boolean',
                description: 'Preview what would be synced without saving (default: false)',
                default: false
              }
            }
          },
        },
        {
          name: 'check_browser_availability',
          description: 'Check which browsers are available for history monitoring',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        },
        {
          name: 'get_browsing_history',
          description: 'Get your recent browsing history with filtering options',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of entries to return (default: 50)',
                default: 50
              },
              hours: {
                type: 'number',
                description: 'Hours back to search (default: 24)',
                default: 24
              },
              organic_only: {
                type: 'boolean',
                description: 'Only show organic browsing, not automated visits (default: true)',
                default: true
              },
              browser: {
                type: 'string',
                description: 'Filter by specific browser'
              },
              url_pattern: {
                type: 'string',
                description: 'Filter URLs containing this text'
              }
            }
          },
        },
        {
          name: 'analyze_browsing_patterns',
          description: 'Analyze your browsing patterns to understand interests and habits',
          inputSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to analyze (default: 7)',
                default: 7
              }
            }
          },
        },
        {
          name: 'find_unvisited_gems',
          description: 'Find interesting links from your browsing that you might want to revisit',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        },
        {
          name: 'get_browsing_stats',
          description: 'Get statistics about your browsing activity',
          inputSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to analyze (default: 7)',
                default: 7
              }
            }
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
            return await this.applySavedPattern(args.pattern_name, args.save_links !== false);
          
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
          
          case 'query_with_natural_language':
            return await this.queryWithNaturalLanguage(args.description, args.execute !== false);
          
          case 'get_database_schema':
            return await this.getDatabaseSchema();
          
          case 'bag_of_links':
            return await this.getBagOfLinks(args.count || 10, args.min_days_old || 2, args.max_days_old || 90);
          
          case 'remove_ai_tags':
            return await this.removeAITags();
          
          case 'tag_cloud':
            return await this.generateTagCloud(args.max_tags || 50, args.links_per_tag || 5);
          
          case 'delete_pattern':
            return await this.deletePattern(args.pattern_name, args.domain || 'old.reddit.com');
          
          case 'query_metadata':
            return await this.queryMetadata(args.limit || 10, args.site);
          
          case 'start_crawl':
            return await this.startCrawl(
              args.seed_subreddits || ["programming", "technology", "datascience"],
              args.max_subreddits || 10,
              args.links_per_subreddit || 5,
              args.discovery_depth || 2
            );
          
          case 'get_session_stats':
            return await this.getSessionStats();
          
          case 'test_browser_health':
            return await this.testBrowserHealth();
          
          case 'archive_url':
            return await this.archiveUrl(args.url, args.link_id, args.format || 'directory', args.include_screenshot !== false);
          
          case 'list_archives':
            return await this.listArchives(args.limit || 20, args.content_type, args.has_screenshot);
          
          case 'browse_archive':
            return await this.browseArchive(args.archive_id, args.show_resources !== false);
          
          case 'sync_browser_history':
            return await this.syncBrowserHistory(args.browser || 'chrome', args.days || 7, args.dry_run || false);
          
          case 'check_browser_availability':
            return await this.checkBrowserAvailability();
          
          case 'get_browsing_history':
            return await this.getBrowsingHistory(args);
          
          case 'analyze_browsing_patterns':
            return await this.analyzeBrowsingPatterns(args.days || 7);
          
          case 'find_unvisited_gems':
            return await this.findUnvisitedGems();
          
          case 'get_browsing_stats':
            return await this.getBrowsingStats(args.days || 7);
          
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
    
    // Navigate with better timeout handling for problematic sites
    try {
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
    } catch (error) {
      // If domcontentloaded fails, try with load
      console.error(`Navigation with domcontentloaded failed, trying with load: ${error.message}`);
      try {
        await this.page.goto(url, { 
          waitUntil: 'load',
          timeout: 60000 
        });
      } catch (error2) {
        // If load fails, try with no wait condition
        console.error(`Navigation with load failed, trying with no wait: ${error2.message}`);
        await this.page.goto(url, { 
          timeout: 30000 
        });
      }
    }
    
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
          const titleElement = post.querySelector('.title.may-blank a');
          const scoreElement = post.querySelector('.score.unvoted div');
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

    try {
      // Launch browser in HEAD mode (visible)
      this.browser = await chromium.launch({ 
        headless: false,
        slowMo: 200, // Slower for better visibility
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security'
        ]
      });
      
      // Create context with user agent
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: this.sessionManager.getRandomUserAgent()
      });
      
      this.page = await context.newPage();
      
      // Set up detection prevention
      await this.sessionManager.handleDetectionPrevention(this.page);
      
      if (url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        const domain = new URL(url).hostname;
        
        // Set up session for this domain
        await this.sessionManager.setupPageForDomain(this.page, domain);
        
        // Navigate with better timeout handling
        await this.page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000 // Longer timeout for problematic sites
        });
        
        // Save session after navigation
        await this.sessionManager.savePageSession(this.page, domain);
      }
    } catch (error) {
      console.error('Visual browser launch failed:', error);
      
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
      
      throw new Error(`Failed to launch visual browser: ${error.message}`);
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

  async applySavedPattern(patternName, saveLinks = true) {
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
            const elementData = await el.evaluate(node => ({
              tagName: node.tagName.toLowerCase(),
              className: node.className,
              id: node.id,
              dataset: Object.fromEntries(Object.entries(node.dataset || {})),
              attributes: Array.from(node.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
              parentTag: node.parentElement?.tagName.toLowerCase(),
              position: {
                x: node.getBoundingClientRect().left,
                y: node.getBoundingClientRect().top,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height
              }
            }));
            
            if (text && text.trim()) {
              extractedData.push({
                selector,
                text: text.trim(),
                href: href,
                tagName: elementData.tagName,
                className: elementData.className,
                elementId: elementData.id,
                dataset: elementData.dataset,
                attributes: elementData.attributes,
                parentTag: elementData.parentTag,
                position: elementData.position,
                extractedAt: new Date().toISOString()
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

    // Save extracted links to database automatically (if enabled)
    let savedLinksCount = 0;
    if (saveLinks && extractedData.length > 0) {
      for (const item of extractedData) {
        // Apply smart filtering based on site type
        let shouldSave = false;
        
        if (domain === 'news.ycombinator.com') {
          shouldSave = this.isHackerNewsStory(item.text, item.href);
        } else if (domain === 'old.reddit.com') {
          shouldSave = this.isRedditStory(item.text, item.href);
        } else if (item.href && item.text.length > 10) {
          // For other sites, use basic filtering
          shouldSave = true;
        }
        
        if (shouldSave) {
          try {
            // Make relative URLs absolute
            let fullUrl = item.href;
            if (item.href && !item.href.startsWith('http')) {
              fullUrl = new URL(item.href, currentUrl).toString();
            }

            // Generate suggested tags based on title and source
            const suggestedTags = await this.generateSuggestedTags(item.text, domain);
            
            // Create rich metadata for analytics
            const metadata = {
              extraction: {
                pattern: patternName,
                selector: item.selector,
                extractedAt: item.extractedAt,
                workingSelectors: workingSelectors
              },
              element: {
                tagName: item.tagName,
                className: item.className,
                elementId: item.elementId,
                dataset: item.dataset,
                attributes: item.attributes,
                parentTag: item.parentTag,
                position: item.position
              },
              site: {
                domain: domain,
                url: currentUrl,
                userAgent: await this.page.evaluate(() => navigator.userAgent),
                viewport: await this.page.evaluate(() => ({
                  width: window.innerWidth,
                  height: window.innerHeight
                }))
              },
              content: {
                hasHref: !!item.href,
                textLength: item.text.length,
                linkType: item.href ? (item.href.startsWith('http') ? 'external' : 'internal') : 'text'
              }
            };
            
            await this.database.saveLink({
              title: item.text,
              url: fullUrl,
              sourceSite: domain,
              sourcePage: new URL(currentUrl).pathname,
              tags: suggestedTags,
              isCurated: false,
              isPublic: false,
              metadata: metadata
            });
            savedLinksCount++;
          } catch (error) {
            // Link might already exist (duplicate URL) or other error, which is fine
            console.error(`Failed to save link: ${error.message}`);
          }
        }
      }
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
                (extractedData.length === 0 ? '\nNo elements found. The page structure may have changed.' : '') +
                (savedLinksCount > 0 ? `\n\n💾 Saved ${savedLinksCount} new links to database with auto-generated tags` : ''),
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

  async getTopStoriesMulti(sites, count = 10, format = 'markdown', saveLinks = true) {
    console.error(`Getting top ${count} stories from sites: ${sites.join(', ')}`);
    
    const allStories = [];
    const errors = [];
    let savedLinksCount = 0;
    
    for (const site of sites) {
      try {
        console.error(`Processing site: ${site}`);
        
        // Normalize site input
        const siteInfo = this.normalizeSiteInput(site);
        const stories = await this.extractStoriesFromSite(siteInfo, count);
        
        // Save links to database if requested
        if (saveLinks) {
          for (const story of stories) {
            try {
              // Generate suggested tags based on title and source
              const suggestedTags = await this.generateSuggestedTags(story.title, siteInfo.domain);
              
              await this.database.saveLink({
                title: story.title,
                url: story.url,
                sourceSite: siteInfo.domain,
                sourcePage: siteInfo.displayName,
                tags: suggestedTags,
                isCurated: false,
                isPublic: false,
                metadata: story.metadata
              });
              savedLinksCount++;
            } catch (error) {
              // Link might already exist (duplicate URL), which is fine
              console.error(`Failed to save link: ${error.message}`);
            }
          }
        }
        
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
    let output = this.formatMultiSiteOutput(allStories, errors, format);
    
    if (saveLinks && savedLinksCount > 0) {
      output += `\n\n💾 Saved ${savedLinksCount} new links to database with auto-generated tags`;
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

  normalizeSiteInput(site) {
    const siteNormalized = site.toLowerCase().trim();
    
    // Handle Reddit subreddits
    if (siteNormalized.startsWith('/r/') || siteNormalized.startsWith('r/')) {
      const subreddit = siteNormalized.replace(/^\/?(r\/)?/, '');
      return {
        url: `https://old.reddit.com/r/${subreddit}`,
        domain: 'old.reddit.com',
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
    
    // Handle FARK
    if (siteNormalized.includes('fark')) {
      return {
        url: 'https://www.fark.com',
        domain: 'www.fark.com',
        pattern: 'fark_stories',
        displayName: 'FARK',
        type: 'fark'
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
    
    // Navigate with better timeout handling for problematic sites
    try {
      await this.page.goto(siteInfo.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
    } catch (error) {
      console.error(`Navigation with domcontentloaded failed, trying with load: ${error.message}`);
      try {
        await this.page.goto(siteInfo.url, { 
          waitUntil: 'load',
          timeout: 60000 
        });
      } catch (error2) {
        console.error(`Navigation with load failed, trying with no wait: ${error2.message}`);
        await this.page.goto(siteInfo.url, { 
          timeout: 30000 
        });
      }
    }
    
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
            const elementData = await el.evaluate(node => ({
              tagName: node.tagName.toLowerCase(),
              className: node.className,
              id: node.id,
              dataset: Object.fromEntries(Object.entries(node.dataset || {})),
              attributes: Array.from(node.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
              parentTag: node.parentElement?.tagName.toLowerCase(),
              position: {
                x: node.getBoundingClientRect().left,
                y: node.getBoundingClientRect().top,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height
              }
            }));
            
            if (text && text.trim()) {
              // Apply site-specific filtering
              let shouldInclude = false;
              
              if (siteInfo.type === 'hackernews') {
                shouldInclude = this.isHackerNewsStory(text.trim(), href);
              } else if (siteInfo.type === 'reddit') {
                shouldInclude = this.isRedditStory(text.trim(), href);
              } else {
                // For other sites, include everything with basic filtering
                shouldInclude = text.trim().length > 5;
              }
              
              if (shouldInclude) {
                // Make relative URLs absolute
                let fullUrl = href;
                if (href && !href.startsWith('http')) {
                  fullUrl = new URL(href, siteInfo.url).toString();
                }
                
                // Create rich metadata for this story
                const metadata = {
                  extraction: {
                    pattern: patternName,
                    selector: selector,
                    extractedAt: new Date().toISOString(),
                    siteType: siteInfo.type
                  },
                  element: {
                    tagName: elementData.tagName,
                    className: elementData.className,
                    elementId: elementData.id,
                    dataset: elementData.dataset,
                    attributes: elementData.attributes,
                    parentTag: elementData.parentTag,
                    position: elementData.position
                  },
                  site: {
                    domain: siteInfo.domain,
                    url: siteInfo.url,
                    displayName: siteInfo.displayName
                  },
                  content: {
                    hasHref: !!href,
                    textLength: text.trim().length,
                    linkType: href ? (href.startsWith('http') ? 'external' : 'internal') : 'text'
                  }
                };
                
                stories.push({
                  title: text.trim(),
                  url: fullUrl,
                  selector: selector,
                  metadata: metadata
                });
              }
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

  async queryLinks(filters) {
    try {
      const links = await this.database.getLinks(filters);
      
      let output = `# Saved Links Query Results\n\n`;
      output += `Found ${links.length} links\n\n`;
      
      if (links.length === 0) {
        output += 'No links found matching your criteria.\n';
      } else {
        links.forEach((link, i) => {
          output += `## ${i + 1}. ${link.title}\n`;
          output += `**URL:** ${link.url}\n`;
          output += `**Source:** ${link.source_page} (${link.source_site})\n`;
          
          if (link.description) {
            output += `**Description:** ${link.description}\n`;
          }
          
          if (link.tags.length > 0) {
            output += `**Tags:** ${link.tags.join(', ')}\n`;
          }
          
          if (link.score > 0) {
            output += `**Score:** ${'⭐'.repeat(link.score)} (${link.score}/5)\n`;
          }
          
          output += `**Status:** ${link.is_curated ? '✅ Curated' : '📝 Auto-saved'}`;
          if (link.is_public) output += ' • 🌐 Public';
          output += `\n`;
          
          output += `**Added:** ${new Date(link.extracted_at).toLocaleDateString()}\n`;
          
          if (link.notes) {
            output += `**Notes:** ${link.notes}\n`;
          }
          
          output += '\n';
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to query links: ${error.message}`);
    }
  }

  async curateLink(args) {
    try {
      const { link_id, ...updates } = args;
      
      // Mark as curated
      updates.is_curated = true;
      
      const changes = await this.database.updateLink(link_id, updates);
      
      if (changes === 0) {
        throw new Error(`Link with ID ${link_id} not found`);
      }
      
      let output = `✅ Link ${link_id} has been curated!\n\n`;
      
      if (updates.score) {
        output += `🌟 Score: ${'⭐'.repeat(updates.score)} (${updates.score}/5)\n`;
      }
      
      if (updates.tags && updates.tags.length > 0) {
        output += `🏷️ Tags: ${updates.tags.join(', ')}\n`;
      }
      
      if (updates.is_public) {
        output += `🌐 Made public for sharing\n`;
      }
      
      if (updates.notes) {
        output += `📝 Notes added\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to curate link: ${error.message}`);
    }
  }

  async executeSql(query, params = []) {
    try {
      const results = await this.database.executeSql(query, params);
      
      let output = `# SQL Query Results\n\n`;
      output += `**Query:** \`${query}\`\n\n`;
      
      if (results.length === 0) {
        output += 'No results found.\n';
      } else {
        output += `Found ${results.length} rows:\n\n`;
        
        // Format as table
        if (results.length > 0) {
          const headers = Object.keys(results[0]);
          
          // Headers
          output += `| ${headers.join(' | ')} |\n`;
          output += `| ${headers.map(() => '---').join(' | ')} |\n`;
          
          // Rows
          results.forEach(row => {
            const values = headers.map(header => {
              const value = row[header];
              return value !== null && value !== undefined ? String(value) : '';
            });
            output += `| ${values.join(' | ')} |\n`;
          });
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
    } catch (error) {
      throw new Error(`SQL query failed: ${error.message}`);
    }
  }

  async getDatabaseSchema() {
    try {
      const schema = await this.database.getSchema();
      
      let output = `# Database Schema\n\n`;
      
      schema.forEach(table => {
        output += `## Table: ${table.name}\n\n`;
        output += '```sql\n';
        output += table.sql + '\n';
        output += '```\n\n';
      });
      
      output += `## Quick Examples\n\n`;
      output += '**Get all curated links:**\n';
      output += '```sql\n';
      output += 'SELECT title, url, score FROM links WHERE is_curated = 1 ORDER BY score DESC;\n';
      output += '```\n\n';
      
      output += '**Get links by source:**\n';
      output += '```sql\n';
      output += "SELECT title, url FROM links WHERE source_site = 'news.ycombinator.com';\n";
      output += '```\n\n';
      
      output += '**Search links:**\n';
      output += '```sql\n';
      output += "SELECT title, url FROM links WHERE title LIKE '%AI%' OR notes LIKE '%AI%';\n";
      output += '```\n\n';
      
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get schema: ${error.message}`);
    }
  }

  async queryWithNaturalLanguage(description, execute = true) {
    try {
      // Get database schema for context
      const schema = await this.database.getSchema();
      
      // Create context about the database structure
      const schemaContext = schema.map(table => `${table.name}: ${table.sql}`).join('\n\n');
      
      // Generate SQL using AI reasoning
      const sqlQuery = await this.generateSqlFromDescription(description, schemaContext);
      
      let output = `# Natural Language Query\\n\\n`;
      output += `**Request:** ${description}\\n\\n`;
      output += `**Generated SQL:**\\n\`\`\`sql\\n${sqlQuery}\\n\`\`\`\\n\\n`;
      
      if (execute) {
        try {
          const results = await this.database.executeSql(sqlQuery);
          
          if (results.length === 0) {
            output += 'No results found.\\n';
          } else {
            output += `**Results (${results.length} rows):**\\n\\n`;
            
            // Format as table
            if (results.length > 0) {
              const headers = Object.keys(results[0]);
              
              // Headers
              output += `| ${headers.join(' | ')} |\\n`;
              output += `| ${headers.map(() => '---').join(' | ')} |\\n`;
              
              // Rows
              results.forEach(row => {
                const values = headers.map(header => {
                  const value = row[header];
                  return value !== null && value !== undefined ? String(value) : '';
                });
                output += `| ${values.join(' | ')} |\\n`;
              });
            }
          }
        } catch (sqlError) {
          output += `**Execution Error:** ${sqlError.message}\\n\\n`;
          output += 'The query was generated but failed to execute. You can try modifying it manually.\\n';
        }
      } else {
        output += '*Query generated but not executed (execute=false)*\\n';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to process natural language query: ${error.message}`);
    }
  }

  generateSqlFromDescription(description, schemaContext) {
    // Simple SQL generation based on common patterns
    // This is a basic implementation - in practice you'd want more sophisticated NLP
    
    const desc = description.toLowerCase();
    
    // Common patterns and their SQL equivalents
    if (desc.includes('highest rated') || desc.includes('best') || desc.includes('top rated')) {
      if (desc.includes('links')) {
        return 'SELECT title, url, score, source_site FROM links WHERE score > 0 ORDER BY score DESC LIMIT 10;';
      }
    }
    
    if (desc.includes('curated') && desc.includes('links')) {
      return 'SELECT title, url, score, tags, source_site FROM links WHERE is_curated = 1 ORDER BY score DESC;';
    }
    
    if (desc.includes('public') && desc.includes('links')) {
      return 'SELECT title, url, score, source_site FROM links WHERE is_public = 1 ORDER BY score DESC;';
    }
    
    if (desc.includes('hacker news') || desc.includes('hn')) {
      return "SELECT title, url, score FROM links WHERE source_site = 'news.ycombinator.com' ORDER BY extracted_at DESC;";
    }
    
    if (desc.includes('reddit')) {
      return "SELECT title, url, source_page, extracted_at FROM links WHERE source_site LIKE '%reddit%' ORDER BY extracted_at DESC;";
    }
    
    if (desc.includes('recent') || desc.includes('latest')) {
      return 'SELECT title, url, source_site, extracted_at FROM links ORDER BY extracted_at DESC LIMIT 20;';
    }
    
    if (desc.includes('ai') || desc.includes('artificial intelligence')) {
      return "SELECT title, url, score, source_site FROM links WHERE (title LIKE '%AI%' OR title LIKE '%artificial intelligence%' OR notes LIKE '%AI%') ORDER BY score DESC;";
    }
    
    if (desc.includes('count') || desc.includes('how many')) {
      if (desc.includes('curated')) {
        return 'SELECT COUNT(*) as curated_count FROM links WHERE is_curated = 1;';
      }
      return 'SELECT COUNT(*) as total_links FROM links;';
    }
    
    // Default: return all recent links
    return 'SELECT title, url, source_site, extracted_at FROM links ORDER BY extracted_at DESC LIMIT 10;';
  }

  isHackerNewsStory(text, href) {
    // Filter out HN navigation and non-story elements
    const navigationItems = [
      'Hacker News', 'new', 'past', 'comments', 'ask', 'show', 'jobs', 
      'submit', 'login', 'hide', 'discuss', 'More', 'Guidelines', 'FAQ', 
      'Lists', 'API', 'Security', 'Legal', 'Apply to YC', 'Contact'
    ];
    
    // Skip navigation items
    if (navigationItems.includes(text)) {
      return false;
    }
    
    // Skip if it's a user link (user?id=...)
    if (href && href.includes('user?id=')) {
      return false;
    }
    
    // Skip if it's a time link (item?id=... but text contains "ago" or "hour" or "minute")
    if (href && href.includes('item?id=') && (text.includes('ago') || text.includes('hour') || text.includes('minute'))) {
      return false;
    }
    
    // Skip if it's a hide link
    if (href && href.includes('hide?id=')) {
      return false;
    }
    
    // Skip if it's a comment count (ends with "comments")
    if (text.match(/^\d+\s*(comments?|comment)$/)) {
      return false;
    }
    
    // Skip if it's just a domain (from?site=...)
    if (href && href.includes('from?site=')) {
      return false;
    }
    
    // Skip very short titles (likely not real stories)
    if (text.length < 10) {
      return false;
    }
    
    // If it has an external URL (starts with http) and reasonable length, it's likely a story
    if (href && href.startsWith('http') && text.length > 10) {
      return true;
    }
    
    // For HN internal links, check if it's a Show HN or Ask HN
    if (text.startsWith('Show HN:') || text.startsWith('Ask HN:')) {
      return true;
    }
    
    // If it doesn't start with common navigation patterns and has reasonable length
    if (text.length > 15 && !text.match(/^\d+\s*(hours?|minutes?|days?)\s*ago$/)) {
      return true;
    }
    
    return false;
  }

  isRedditStory(text, href) {
    // Filter out Reddit navigation and non-story elements
    const navigationItems = [
      'reddit', 'hot', 'new', 'rising', 'top', 'controversial', 'gilded',
      'wiki', 'promoted', 'submit', 'preferences', 'logout', 'login',
      'front', 'all', 'random', 'friends', 'mod', 'message'
    ];
    
    // Skip navigation items
    if (navigationItems.some(nav => text.toLowerCase() === nav)) {
      return false;
    }
    
    // Skip if it's a user link (/u/ or /user/)
    if (href && (href.includes('/u/') || href.includes('/user/'))) {
      return false;
    }
    
    // Skip if it's a subreddit link without being a post
    if (href && href.includes('/r/') && !href.includes('/comments/')) {
      return false;
    }
    
    // Skip comment counts or vote indicators
    if (text.match(/^\d+\s*(comment|point|vote)s?$/i)) {
      return false;
    }
    
    // Skip time indicators
    if (text.match(/^\d+\s*(hour|minute|day|week|month|year)s?\s*ago$/i)) {
      return false;
    }
    
    // Skip very short titles (likely not real stories)
    if (text.length < 10) {
      return false;
    }
    
    // Skip reddit interface elements
    const interfaceElements = [
      'permalink', 'source', 'embed', 'save', 'parent', 'reply', 'give gold',
      'report', 'hide', 'sorted by', 'view discussions'
    ];
    
    if (interfaceElements.some(element => text.toLowerCase().includes(element))) {
      return false;
    }
    
    // If it has a Reddit post URL or is a reasonable length title, it's likely a story
    if ((href && href.includes('/comments/')) || text.length > 15) {
      return true;
    }
    
    return false;
  }

  async generateSuggestedTags(title, sourceSite = '') {
    try {
      // Use LLM to generate intelligent tags
      const response = await this.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Analyze this article title and generate 3-5 specific, relevant tags:

Title: "${title}"
Source: ${sourceSite}

CRITICAL: Do NOT use "ai" tag unless the article is specifically about artificial intelligence, machine learning, neural networks, or AI development. Being processed by AI does not make content AI-related.

Rules:
- Tag based on the article's actual subject matter only
- Use specific topics over broad categories  
- Include content format only if obvious (tutorial, news, opinion, review)
- Use lowercase, hyphenated format

Examples:
"How to Build a React Component" → ["react", "javascript", "tutorial", "web-dev"]
"Company Raises $50M Series A" → ["startup", "funding", "news", "venture-capital"]  
"My Thoughts on Remote Work" → ["remote-work", "opinion", "workplace", "productivity"]
"Nathan For You Episode Discussion" → ["comedy", "television", "entertainment"]
"ChatGPT Can Now Browse the Web" → ["ai", "chatgpt", "news", "llm"]

JSON Array:`
            }
          }
        ],
        systemPrompt: "You are a precise content categorizer. Be conservative with tags - only apply them if they directly relate to the content. Avoid over-tagging or applying tangentially related categories. Focus on what someone would actually search for to find this content.",
        maxTokens: 100,
        temperature: 0.1
      });

      const responseText = response.content.text.trim();
      
      // Parse the JSON response
      try {
        const tags = JSON.parse(responseText);
        if (Array.isArray(tags) && tags.every(tag => typeof tag === 'string')) {
          // Clean tags and ensure they're properly formatted
          const cleanTags = tags
            .map(tag => tag.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 20))
            .filter(tag => tag.length > 1)
            .slice(0, 5);
          
          console.error(`LLM generated tags for "${title}": ${cleanTags.join(', ')}`);
          return cleanTags;
        }
      } catch (parseError) {
        console.error('Failed to parse LLM tag response:', parseError.message);
      }
    } catch (error) {
      console.error('LLM tag generation failed, falling back to keyword matching:', error.message);
    }

    // Fallback to original keyword-based approach if LLM fails
    return this.generateFallbackTags(title, sourceSite);
  }

  generateFallbackTags(title, sourceSite = '') {
    const tags = new Set();
    const titleLower = title.toLowerCase();
    
    // Quick keyword matching for fallback
    const quickKeywords = {
      'ai': ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'claude', 'llm'],
      'programming': ['programming', 'coding', 'developer', 'software', 'code', 'api'],
      'web-dev': ['html', 'css', 'javascript', 'react', 'vue', 'web'],
      'mobile': ['ios', 'android', 'mobile', 'app'],
      'startup': ['startup', 'founder', 'vc', 'funding'],
      'tutorial': ['tutorial', 'how to', 'guide', 'learn'],
      'news': ['announces', 'releases', 'launches', 'breaking'],
      'science': ['science', 'research', 'study', 'discovery']
    };
    
    // Source-specific tags
    if (sourceSite.includes('reddit')) tags.add('reddit');
    else if (sourceSite.includes('ycombinator')) tags.add('hacker-news');
    else if (sourceSite.includes('fark')) tags.add('fark');
    
    // Check keywords
    for (const [tag, keywords] of Object.entries(quickKeywords)) {
      if (keywords.some(keyword => titleLower.includes(keyword))) {
        tags.add(tag);
      }
    }
    
    return Array.from(tags).slice(0, 5);
  }

  async getBagOfLinks(count = 10, minDaysOld = 2, maxDaysOld = 90) {
    try {
      // Create a sophisticated query that prioritizes interesting content
      const query = `
        SELECT 
          title,
          url,
          source_site,
          source_page,
          tags,
          score,
          notes,
          saved_at,
          is_curated,
          -- Create a ranking score that prefers:
          -- 1. Links with scores (weighted heavily)
          -- 2. Links with notes (bonus points)
          -- 3. Curated links (bonus points)
          -- 4. Diverse sources (handled in application logic)
          (
            CASE WHEN score > 0 THEN score * 10 ELSE 1 END +
            CASE WHEN notes IS NOT NULL AND notes != '' THEN 5 ELSE 0 END +
            CASE WHEN is_curated = 1 THEN 3 ELSE 0 END +
            -- Add small randomization factor
            (ABS(RANDOM()) % 5)
          ) as ranking_score
        FROM links 
        WHERE 
          saved_at >= datetime('now', '-${maxDaysOld} days') AND 
          saved_at <= datetime('now', '-${minDaysOld} days')
        ORDER BY ranking_score DESC, saved_at DESC
        LIMIT ${count * 3}
      `;

      let candidateLinks = await this.database.executeSql(query);
      let usedFallback = false;
      
      // Fallback: If no links found in the date range, try getting from all available links
      if (candidateLinks.length === 0) {
        console.error(`No links found in ${minDaysOld}-${maxDaysOld} day range, falling back to all links`);
        usedFallback = true;
        
        const fallbackQuery = `
          SELECT 
            title,
            url,
            source_site,
            source_page,
            tags,
            score,
            notes,
            saved_at,
            is_curated,
            (
              CASE WHEN score > 0 THEN score * 10 ELSE 1 END +
              CASE WHEN notes IS NOT NULL AND notes != '' THEN 5 ELSE 0 END +
              CASE WHEN is_curated = 1 THEN 3 ELSE 0 END +
              (ABS(RANDOM()) % 5)
            ) as ranking_score
          FROM links 
          ORDER BY ranking_score DESC, saved_at DESC
          LIMIT ${count * 3}
        `;
        
        candidateLinks = await this.database.executeSql(fallbackQuery);
        
        if (candidateLinks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No links found in your database. Start saving some links first!`,
              },
            ],
          };
        }
      }

      // Diversify sources - pick from different sites when possible
      const selectedLinks = this.diversifyLinkSelection(candidateLinks, count);
      
      // Generate the HTML page
      const htmlContent = this.generateBagOfLinksHTML(selectedLinks, minDaysOld, maxDaysOld);
      
      // Save HTML to a file
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      const outputPath = path.join(__dirname, '..', 'bag_of_links.html');
      await fs.promises.writeFile(outputPath, htmlContent, 'utf8');
      
      let output = `# 🎒 Bag of Links\n\n`;
      output += `Generated **${selectedLinks.length} curated links** from your collection!\n\n`;
      
      if (usedFallback) {
        output += `**Time Range:** All available links (no links found in ${minDaysOld}-${maxDaysOld} day range)\n`;
      } else {
        output += `**Time Range:** ${minDaysOld}-${maxDaysOld} days old\n`;
      }
      
      output += `**Sources:** ${[...new Set(selectedLinks.map(l => l.source_site))].join(', ')}\n`;
      output += `**File:** \`${outputPath}\`\n\n`;
      
      // Show preview of links
      output += `## Preview\n\n`;
      selectedLinks.forEach((link, i) => {
        const tags = JSON.parse(link.tags || '[]');
        const tagStr = tags.length > 0 ? ` [${tags.slice(0, 3).join(', ')}]` : '';
        const scoreStr = link.score > 0 ? ` ⭐${link.score}` : '';
        const notesStr = link.notes ? ' 📝' : '';
        const curatedStr = link.is_curated ? ' ✅' : '';
        
        output += `${i + 1}. **[${link.title}](${link.url})**${tagStr}${scoreStr}${notesStr}${curatedStr}\n`;
        output += `   ${link.source_page} • ${this.formatTimeAgo(link.saved_at)}\n\n`;
      });
      
      output += `💡 **The complete HTML is included below** for instant copying and sharing!\n\n`;
      output += `🔗 **Local file saved at:** \`${outputPath}\`\n\n`;
      output += `---\n\n## 📋 Complete HTML (Copy & Share)\n\n`;
      output += `\`\`\`html\n${htmlContent}\n\`\`\``;

      return {
        content: [
          {
            type: 'text',
            text: output,
          }
        ],
      };
    } catch (error) {
      throw new Error(`Failed to generate bag of links: ${error.message}`);
    }
  }

  diversifyLinkSelection(candidateLinks, targetCount) {
    // Group links by source site
    const linksBySource = {};
    candidateLinks.forEach(link => {
      if (!linksBySource[link.source_site]) {
        linksBySource[link.source_site] = [];
      }
      linksBySource[link.source_site].push(link);
    });

    const selectedLinks = [];
    const sources = Object.keys(linksBySource);
    let sourceIndex = 0;

    // Round-robin selection to ensure diversity
    while (selectedLinks.length < targetCount && selectedLinks.length < candidateLinks.length) {
      const currentSource = sources[sourceIndex % sources.length];
      const sourceLinks = linksBySource[currentSource];
      
      // Find the next unselected link from this source
      const availableLink = sourceLinks.find(link => 
        !selectedLinks.some(selected => selected.url === link.url)
      );
      
      if (availableLink) {
        selectedLinks.push(availableLink);
      }
      
      sourceIndex++;
      
      // If we've cycled through all sources, break to avoid infinite loop
      if (sourceIndex > sources.length * 10) {
        break;
      }
    }

    return selectedLinks;
  }

  generateBagOfLinksHTML(links, minDaysOld, maxDaysOld) {
    const now = new Date();
    const generatedDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bag of Links - ${generatedDate}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .header .subtitle {
            opacity: 0.9;
            font-size: 1.1em;
        }
        
        .stats {
            background: #f8f9fa;
            padding: 15px 30px;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 0.9em;
            color: #6c757d;
        }
        
        .links {
            padding: 0;
        }
        
        .link-item {
            padding: 25px 30px;
            border-bottom: 1px solid #e9ecef;
            transition: background-color 0.2s ease;
        }
        
        .link-item:hover {
            background-color: #f8f9fa;
        }
        
        .link-item:last-child {
            border-bottom: none;
        }
        
        .link-title {
            display: block;
            font-size: 1.2em;
            font-weight: 600;
            color: #2c3e50;
            text-decoration: none;
            margin-bottom: 8px;
            line-height: 1.4;
        }
        
        .link-title:hover {
            color: #667eea;
        }
        
        .link-meta {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: #6c757d;
        }
        
        .meta-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .tags {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 8px;
        }
        
        .tag {
            background: #e3f2fd;
            color: #1976d2;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 500;
        }
        
        .notes {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 12px;
            margin-top: 10px;
            font-style: italic;
            color: #856404;
        }
        
        .score-stars {
            color: #ffc107;
        }
        
        .curated-badge {
            background: #d4edda;
            color: #155724;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 500;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #6c757d;
            font-size: 0.9em;
            background: #f8f9fa;
        }
        
        @media (max-width: 600px) {
            body {
                padding: 10px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .link-item {
                padding: 20px;
            }
            
            .stats {
                padding: 15px 20px;
                flex-direction: column;
                gap: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎒 Bag of Links</h1>
            <div class="subtitle">Curated from your personal collection • ${generatedDate}</div>
        </div>
        
        <div class="stats">
            <div>📊 ${links.length} carefully selected links</div>
            <div>📅 ${minDaysOld}-${maxDaysOld} days old</div>
            <div>🌐 ${[...new Set(links.map(l => l.source_site))].length} different sources</div>
            <div>⭐ ${links.filter(l => l.score > 0).length} rated items</div>
        </div>
        
        <div class="links">
            ${links.map((link, index) => {
              const tags = JSON.parse(link.tags || '[]');
              const hasNotes = link.notes && link.notes.trim();
              const timeAgo = this.formatTimeAgo(link.saved_at);
              
              return `
                <div class="link-item">
                    <a href="${link.url}" target="_blank" class="link-title">
                        ${this.escapeHtml(link.title)}
                    </a>
                    
                    <div class="link-meta">
                        <div class="meta-item">
                            🌐 <span>${link.source_page || link.source_site}</span>
                        </div>
                        <div class="meta-item">
                            🕒 <span>${timeAgo}</span>
                        </div>
                        ${link.score > 0 ? `
                            <div class="meta-item">
                                <span class="score-stars">${'⭐'.repeat(link.score)}</span>
                                <span>${link.score}/5</span>
                            </div>
                        ` : ''}
                        ${link.is_curated ? '<span class="curated-badge">✅ Curated</span>' : ''}
                        ${hasNotes ? '<span class="meta-item">📝 Notes</span>' : ''}
                    </div>
                    
                    ${tags.length > 0 ? `
                        <div class="tags">
                            ${tags.slice(0, 5).map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                    
                    ${hasNotes ? `
                        <div class="notes">
                            💭 ${this.escapeHtml(link.notes)}
                        </div>
                    ` : ''}
                </div>
              `;
            }).join('')}
        </div>
        
        <div class="footer">
            Generated by your Browser MCP Server • Open links in new tabs by clicking
        </div>
    </div>
</body>
</html>`;
  }

  formatTimeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async removeAITags() {
    try {
      const updatedCount = await this.database.removeAITags();
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully removed AI tags from ${updatedCount} links!\n\nYour database has been cleaned of inappropriate AI tags. Future link saves will use the improved LLM prompt that won't over-apply AI tags.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to remove AI tags: ${error.message}`);
    }
  }

  async generateTagCloud(maxTags = 50, linksPerTag = 5) {
    try {
      // Get all links with their tags
      const links = await this.database.executeSql(`
        SELECT id, title, url, tags, score, source_site, saved_at 
        FROM links 
        WHERE tags != '[]' AND tags IS NOT NULL
        ORDER BY saved_at DESC
      `);

      // Count tag frequency and collect links for each tag
      const tagStats = {};
      
      links.forEach(link => {
        try {
          const tags = JSON.parse(link.tags || '[]');
          tags.forEach(tag => {
            if (!tagStats[tag]) {
              tagStats[tag] = {
                count: 0,
                links: []
              };
            }
            tagStats[tag].count++;
            if (tagStats[tag].links.length < linksPerTag) {
              tagStats[tag].links.push(link);
            }
          });
        } catch (parseError) {
          console.error(`Failed to parse tags for link ${link.id}:`, parseError.message);
        }
      });

      // Sort tags by frequency and limit
      const sortedTags = Object.entries(tagStats)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, maxTags);

      if (sortedTags.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No tags found in your database. Start saving some links with tags first!',
            },
          ],
        };
      }

      // Generate HTML
      const htmlContent = this.generateTagCloudHTML(sortedTags);
      
      // Save to file
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      const outputPath = path.join(__dirname, '..', 'tag_cloud.html');
      await fs.promises.writeFile(outputPath, htmlContent, 'utf8');

      // Automatically open the HTML file in the default browser
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Determine the correct command based on the operating system
        let openCommand;
        if (process.platform === 'darwin') {
          openCommand = `open "${outputPath}"`;
        } else if (process.platform === 'win32') {
          openCommand = `start "" "${outputPath}"`;
        } else {
          openCommand = `xdg-open "${outputPath}"`;
        }
        
        await execAsync(openCommand);
        console.error(`Opened tag cloud in browser: ${outputPath}`);
      } catch (openError) {
        console.error('Failed to auto-open file:', openError.message);
      }

      let output = `# 🏷️ Tag Cloud\n\n`;
      output += `Generated interactive tag cloud with **${sortedTags.length} tags** from your collection!\n\n`;
      output += `🚀 **Automatically opened in your browser!**\n\n`;
      output += `**Most popular tags:**\n`;
      
      // Show top 10 tags in the preview
      sortedTags.slice(0, 10).forEach(([tag, stats], i) => {
        output += `${i + 1}. **${tag}** (${stats.count} links)\n`;
      });
      
      output += `\n**File saved at:** \`${outputPath}\`\n\n`;
      output += `💡 **Open the HTML file** to see the interactive tag cloud with clickable tags and links!\n\n`;
      output += `---\n\n## 📋 Complete HTML (Copy & Share)\n\n`;
      output += `\`\`\`html\n${htmlContent}\n\`\`\``;

      return {
        content: [
          {
            type: 'text',
            text: output,
          }
        ],
      };
    } catch (error) {
      throw new Error(`Failed to generate tag cloud: ${error.message}`);
    }
  }

  async deletePattern(patternName, domain = 'old.reddit.com') {
    try {
      const deletedCount = await this.database.deletePattern(domain, patternName);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully deleted pattern "${patternName}" from domain "${domain}"!\n\nThe old pattern has been removed. You can now create a new pattern with the same name or use your new pattern without conflicts.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to delete pattern: ${error.message}`);
    }
  }

  async startCrawl(seedSubreddits, maxSubreddits, linksPerSubreddit, discoveryDepth) {
    try {
      let output = `# 🕷️ Intelligent Content Crawl\n\n`;
      output += `**Starting crawl with seeds:** ${seedSubreddits.join(', ')}\n`;
      output += `**Discovery depth:** ${discoveryDepth} levels\n`;
      output += `**Max new subreddits:** ${maxSubreddits}\n`;
      output += `**Links per subreddit:** ${linksPerSubreddit}\n\n`;

      if (!this.browser) {
        await this.openBrowser();
      }

      const discoveredSubreddits = new Set(seedSubreddits);
      const crawlResults = {
        subreddits: [],
        totalLinks: 0,
        discoveries: [],
        errors: []
      };

      // Start crawling from seed subreddits
      output += `## Phase 1: Exploring Seed Subreddits\n\n`;

      for (const subreddit of seedSubreddits) {
        try {
          output += `### 📍 /r/${subreddit}\n`;
          
          const subredditResult = await this.crawlSubreddit(subreddit, linksPerSubreddit, discoveryDepth > 1);
          crawlResults.subreddits.push(subredditResult);
          crawlResults.totalLinks += subredditResult.links.length;
          
          output += `- **Links collected:** ${subredditResult.links.length}\n`;
          output += `- **Pages visited:** ${subredditResult.metadata.pagesVisited}\n`;
          output += `- **Related subreddits found:** ${subredditResult.relatedSubreddits.length}\n`;
          
          // Add newly discovered subreddits for future exploration
          subredditResult.relatedSubreddits.forEach(related => {
            if (discoveredSubreddits.size < maxSubreddits + seedSubreddits.length) {
              discoveredSubreddits.add(related);
              if (!seedSubreddits.includes(related)) {
                crawlResults.discoveries.push({
                  subreddit: related,
                  discoveredFrom: subreddit,
                  depth: 1
                });
              }
            }
          });
          
          output += `\n`;
          
          // Rate limiting
          await this.delay(2000);
          
        } catch (error) {
          crawlResults.errors.push({ subreddit, error: error.message });
          output += `- ❌ **Error:** ${error.message}\n\n`;
        }
      }

      // Phase 2: Explore discovered subreddits (if depth > 1)
      if (discoveryDepth > 1 && crawlResults.discoveries.length > 0) {
        output += `## Phase 2: Exploring Discovered Subreddits\n\n`;
        
        const toExplore = crawlResults.discoveries.slice(0, maxSubreddits);
        for (const discovery of toExplore) {
          try {
            output += `### 🔍 /r/${discovery.subreddit} (found via /r/${discovery.discoveredFrom})\n`;
            
            const subredditResult = await this.crawlSubreddit(discovery.subreddit, Math.ceil(linksPerSubreddit / 2), false);
            crawlResults.subreddits.push(subredditResult);
            crawlResults.totalLinks += subredditResult.links.length;
            
            output += `- **Links collected:** ${subredditResult.links.length}\n`;
            output += `- **Pages visited:** ${subredditResult.metadata.pagesVisited}\n`;
            output += `\n`;
            
            // Rate limiting
            await this.delay(2000);
            
          } catch (error) {
            crawlResults.errors.push({ subreddit: discovery.subreddit, error: error.message });
            output += `- ❌ **Error:** ${error.message}\n\n`;
          }
        }
      }

      // Summary
      output += `## 📊 Crawl Summary\n\n`;
      output += `- **Subreddits explored:** ${crawlResults.subreddits.length}\n`;
      output += `- **Total links collected:** ${crawlResults.totalLinks}\n`;
      output += `- **New subreddits discovered:** ${crawlResults.discoveries.length}\n`;
      output += `- **Errors encountered:** ${crawlResults.errors.length}\n\n`;

      if (crawlResults.discoveries.length > 0) {
        output += `### 🎯 Newly Discovered Subreddits:\n`;
        crawlResults.discoveries.slice(0, 10).forEach(d => {
          output += `- **/r/${d.subreddit}** (via /r/${d.discoveredFrom})\n`;
        });
        output += `\n`;
      }

      if (crawlResults.totalLinks > 0) {
        output += `### 🔗 Sample Links Collected:\n`;
        const allLinks = crawlResults.subreddits.flatMap(s => s.links);
        allLinks.slice(0, 5).forEach((link, i) => {
          output += `${i + 1}. **[${link.title}](${link.url})**\n`;
          output += `   Source: /r/${link.subreddit}\n\n`;
        });
      }

      output += `💡 **All collected links have been saved to your database with rich metadata for future analysis!**\n`;
      output += `\n🎯 **Try these next:**\n`;
      output += `- \`tag_cloud\` to visualize your expanded collection\n`;
      output += `- \`query_metadata\` to analyze crawl patterns\n`;
      output += `- \`bag_of_links\` to see your best discoveries\n`;

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Crawl failed: ${error.message}`);
    }
  }

  async crawlSubreddit(subreddit, maxLinks, discoverRelated = true) {
    const url = `https://old.reddit.com/r/${subreddit}`;
    
    // Navigate to subreddit
    const domain = new URL(url).hostname;
    await this.sessionManager.setupPageForDomain(this.page, domain);
    await this.sessionManager.respectRateLimit(domain, 3000, 6000);
    
    try {
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
    } catch (error) {
      console.error(`Navigation failed, trying with load: ${error.message}`);
      await this.page.goto(url, { 
        waitUntil: 'load',
        timeout: 60000 
      });
    }

    const result = {
      subreddit,
      url,
      links: [],
      relatedSubreddits: [],
      metadata: {
        crawledAt: new Date().toISOString(),
        subscriberCount: null,
        description: null,
        pagesVisited: 0
      }
    };

    // Extract subreddit metadata
    try {
      const metadata = await this.page.evaluate(() => {
        const subscriberElement = document.querySelector('.subscribers .number');
        const descElement = document.querySelector('.usertext-body .md p');
        
        return {
          subscribers: subscriberElement ? subscriberElement.textContent.trim() : null,
          description: descElement ? descElement.textContent.trim() : null
        };
      });
      
      result.metadata.subscriberCount = metadata.subscribers;
      result.metadata.description = metadata.description;
    } catch (metaError) {
      console.error('Failed to extract subreddit metadata:', metaError.message);
    }

    // Extract links using existing reddit pattern with pagination
    const patterns = await this.database.getPatterns('old.reddit.com');
    const redditPattern = patterns.find(p => p.pattern_name.includes('reddit'));
    
    if (redditPattern) {
      await this.extractLinksWithPagination(result, redditPattern, maxLinks, subreddit, url);
    }

    // Discover related subreddits (if enabled)
    if (discoverRelated) {
      try {
        const relatedSubs = await this.page.evaluate(() => {
          const related = new Set();
          
          // Look for subreddit mentions in post titles and comments
          const links = document.querySelectorAll('a[href*="/r/"]');
          links.forEach(link => {
            const match = link.href.match(/\/r\/([a-zA-Z0-9_]+)/);
            if (match && match[1] && match[1].length > 2) {
              related.add(match[1].toLowerCase());
            }
          });

          // Look in sidebar for related subreddits
          const sidebarLinks = document.querySelectorAll('.side a[href*="/r/"]');
          sidebarLinks.forEach(link => {
            const match = link.href.match(/\/r\/([a-zA-Z0-9_]+)/);
            if (match && match[1] && match[1].length > 2) {
              related.add(match[1].toLowerCase());
            }
          });

          return Array.from(related).slice(0, 8);
        });

        result.relatedSubreddits = relatedSubs.filter(sub => sub !== subreddit);
      } catch (relatedError) {
        console.error('Failed to discover related subreddits:', relatedError.message);
      }
    }

    return result;
  }

  async extractLinksWithPagination(result, redditPattern, maxLinks, subreddit, baseUrl) {
    const linksPerPage = Math.min(25, maxLinks); // Reddit shows ~25 links per page
    const maxPages = Math.ceil(maxLinks / linksPerPage);
    let currentPage = 1;
    
    console.error(`Extracting up to ${maxLinks} links across ${maxPages} pages for /r/${subreddit}`);
    
    while (result.links.length < maxLinks && currentPage <= maxPages) {
      console.error(`Page ${currentPage}: Currently have ${result.links.length}/${maxLinks} links`);
      
      // Extract links from current page
      const pageLinks = await this.extractLinksFromCurrentPage(redditPattern, result, subreddit, currentPage);
      
      if (pageLinks === 0) {
        console.error(`No links found on page ${currentPage}, stopping pagination`);
        break;
      }
      
      result.metadata.pagesVisited = currentPage;
      
      // Check if we have enough links or if we're on the last possible page
      if (result.links.length >= maxLinks) {
        console.error(`Reached target of ${maxLinks} links`);
        break;
      }
      
      // Try to navigate to next page
      const hasNextPage = await this.navigateToNextPage();
      if (!hasNextPage) {
        console.error(`No more pages available after page ${currentPage}`);
        break;
      }
      
      currentPage++;
      
      // Rate limiting between pages
      await this.delay(2000);
    }
    
    console.error(`Finished: collected ${result.links.length} links from ${result.metadata.pagesVisited} pages`);
  }

  async extractLinksFromCurrentPage(redditPattern, result, subreddit, pageNumber) {
    let linksFoundOnPage = 0;
    
    for (const selector of redditPattern.selectors) {
      try {
        const elements = await this.page.$$(selector);
        console.error(`Page ${pageNumber}: Selector "${selector}" found ${elements.length} elements`);
        
        if (elements.length > 0) {
          for (const el of elements) {
            const text = await el.textContent();
            const href = await el.getAttribute('href');
            
            if (text && text.trim() && this.isRedditStory(text.trim(), href)) {
              let fullUrl = href;
              if (href && !href.startsWith('http')) {
                try {
                  fullUrl = new URL(href, this.page.url()).toString();
                } catch (urlError) {
                  console.error(`Invalid URL: ${href}`);
                  continue;
                }
              }

              // Check for duplicates (important for pagination)
              if (result.links.some(link => link.url === fullUrl)) {
                continue;
              }

              // Generate smart tags using LLM
              const suggestedTags = await this.generateSuggestedTags(text.trim(), 'old.reddit.com');
              
              // Create rich metadata
              const metadata = {
                extraction: {
                  pattern: redditPattern.pattern_name,
                  selector: selector,
                  extractedAt: new Date().toISOString(),
                  crawlContext: 'discovery_crawl',
                  pageNumber: pageNumber
                },
                subreddit: {
                  name: subreddit,
                  subscribers: result.metadata.subscriberCount,
                  description: result.metadata.description
                },
                discovery: {
                  crawlSession: Date.now(),
                  linkPosition: result.links.length + 1,
                  pagePosition: linksFoundOnPage + 1
                }
              };

              // Save to database
              try {
                await this.database.saveLink({
                  title: text.trim(),
                  url: fullUrl,
                  sourceSite: 'old.reddit.com',
                  sourcePage: `/r/${subreddit}`,
                  tags: suggestedTags,
                  isCurated: false,
                  isPublic: false,
                  metadata: metadata
                });

                result.links.push({
                  title: text.trim(),
                  url: fullUrl,
                  subreddit: subreddit,
                  tags: suggestedTags,
                  page: pageNumber
                });
                
                linksFoundOnPage++;
              } catch (saveError) {
                console.error(`Failed to save link: ${saveError.message}`);
              }
            }
          }
          break; // Use first working selector
        }
      } catch (selectorError) {
        console.error(`Selector failed: ${selectorError.message}`);
        continue;
      }
    }
    
    return linksFoundOnPage;
  }

  async navigateToNextPage() {
    try {
      // Look for the "next" button in Reddit's pagination
      const nextButton = await this.page.$('span.nextprev a[rel="nofollow next"]');
      
      if (!nextButton) {
        console.error('No "next" button found');
        return false;
      }
      
      // Check if the next button is actually clickable (not grayed out)
      const isClickable = await nextButton.evaluate(el => {
        return !el.classList.contains('disabled') && 
               el.textContent.trim().toLowerCase().includes('next');
      });
      
      if (!isClickable) {
        console.error('Next button is disabled');
        return false;
      }
      
      // Get the href for navigation
      const nextUrl = await nextButton.getAttribute('href');
      if (!nextUrl) {
        console.error('Next button has no href');
        return false;
      }
      
      console.error(`Navigating to next page: ${nextUrl}`);
      
      // Navigate to next page
      await Promise.all([
        this.page.waitForNavigation({ 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        }),
        nextButton.click()
      ]);
      
      // Small delay to ensure page is fully loaded
      await this.delay(1500);
      
      return true;
      
    } catch (error) {
      console.error(`Navigation to next page failed: ${error.message}`);
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async queryMetadata(limit = 10, site = null) {
    try {
      let query = `
        SELECT title, url, source_site, saved_at, metadata 
        FROM links 
        WHERE metadata IS NOT NULL
      `;
      const params = [];
      
      if (site) {
        query += ` AND source_site = ?`;
        params.push(site);
      }
      
      query += ` ORDER BY saved_at DESC LIMIT ?`;
      params.push(limit);
      
      const results = await this.database.executeSql(query, params);
      
      let output = `# 📊 Metadata Analytics\n\n`;
      output += `Found **${results.length} links** with rich metadata!\n\n`;
      
      if (results.length === 0) {
        output += 'No metadata found. Start extracting links with patterns to build up analytics data!\n';
      } else {
        results.forEach((link, i) => {
          try {
            const metadata = JSON.parse(link.metadata);
            output += `## ${i + 1}. ${link.title}\n\n`;
            output += `**URL:** ${link.url}\n`;
            output += `**Source:** ${link.source_site}\n`;
            output += `**Saved:** ${this.formatTimeAgo(link.saved_at)}\n\n`;
            
            if (metadata.extraction) {
              output += `**Extraction Info:**\n`;
              output += `- Pattern: ${metadata.extraction.pattern}\n`;
              output += `- Selector: \`${metadata.extraction.selector}\`\n`;
              if (metadata.extraction.siteType) {
                output += `- Site Type: ${metadata.extraction.siteType}\n`;
              }
              output += `\n`;
            }
            
            if (metadata.element) {
              output += `**Element Info:**\n`;
              output += `- Tag: \`<${metadata.element.tagName}>\`\n`;
              if (metadata.element.className) {
                output += `- CSS Classes: \`${metadata.element.className}\`\n`;
              }
              if (metadata.element.parentTag) {
                output += `- Parent: \`<${metadata.element.parentTag}>\`\n`;
              }
              output += `\n`;
            }
            
            if (metadata.content) {
              output += `**Content Analysis:**\n`;
              output += `- Text Length: ${metadata.content.textLength} chars\n`;
              output += `- Link Type: ${metadata.content.linkType}\n`;
              output += `- Has URL: ${metadata.content.hasHref ? 'Yes' : 'No'}\n`;
              output += `\n`;
            }
            
            output += `---\n\n`;
          } catch (parseError) {
            output += `## ${i + 1}. ${link.title}\n\n`;
            output += `**URL:** ${link.url}\n`;
            output += `**Source:** ${link.source_site}\n`;
            output += `**Note:** Metadata parsing failed\n\n---\n\n`;
          }
        });
        
        output += `💡 **Next Steps:**\n`;
        output += `- Export to DuckDB for advanced analytics\n`;
        output += `- Build visualizations of extraction patterns\n`;
        output += `- Analyze content trends across sites\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to query metadata: ${error.message}`);
    }
  }

  generateTagCloudHTML(sortedTags) {
    const now = new Date();
    const generatedDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Calculate font sizes based on frequency
    const maxCount = Math.max(...sortedTags.map(([,stats]) => stats.count));
    const minCount = Math.min(...sortedTags.map(([,stats]) => stats.count));
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tag Cloud - ${generatedDate}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .header .subtitle {
            opacity: 0.9;
            font-size: 1.1em;
        }
        
        .stats {
            background: #f8f9fa;
            padding: 15px 30px;
            border-bottom: 1px solid #e9ecef;
            text-align: center;
            font-size: 0.9em;
            color: #6c757d;
        }
        
        .tag-cloud {
            padding: 40px;
            text-align: center;
            line-height: 2;
        }
        
        .tag {
            display: inline-block;
            margin: 8px;
            padding: 6px 12px;
            background: #e3f2fd;
            color: #1976d2;
            text-decoration: none;
            border-radius: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
            border: 2px solid transparent;
        }
        
        .tag:hover {
            background: #1976d2;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(25, 118, 210, 0.3);
        }
        
        .tag.selected {
            background: #1976d2;
            color: white;
            border-color: #0d47a1;
        }
        
        .tag-count {
            font-size: 0.8em;
            opacity: 0.7;
            margin-left: 4px;
        }
        
        .links-section {
            background: #f8f9fa;
            padding: 30px;
            border-top: 1px solid #e9ecef;
            min-height: 200px;
        }
        
        .links-title {
            font-size: 1.5em;
            margin-bottom: 20px;
            color: #2c3e50;
            text-align: center;
        }
        
        .links-container {
            display: none;
        }
        
        .links-container.active {
            display: block;
        }
        
        .link-item {
            background: white;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            transition: transform 0.2s ease;
        }
        
        .link-item:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .link-title {
            font-weight: 600;
            color: #2c3e50;
            text-decoration: none;
            display: block;
            margin-bottom: 5px;
        }
        
        .link-title:hover {
            color: #667eea;
        }
        
        .link-meta {
            font-size: 0.9em;
            color: #6c757d;
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
        }
        
        .link-score {
            color: #ffc107;
        }
        
        .instructions {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            margin-top: 20px;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .tag-cloud, .links-section {
                padding: 20px;
            }
            
            .tag {
                margin: 4px;
                padding: 4px 8px;
                font-size: 0.9em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ Tag Cloud</h1>
            <div class="subtitle">Explore your personal knowledge collection • ${generatedDate}</div>
        </div>
        
        <div class="stats">
            📊 ${sortedTags.length} unique tags • 🔗 ${sortedTags.reduce((sum, [,stats]) => sum + stats.count, 0)} total tagged links
        </div>
        
        <div class="tag-cloud">
            ${sortedTags.map(([tag, stats]) => {
              // Calculate font size based on frequency (1em to 2.5em)
              const normalized = (stats.count - minCount) / (maxCount - minCount);
              const fontSize = 1 + (normalized * 1.5);
              
              return `<span class="tag" data-tag="${this.escapeHtml(tag)}" style="font-size: ${fontSize}em;">
                ${this.escapeHtml(tag)}
                <span class="tag-count">(${stats.count})</span>
              </span>`;
            }).join('')}
        </div>
        
        <div class="links-section">
            <div class="links-title">Click a tag to see related links</div>
            <div class="instructions">Tags are sized by frequency - larger tags appear more often in your collection</div>
            
            ${sortedTags.map(([tag, stats]) => `
              <div class="links-container" data-tag="${this.escapeHtml(tag)}">
                <h3 style="margin-bottom: 15px; color: #1976d2;">📁 Links tagged with "${this.escapeHtml(tag)}" (${stats.count} total)</h3>
                ${stats.links.map(link => `
                  <div class="link-item">
                    <a href="${link.url}" target="_blank" class="link-title">
                      ${this.escapeHtml(link.title)}
                    </a>
                    <div class="link-meta">
                      <span>🌐 ${this.escapeHtml(link.source_site)}</span>
                      <span>🕒 ${this.formatTimeAgo(link.saved_at)}</span>
                      ${link.score > 0 ? `<span class="link-score">⭐ ${link.score}/5</span>` : ''}
                    </div>
                  </div>
                `).join('')}
                ${stats.count > stats.links.length ? `
                  <div style="text-align: center; margin-top: 15px; color: #6c757d; font-style: italic;">
                    ... and ${stats.count - stats.links.length} more links with this tag
                  </div>
                ` : ''}
              </div>
            `).join('')}
        </div>
    </div>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const tags = document.querySelectorAll('.tag');
            const linksContainers = document.querySelectorAll('.links-container');
            
            tags.forEach(tag => {
                tag.addEventListener('click', function() {
                    const tagName = this.getAttribute('data-tag');
                    
                    // Remove selected class from all tags
                    tags.forEach(t => t.classList.remove('selected'));
                    
                    // Add selected class to clicked tag
                    this.classList.add('selected');
                    
                    // Hide all link containers
                    linksContainers.forEach(container => {
                        container.classList.remove('active');
                    });
                    
                    // Show the corresponding links container
                    const targetContainer = document.querySelector('[data-tag="' + tagName + '"]');
                    if (targetContainer) {
                        targetContainer.classList.add('active');
                        targetContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            });
        });
    </script>
</body>
</html>`;
  }

  async archiveUrl(url, linkId = null, format = 'directory', includeScreenshot = true) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const archivesDir = path.join(__dirname, '..', 'archives');
    
    try {
      // Create archives directory if it doesn't exist
      await fs.mkdir(archivesDir, { recursive: true });
      
      // Generate unique archive folder name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const urlParts = new URL(url);
      const safeHostname = urlParts.hostname.replace(/[^a-zA-Z0-9-]/g, '_');
      const archiveName = `${safeHostname}_${timestamp}`;
      const archivePath = path.join(archivesDir, archiveName);
      
      await fs.mkdir(archivePath, { recursive: true });
      
      console.error(`Starting archive of ${url}...`);
      
      // Create browser instance for archiving
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--allow-running-insecure-content']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      const resources = [];
      let pageTitle = '';
      let screenshotPath = null;
      
      // Intercept resources to save them locally
      await page.route('**/*', async route => {
        const request = route.request();
        const resourceType = request.resourceType();
        
        try {
          const response = await route.fetch();
          
          if (response.ok()) {
            // Save resource locally
            const resourceUrl = request.url();
            const resourcePath = this.getResourcePath(resourceUrl, archivePath);
            const buffer = await response.body();
            
            await fs.mkdir(path.dirname(resourcePath), { recursive: true });
            await fs.writeFile(resourcePath, buffer);
            
            resources.push({
              type: resourceType,
              originalUrl: resourceUrl,
              localPath: path.relative(archivesDir, resourcePath),
              fileSize: buffer.length
            });
            
            console.error(`Saved ${resourceType}: ${resourceUrl}`);
          }
          
          await route.fulfill({ response });
        } catch (error) {
          console.error(`Failed to save resource ${request.url()}:`, error.message);
          await route.continue();
        }
      });
      
      // Navigate and wait for page to fully load
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // Extra time for JS execution
      
      pageTitle = await page.title();
      
      // Capture screenshot if requested
      if (includeScreenshot) {
        screenshotPath = path.join(archivePath, 'screenshot.png');
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        });
        screenshotPath = path.relative(archivesDir, screenshotPath);
      }
      
      // Save the main HTML content with rewritten URLs
      const htmlContent = await this.rewriteHtmlUrls(page, resources, archivePath);
      const htmlPath = path.join(archivePath, 'index.html');
      await fs.writeFile(htmlPath, htmlContent);
      
      await browser.close();
      
      // Calculate total archive size
      const archiveSize = await this.calculateDirectorySize(archivePath);
      
      // Save archive to database
      const archiveId = await this.database.saveArchive({
        linkId,
        url,
        title: pageTitle,
        archivePath: path.relative(archivesDir, archivePath),
        archiveFormat: format,
        archiveSize,
        contentType: 'webpage',
        screenshotPath,
        archiveMetadata: {
          resourceCount: resources.length,
          timestamp,
          userAgent: 'Chrome/120.0.0.0'
        },
        resources
      });
      
      console.error(`Archive completed: ${archivePath}`);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Successfully archived "${pageTitle}" (${url})

📁 Archive ID: ${archiveId}
📂 Path: ${archivePath}
📊 Size: ${(archiveSize / 1024 / 1024).toFixed(2)} MB
🔗 Resources: ${resources.length} files saved
${includeScreenshot ? '📸 Screenshot: Captured' : ''}

The page has been fully archived with all resources for offline viewing.`
        }]
      };
      
    } catch (error) {
      console.error('Archive failed:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Archive failed: ${error.message}`
        }]
      };
    }
  }
  
  async listArchives(limit = 20, contentType = null, hasScreenshot = null) {
    try {
      const archives = await this.database.getArchives({
        limit,
        contentType,
        hasScreenshot
      });
      
      if (archives.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No archives found.'
          }]
        };
      }
      
      const archiveList = archives.map(archive => {
        const sizeInMB = archive.archive_size ? (archive.archive_size / 1024 / 1024).toFixed(2) : 'Unknown';
        const screenshotStatus = archive.screenshot_path ? '📸' : '⭕';
        const linkInfo = archive.link_title ? ` (from link: ${archive.link_title})` : '';
        
        return `📁 **${archive.title || 'Untitled'}**${linkInfo}
   🆔 ID: ${archive.id} | 📊 ${sizeInMB} MB | ${screenshotStatus}
   🔗 ${archive.url}
   📅 Archived: ${new Date(archive.archived_at).toLocaleDateString()}`;
      }).join('\n\n');
      
      return {
        content: [{
          type: 'text',
          text: `📚 **Archives** (${archives.length} found)\n\n${archiveList}`
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to list archives: ${error.message}`
        }]
      };
    }
  }
  
  async browseArchive(archiveId, showResources = true) {
    try {
      const archive = await this.database.getArchiveById(archiveId);
      
      if (!archive) {
        return {
          content: [{
            type: 'text',
            text: `❌ Archive with ID ${archiveId} not found.`
          }]
        };
      }
      
      let response = `📁 **Archive Details**

🆔 **ID:** ${archive.id}
📄 **Title:** ${archive.title || 'Untitled'}
🔗 **URL:** ${archive.url}
📂 **Path:** ${archive.archive_path}
📊 **Size:** ${archive.archive_size ? (archive.archive_size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}
📅 **Archived:** ${new Date(archive.archived_at).toLocaleDateString()}
📸 **Screenshot:** ${archive.screenshot_path ? 'Available' : 'Not captured'}`;
      
      if (archive.link_title) {
        response += `\n🔗 **Linked to:** ${archive.link_title}`;
      }
      
      if (showResources) {
        const resources = await this.database.getArchiveResources(archiveId);
        
        if (resources.length > 0) {
          const resourcesByType = {};
          resources.forEach(resource => {
            if (!resourcesByType[resource.resource_type]) {
              resourcesByType[resource.resource_type] = [];
            }
            resourcesByType[resource.resource_type].push(resource);
          });
          
          response += '\n\n📦 **Resources:**';
          for (const [type, typeResources] of Object.entries(resourcesByType)) {
            const totalSize = typeResources.reduce((sum, r) => sum + (r.file_size || 0), 0);
            response += `\n   ${type}: ${typeResources.length} files (${(totalSize / 1024).toFixed(1)} KB)`;
          }
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to browse archive: ${error.message}`
        }]
      };
    }
  }
  
  // Helper methods for archiving
  getResourcePath(resourceUrl, archivePath) {
    try {
      const url = new URL(resourceUrl);
      let pathname = url.pathname;
      
      // Handle root path
      if (pathname === '/') {
        pathname = '/index';
      }
      
      // Remove leading slash and create safe filename
      pathname = pathname.substring(1);
      const safePath = pathname.replace(/[^a-zA-Z0-9.-_/]/g, '_');
      
      // Add file extension if missing
      if (!path.extname(safePath)) {
        const contentTypeGuess = this.guessContentType(resourceUrl);
        if (contentTypeGuess) {
          pathname = safePath + '.' + contentTypeGuess;
        } else {
          pathname = safePath;
        }
      } else {
        pathname = safePath;
      }
      
      return path.join(archivePath, 'resources', pathname);
    } catch (error) {
      // Fallback for invalid URLs
      const filename = resourceUrl.split('/').pop() || 'resource';
      return path.join(archivePath, 'resources', filename);
    }
  }
  
  guessContentType(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.css') || urlLower.includes('text/css')) return 'css';
    if (urlLower.includes('.js') || urlLower.includes('javascript')) return 'js';
    if (urlLower.includes('.png')) return 'png';
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
    if (urlLower.includes('.gif')) return 'gif';
    if (urlLower.includes('.svg')) return 'svg';
    if (urlLower.includes('.woff') || urlLower.includes('.woff2')) return 'woff';
    return null;
  }
  
  async rewriteHtmlUrls(page, resources, archivePath) {
    // Get the HTML content
    let html = await page.content();
    
    // Create a mapping of original URLs to local paths
    const urlMap = {};
    resources.forEach(resource => {
      const relativePath = path.relative(archivePath, path.join(archivePath, '..', resource.localPath));
      urlMap[resource.originalUrl] = relativePath;
    });
    
    // Rewrite URLs in HTML
    for (const [originalUrl, localPath] of Object.entries(urlMap)) {
      const regex = new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, localPath);
    }
    
    return html;
  }
  
  async calculateDirectorySize(dirPath) {
    let totalSize = 0;
    
    const calculateSize = async (currentPath) => {
      const stats = await fs.stat(currentPath);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(currentPath);
        for (const file of files) {
          await calculateSize(path.join(currentPath, file));
        }
      } else {
        totalSize += stats.size;
      }
    };
    
    await calculateSize(dirPath);
    return totalSize;
  }

  // Browser History Methods
  async syncBrowserHistory(browser = 'chrome', days = 7, dryRun = false) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      const result = await this.historyMonitor.syncBrowserHistory(browser, {
        since,
        limit: 5000,
        dryRun
      });

      const message = dryRun 
        ? `🔍 **Browser History Preview** (${browser})

Found ${result.found} entries from the last ${days} days.

**Sample entries:**
${result.sample.map((entry, i) => 
  `${i + 1}. ${entry.title || 'Untitled'}
   🔗 ${entry.url}
   🕐 ${entry.visit_time}`
).join('\n\n')}

Run without dry_run=true to save these entries to your link garden.`
        : `🌱 **Browser History Synced** (${browser})

📊 Found: ${result.found} entries
💾 Saved: ${result.saved} new entries
📅 Period: Last ${days} days
🕐 Last synced: ${result.lastSynced}

Your natural browsing patterns are now part of your link garden! These entries are marked as "organic browsing" to distinguish them from your curated links.`;

      return {
        content: [{
          type: 'text',
          text: message
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Browser history sync failed: ${error.message}

**Common solutions:**
- Make sure ${browser} is completely closed
- Enable "Full Disk Access" for Terminal in System Preferences > Privacy & Security
- Try a different browser if this one isn't available`
        }]
      };
    }
  }

  async checkBrowserAvailability() {
    try {
      const available = await this.historyMonitor.checkBrowserAvailability();
      
      const browserList = Object.entries(available).map(([name, config]) => 
        `✅ **${name}** - ${config.history}`
      ).join('\n');

      const message = Object.keys(available).length > 0 
        ? `🔍 **Available Browsers for History Monitoring**

${browserList}

**To sync history:**
\`sync_browser_history\` with browser parameter (e.g., "chrome", "safari", "arc")

**Note:** Make sure the browser is closed before syncing to avoid database locks.`
        : `❌ **No browsers available for monitoring**

This could mean:
- No supported browsers are installed
- Browser history files aren't accessible
- You need "Full Disk Access" permission

**Supported browsers:** Chrome, Safari, Arc, Brave, Chrome Beta, Chrome Canary`;

      return {
        content: [{
          type: 'text',
          text: message
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Browser availability check failed: ${error.message}`
        }]
      };
    }
  }

  async getBrowsingHistory(options = {}) {
    try {
      const {
        limit = 50,
        hours = 24,
        organic_only = true,
        browser = null,
        url_pattern = null
      } = options;

      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      const history = await this.database.getBrowsingHistory({
        limit,
        since,
        organic_only,
        browser,
        url_pattern
      });

      if (history.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No browsing history found for the specified criteria.

Try:
- Syncing browser history first with \`sync_browser_history\`
- Expanding the time range (increase hours parameter)
- Removing filters to see all entries`
          }]
        };
      }

      const historyList = history.map((entry, i) => {
        const timeAgo = this.getTimeAgo(new Date(entry.visit_time));
        const browserBadge = entry.browser ? `[${entry.browser}]` : '';
        const organicBadge = entry.is_organic ? '🌱' : '🤖';
        
        return `${i + 1}. ${organicBadge} **${entry.title || 'Untitled'}** ${browserBadge}
   🔗 ${entry.url}
   🕐 ${timeAgo}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `🕐 **Your Recent Browsing Activity** (${history.length} entries)

${historyList}

🌱 = Organic browsing | 🤖 = Automated/intentional
Use \`analyze_browsing_patterns\` to see insights about your browsing habits.`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to get browsing history: ${error.message}`
        }]
      };
    }
  }

  async analyzeBrowsingPatterns(days = 7) {
    try {
      const patterns = await this.historyMonitor.analyzeBrowsingPatterns(days);
      
      const topDomainsText = patterns.topDomains.map(([domain, count]) => 
        `• ${domain}: ${count} visits`
      ).join('\n');

      const activeHoursText = patterns.mostActiveHours.map(([hour, count]) => 
        `• ${hour}:00 - ${count} visits`
      ).join('\n');

      const referrerText = patterns.topReferrerPaths.slice(0, 5).map(([path, count]) => 
        `• ${path}: ${count} times`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📊 **Your Browsing Patterns** (${days} days)

**📈 Overview:**
• Total visits: ${patterns.totalVisits}
• Unique domains: ${patterns.topDomains.length}

**🌐 Top Domains:**
${topDomainsText}

**⏰ Most Active Hours:**
${activeHoursText}

**🔄 Common Navigation Paths:**
${referrerText}

These patterns help understand your natural browsing habits vs intentional link discovery!`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to analyze browsing patterns: ${error.message}`
        }]
      };
    }
  }

  async findUnvisitedGems() {
    try {
      const gems = await this.historyMonitor.findInterestingUnvisitedLinks();
      
      if (gems.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `💎 No unvisited gems found.

This could mean:
- Most of your browsing history is already in your link garden
- Try syncing more browser history first
- Your browsing hasn't included many article-type links recently

Keep browsing and sync again later!`
          }]
        };
      }

      const gemsList = gems.map((gem, i) => {
        const timeAgo = this.getTimeAgo(new Date(gem.visit_time));
        return `${i + 1}. **${gem.title}**
   🔗 ${gem.url}
   👀 Visited ${gem.visit_count} time(s) | ${timeAgo}
   📱 From: ${gem.browser}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `💎 **Unvisited Gems from Your Browsing** (${gems.length} found)

These are interesting links you've visited but haven't added to your curated collection:

${gemsList}

💡 Consider using \`save_link\` to add the interesting ones to your link garden!`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to find unvisited gems: ${error.message}`
        }]
      };
    }
  }

  async getBrowsingStats(days = 7) {
    try {
      const stats = await this.database.getBrowsingStats(days);
      
      if (stats.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📊 No browsing statistics available for the last ${days} days.

Try syncing your browser history first with \`sync_browser_history\`.`
          }]
        };
      }

      const statsText = stats.map(stat => {
        const avgDuration = stat.avg_duration ? `${Math.round(stat.avg_duration / 1000)}s avg` : 'No duration data';
        return `📱 **${stat.browser}**
   • ${stat.visit_count} total visits
   • ${stat.unique_urls} unique URLs  
   • ${avgDuration}
   • Active: ${new Date(stat.first_visit).toLocaleDateString()} - ${new Date(stat.last_visit).toLocaleDateString()}`;
      }).join('\n\n');

      const totalVisits = stats.reduce((sum, stat) => sum + stat.visit_count, 0);
      const totalUnique = stats.reduce((sum, stat) => sum + stat.unique_urls, 0);

      return {
        content: [{
          type: 'text',
          text: `📊 **Browsing Statistics** (${days} days)

**🌍 Overall:**
• ${totalVisits} total visits across all browsers
• ${totalUnique} unique URLs visited

${statsText}

Use \`analyze_browsing_patterns\` for deeper insights into your browsing habits!`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to get browsing stats: ${error.message}`
        }]
      };
    }
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Browser MCP server running on stdio');
  }
}

const server = new BrowserMCPServer();
server.run().catch(console.error);