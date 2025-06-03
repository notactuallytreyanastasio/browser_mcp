import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { CommandProcessor } from './command-processor.js';
import { Database } from './database.js';
import { SessionManager } from './session-manager.js';
import { RedditExtractor } from './tools/reddit-extractor.js';
import { ArchiveManager } from './tools/archive-manager.js';
import { LinkManager } from './tools/link-manager.js';
import { BrowserError, DatabaseError } from './types/index.js';
class BrowserMCPServer {
    server;
    browser = null;
    page = null;
    database;
    _commandProcessor;
    _sessionManager;
    redditExtractor;
    archiveManager;
    linkManager;
    constructor() {
        this.server = new Server({
            name: 'browser-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.database = new Database();
        this._commandProcessor = new CommandProcessor(this);
        this._sessionManager = new SessionManager();
        // Initialize tool managers
        this.redditExtractor = new RedditExtractor(this.browser, this.database);
        this.archiveManager = new ArchiveManager(this.database);
        this.linkManager = new LinkManager(this.database, this.server);
        this.setupToolHandlers();
        this.initDatabase();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'open_browser',
                    description: 'Opens a browser instance',
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'navigate_to',
                    description: 'Navigate to a specific URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'The URL to navigate to' },
                        },
                        required: ['url'],
                    },
                },
                {
                    name: 'get_top_stories',
                    description: 'Get top stories from Reddit homepage',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            count: { type: 'number', description: 'Number of stories to retrieve (default: 3)' },
                        },
                    },
                },
                {
                    name: 'get_top_stories_multi',
                    description: 'Get top stories from multiple sites and subreddits',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sites: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Array of sites/subreddits like ["/r/technology", "hacker news"]'
                            },
                            count: { type: 'number', description: 'Number of stories per site (default: 10)', default: 10 },
                            format: { type: 'string', enum: ['markdown', 'json'], default: 'markdown' },
                            save_links: { type: 'boolean', default: true }
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
                            limit: { type: 'number', default: 50 },
                            is_curated: { type: 'boolean' },
                            source_site: { type: 'string' },
                            search_text: { type: 'string' },
                            min_score: { type: 'number' },
                            tags: { type: 'array', items: { type: 'string' } }
                        }
                    },
                },
                {
                    name: 'curate_link',
                    description: 'Mark a link as curated and add metadata',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            link_id: { type: 'number', description: 'ID of link to curate' },
                            score: { type: 'number', description: 'Rating 1-5' },
                            tags: { type: 'array', items: { type: 'string' } },
                            notes: { type: 'string' },
                            is_public: { type: 'boolean' }
                        },
                        required: ['link_id']
                    },
                },
                {
                    name: 'bag_of_links',
                    description: 'Generate a curated HTML page of interesting links',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            count: { type: 'number', default: 10 },
                            min_days_old: { type: 'number', default: 2 },
                            max_days_old: { type: 'number', default: 90 }
                        }
                    },
                },
                {
                    name: 'tag_cloud',
                    description: 'Generate an interactive tag cloud HTML page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            max_tags: { type: 'number', default: 50 },
                            links_per_tag: { type: 'number', default: 5 }
                        }
                    },
                },
                {
                    name: 'archive_url',
                    description: 'Archive a webpage for offline viewing with full resource capture',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'URL to archive' },
                            link_id: { type: 'number', description: 'Optional link ID to associate' },
                            format: { type: 'string', enum: ['directory', 'mhtml'], default: 'directory' },
                            include_screenshot: { type: 'boolean', default: true }
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
                            limit: { type: 'number', default: 20 },
                            content_type: { type: 'string' },
                            has_screenshot: { type: 'boolean' }
                        }
                    },
                },
                {
                    name: 'browse_archive',
                    description: 'Get details about a specific archive',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            archive_id: { type: 'number', description: 'ID of archive to browse' },
                            show_resources: { type: 'boolean', default: true }
                        },
                        required: ['archive_id']
                    },
                },
                {
                    name: 'close_browser',
                    description: 'Close the browser instance',
                    inputSchema: { type: 'object', properties: {} },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            if (!args) {
                throw new Error('Missing arguments for tool call');
            }
            try {
                switch (name) {
                    case 'open_browser':
                        return await this.openBrowser();
                    case 'navigate_to':
                        return await this.navigateTo(args.url);
                    case 'get_top_stories':
                        this.redditExtractor.browser = this.browser;
                        this.redditExtractor.page = this.page;
                        return await this.redditExtractor.getTopStories(args.count || 3);
                    case 'get_top_stories_multi':
                        this.redditExtractor.browser = this.browser;
                        this.redditExtractor.page = this.page;
                        return await this.redditExtractor.getTopStoriesMulti(args.sites, args.count || 10, args.format || 'markdown', args.save_links !== false);
                    case 'query_links':
                        return await this.linkManager.queryLinks(args);
                    case 'curate_link':
                        return await this.linkManager.curateLink(args);
                    case 'bag_of_links':
                        return await this.linkManager.getBagOfLinks(args.count || 10, args.min_days_old || 2, args.max_days_old || 90);
                    case 'tag_cloud':
                        return await this.linkManager.generateTagCloud(args.max_tags || 50, args.links_per_tag || 5);
                    case 'archive_url':
                        return await this.archiveManager.archiveUrl(args.url, args.link_id, args.format || 'directory', args.include_screenshot !== false);
                    case 'list_archives':
                        return await this.archiveManager.listArchives(args.limit || 20, args.content_type, args.has_screenshot);
                    case 'browse_archive':
                        return await this.archiveManager.browseArchive(args.archive_id, args.show_resources !== false);
                    case 'close_browser':
                        return await this.closeBrowser();
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [{
                            type: 'text',
                            text: `Error: ${error.message}`,
                        }],
                };
            }
        });
    }
    async openBrowser() {
        if (this.browser) {
            return {
                content: [{
                        type: 'text',
                        text: 'Browser is already open',
                    }],
            };
        }
        try {
            console.error('Starting browser launch...');
            const config = {
                headless: true,
                slowMo: 200,
                args: [
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                ]
            };
            this.browser = await chromium.launch(config);
            const context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            this.page = await context.newPage();
            // Update extractors with new browser/page
            this.redditExtractor.browser = this.browser;
            this.redditExtractor.page = this.page;
            console.error('Browser launched successfully');
            return {
                content: [{
                        type: 'text',
                        text: '✅ Browser opened successfully',
                    }],
            };
        }
        catch (error) {
            console.error('Browser launch failed:', error);
            throw new BrowserError(`Failed to open browser: ${error.message}`, error);
        }
    }
    async navigateTo(url) {
        if (!this.page) {
            return {
                content: [{
                        type: 'text',
                        text: 'No browser page available. Please open browser first.',
                    }],
            };
        }
        try {
            console.error(`Navigating to: ${url}`);
            await this.page.goto(url);
            await this.page.waitForLoadState('networkidle');
            const title = await this.page.title();
            return {
                content: [{
                        type: 'text',
                        text: `✅ Successfully navigated to: ${title}`,
                    }],
            };
        }
        catch (error) {
            console.error('Navigation failed:', error);
            throw new BrowserError(`Failed to navigate: ${error.message}`, error);
        }
    }
    async closeBrowser() {
        if (!this.browser) {
            return {
                content: [{
                        type: 'text',
                        text: 'No browser to close',
                    }],
            };
        }
        try {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            // Reset extractors
            this.redditExtractor.browser = null;
            this.redditExtractor.page = null;
            console.error('Browser closed');
            return {
                content: [{
                        type: 'text',
                        text: '✅ Browser closed successfully',
                    }],
            };
        }
        catch (error) {
            console.error('Browser close failed:', error);
            throw new BrowserError(`Failed to close browser: ${error.message}`, error);
        }
    }
    async initDatabase() {
        try {
            await this.database.init();
            console.error('Database initialized successfully');
        }
        catch (error) {
            console.error('Database initialization failed:', error);
            throw new DatabaseError('Failed to initialize database', error);
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
//# sourceMappingURL=index.js.map