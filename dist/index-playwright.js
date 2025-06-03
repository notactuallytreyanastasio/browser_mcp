import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Database } from './database.js';
import { PlaywrightMCPClient } from './services/playwright-mcp-client.js';
import { LearningModeService } from './services/learning-mode.js';
import { ArchiveManager } from './tools/archive-manager.js';
import { LinkManager } from './tools/link-manager.js';
import { RedditExtractorFallback } from './tools/reddit-extractor-fallback.js';
import { BrowserError, DatabaseError } from './types/index.js';
class IntelligentContentDiscovery {
    server;
    database;
    playwrightClient;
    learningMode;
    archiveManager;
    linkManager;
    redditFallback;
    constructor() {
        this.server = new Server({
            name: 'intelligent-content-discovery',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.database = new Database();
        this.playwrightClient = new PlaywrightMCPClient({
            browser: 'chromium',
            headless: true,
            viewport: { width: 1280, height: 720 }
        });
        this.learningMode = new LearningModeService(this.playwrightClient, this.database);
        this.archiveManager = new ArchiveManager(this.database);
        this.linkManager = new LinkManager(this.database, this.server);
        this.redditFallback = new RedditExtractorFallback(this.database);
        this.setupToolHandlers();
        this.initServices();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                // Browser Control
                {
                    name: 'connect_browser',
                    description: 'Connect to Playwright MCP server for browser automation',
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'navigate_to',
                    description: 'Navigate to a specific URL using Playwright MCP',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'The URL to navigate to' },
                        },
                        required: ['url'],
                    },
                },
                {
                    name: 'take_screenshot',
                    description: 'Take a screenshot of the current page',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            fullPage: { type: 'boolean', description: 'Take full page screenshot', default: false },
                        },
                    },
                },
                // Learning Mode
                {
                    name: 'start_learning_session',
                    description: 'Start an intelligent learning session to identify content extraction patterns',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Name for this learning session' },
                            target_url: { type: 'string', description: 'URL to learn patterns from' },
                            description: { type: 'string', description: 'Description of what to learn' },
                        },
                        required: ['name', 'target_url'],
                    },
                },
                {
                    name: 'record_click',
                    description: 'Record a click interaction for pattern learning',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            session_id: { type: 'string', description: 'Learning session ID' },
                            element_description: { type: 'string', description: 'Description of element to click' },
                        },
                        required: ['session_id', 'element_description'],
                    },
                },
                {
                    name: 'record_extraction',
                    description: 'Record data extraction for a specific field',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            session_id: { type: 'string', description: 'Learning session ID' },
                            field_name: { type: 'string', description: 'Name of the field being extracted (e.g., title, score, url)' },
                            element_description: { type: 'string', description: 'Description of elements to extract' },
                        },
                        required: ['session_id', 'field_name', 'element_description'],
                    },
                },
                {
                    name: 'analyze_learning_session',
                    description: 'Analyze recorded interactions and generate extraction patterns',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            session_id: { type: 'string', description: 'Learning session ID to analyze' },
                        },
                        required: ['session_id'],
                    },
                },
                {
                    name: 'list_learning_sessions',
                    description: 'List all active and completed learning sessions',
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'validate_pattern',
                    description: 'Test a learned pattern on a specific URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            pattern_id: { type: 'string', description: 'ID of pattern to validate' },
                            test_url: { type: 'string', description: 'URL to test the pattern on' },
                        },
                        required: ['pattern_id', 'test_url'],
                    },
                },
                {
                    name: 'apply_pattern',
                    description: 'Apply a learned pattern to extract content from a URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            pattern_id: { type: 'string', description: 'ID of pattern to apply' },
                            url: { type: 'string', description: 'URL to extract content from' },
                            save_results: { type: 'boolean', description: 'Save extracted content to database', default: true },
                        },
                        required: ['pattern_id', 'url'],
                    },
                },
                // Content Management (existing tools)
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
                // Archive Tools
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
                // Reddit Fallback (when MCP is blocked)
                {
                    name: 'reddit_connect_fallback',
                    description: 'Connect to fallback Reddit extractor when MCP is blocked',
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'reddit_get_stories',
                    description: 'Get Reddit stories using fallback extractor (bypasses blocks)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            count: { type: 'number', description: 'Number of stories to get', default: 10 },
                            subreddit: { type: 'string', description: 'Subreddit name (without /r/)' },
                        },
                    },
                },
                {
                    name: 'reddit_disconnect_fallback',
                    description: 'Disconnect from fallback Reddit extractor',
                    inputSchema: { type: 'object', properties: {} },
                },
                // System
                {
                    name: 'disconnect_browser',
                    description: 'Disconnect from Playwright MCP server',
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
                    // Browser Control
                    case 'connect_browser':
                        return await this.connectBrowser();
                    case 'navigate_to':
                        return await this.navigateTo(args.url);
                    case 'take_screenshot':
                        return await this.takeScreenshot(args.fullPage);
                    // Learning Mode
                    case 'start_learning_session':
                        return await this.startLearningSession(args.name, args.target_url, args.description);
                    case 'record_click':
                        return await this.recordClick(args.session_id, args.element_description);
                    case 'record_extraction':
                        return await this.recordExtraction(args.session_id, args.field_name, args.element_description);
                    case 'analyze_learning_session':
                        return await this.analyzeLearningSession(args.session_id);
                    case 'list_learning_sessions':
                        return await this.listLearningSessions();
                    case 'validate_pattern':
                        return await this.validatePattern(args.pattern_id, args.test_url);
                    case 'apply_pattern':
                        return await this.applyPattern(args.pattern_id, args.url, args.save_results !== false);
                    // Content Management
                    case 'query_links':
                        return await this.linkManager.queryLinks(args);
                    case 'curate_link':
                        return await this.linkManager.curateLink(args);
                    case 'bag_of_links':
                        return await this.linkManager.getBagOfLinks(args.count || 10, args.min_days_old || 2, args.max_days_old || 90);
                    case 'tag_cloud':
                        return await this.linkManager.generateTagCloud(args.max_tags || 50, args.links_per_tag || 5);
                    // Archive Tools
                    case 'archive_url':
                        return await this.archiveManager.archiveUrl(args.url, args.link_id, args.format || 'directory', args.include_screenshot !== false);
                    case 'list_archives':
                        return await this.archiveManager.listArchives(args.limit || 20, args.content_type, args.has_screenshot);
                    case 'browse_archive':
                        return await this.archiveManager.browseArchive(args.archive_id, args.show_resources !== false);
                    // Reddit Fallback
                    case 'reddit_connect_fallback':
                        return await this.connectRedditFallback();
                    case 'reddit_get_stories':
                        return await this.getRedditStories(args.count || 10, args.subreddit);
                    case 'reddit_disconnect_fallback':
                        return await this.disconnectRedditFallback();
                    // System
                    case 'disconnect_browser':
                        return await this.disconnectBrowser();
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
    // Browser Control Methods
    async connectBrowser() {
        try {
            await this.playwrightClient.connect();
            return {
                content: [{
                        type: 'text',
                        text: '✅ Connected to Playwright MCP server'
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to connect: ${error.message}`, error);
        }
    }
    async navigateTo(url) {
        const result = await this.playwrightClient.navigate(url);
        if (!result.success) {
            throw new BrowserError(`Navigation failed: ${result.error}`, new Error(result.error));
        }
        return {
            content: [{
                    type: 'text',
                    text: `✅ Successfully navigated to: ${url}`
                }]
        };
    }
    async takeScreenshot(fullPage = false) {
        const result = await this.playwrightClient.takeScreenshot(fullPage);
        if (!result.success) {
            throw new BrowserError(`Screenshot failed: ${result.error}`, new Error(result.error));
        }
        return {
            content: [{
                    type: 'text',
                    text: `📸 Screenshot captured successfully`
                }]
        };
    }
    // Learning Mode Methods
    async startLearningSession(name, targetUrl, description) {
        try {
            const session = await this.learningMode.startLearningSession(name, targetUrl, { description });
            return {
                content: [{
                        type: 'text',
                        text: `🎓 Learning session started: "${name}"

📋 Session ID: ${session.id}
🌐 Target URL: ${targetUrl}
📍 Status: ${session.status}

Ready to record interactions! Use 'record_click' and 'record_extraction' to teach the system what to extract.`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to start learning session: ${error.message}`, error);
        }
    }
    async recordClick(sessionId, elementDescription) {
        try {
            const interaction = await this.learningMode.recordClick(sessionId, elementDescription);
            return {
                content: [{
                        type: 'text',
                        text: `📍 Recorded click interaction

🎯 Element: ${elementDescription}
✅ Success: ${interaction.result.success}
🕐 Timestamp: ${new Date(interaction.timestamp).toLocaleTimeString()}

${interaction.result.success ? 'Interaction recorded successfully!' : `Error: ${interaction.result.error}`}`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to record click: ${error.message}`, error);
        }
    }
    async recordExtraction(sessionId, fieldName, elementDescription) {
        try {
            await this.learningMode.recordExtraction(sessionId, fieldName, elementDescription);
            return {
                content: [{
                        type: 'text',
                        text: `📝 Recorded extraction for field: "${fieldName}"

🎯 Target: ${elementDescription}
✅ Extraction data captured for pattern learning

Use 'analyze_learning_session' when ready to generate patterns.`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to record extraction: ${error.message}`, error);
        }
    }
    async analyzeLearningSession(sessionId) {
        try {
            const patterns = await this.learningMode.analyzeSession(sessionId);
            const patternList = patterns.map(pattern => `📋 **${pattern.name}**
   🎯 Confidence: ${(pattern.confidence * 100).toFixed(1)}%
   🔍 Rules: ${pattern.extractionRules.length}
   📊 Learned from: ${pattern.metadata.learnedFrom} interactions`).join('\n\n');
            return {
                content: [{
                        type: 'text',
                        text: `🧠 Learning session analysis complete!

Generated ${patterns.length} extraction patterns:

${patternList}

Patterns have been saved to the database and are ready for use with 'apply_pattern'.`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to analyze session: ${error.message}`, error);
        }
    }
    async listLearningSessions() {
        const sessions = this.learningMode.getActiveSessions();
        if (sessions.length === 0) {
            return {
                content: [{
                        type: 'text',
                        text: 'No active learning sessions found.'
                    }]
            };
        }
        const sessionList = sessions.map(session => `📚 **${session.name}** (${session.id})
   🌐 Site: ${session.targetSite}
   📊 Status: ${session.status}
   🔢 Interactions: ${session.interactions.length}
   📅 Started: ${new Date(session.startedAt).toLocaleString()}`).join('\n\n');
        return {
            content: [{
                    type: 'text',
                    text: `🎓 **Learning Sessions**\n\n${sessionList}`
                }]
        };
    }
    async validatePattern(patternId, testUrl) {
        try {
            // This would need to be implemented in the learning mode service
            return {
                content: [{
                        type: 'text',
                        text: `🧪 Pattern validation for ${patternId} on ${testUrl} - Feature coming soon!`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to validate pattern: ${error.message}`, error);
        }
    }
    async applyPattern(patternId, url, saveResults) {
        try {
            const results = await this.learningMode.applyPattern(patternId, url);
            if (saveResults && results.length > 0) {
                // Save extracted content to database
                for (const result of results) {
                    await this.database.saveLink({
                        title: result.title || 'Extracted Content',
                        url: result.url || url,
                        sourceSite: new URL(url).hostname,
                        sourcePage: 'pattern_extraction',
                        tags: ['extracted', 'pattern_' + patternId],
                        metadata: { extractedBy: patternId, extractedAt: new Date().toISOString() }
                    });
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: `🎯 Pattern applied successfully!

📊 Extracted ${results.length} items from ${url}
💾 Saved to database: ${saveResults ? 'Yes' : 'No'}

Results preview:
${results.slice(0, 3).map(r => `- ${r.field}: ${r.value}`).join('\n')}`
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to apply pattern: ${error.message}`, error);
        }
    }
    async disconnectBrowser() {
        try {
            await this.playwrightClient.disconnect();
            return {
                content: [{
                        type: 'text',
                        text: '✅ Disconnected from Playwright MCP server'
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to disconnect: ${error.message}`, error);
        }
    }
    // Reddit Fallback Methods
    async connectRedditFallback() {
        try {
            await this.redditFallback.connect();
            return {
                content: [{
                        type: 'text',
                        text: '🔄 Connected to fallback Reddit extractor\n\n⚠️ Using direct browser connection to bypass Reddit blocks.\nThis uses a visible browser window with human-like behavior.'
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to connect fallback: ${error.message}`, error);
        }
    }
    async getRedditStories(count, subreddit) {
        if (!this.redditFallback.isConnected()) {
            return {
                content: [{
                        type: 'text',
                        text: '❌ Not connected to fallback extractor. Use "reddit_connect_fallback" first.'
                    }]
            };
        }
        try {
            return await this.redditFallback.getRedditStories(count, subreddit);
        }
        catch (error) {
            throw new BrowserError(`Reddit extraction failed: ${error.message}`, error);
        }
    }
    async disconnectRedditFallback() {
        try {
            await this.redditFallback.disconnect();
            return {
                content: [{
                        type: 'text',
                        text: '✅ Disconnected from fallback Reddit extractor'
                    }]
            };
        }
        catch (error) {
            throw new BrowserError(`Failed to disconnect fallback: ${error.message}`, error);
        }
    }
    async initServices() {
        try {
            await this.database.init();
            console.error('✅ Database initialized');
        }
        catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw new DatabaseError('Failed to initialize database', error);
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('🚀 Intelligent Content Discovery MCP server running on stdio');
        console.error('🎓 Learning mode ready - use connect_browser to start');
    }
}
const server = new IntelligentContentDiscovery();
server.run().catch(console.error);
//# sourceMappingURL=index-playwright.js.map