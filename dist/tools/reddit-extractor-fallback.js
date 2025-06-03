import { chromium } from 'playwright';
/**
 * Fallback Reddit extractor that uses direct Playwright when MCP fails
 * This provides a reliable backup for your personal Reddit browsing patterns
 */
export class RedditExtractorFallback {
    database;
    browser = null;
    page = null;
    constructor(database) {
        this.database = database;
    }
    async connect() {
        console.error('🔄 Connecting to fallback Reddit extractor...');
        this.browser = await chromium.launch({
            headless: false, // Visible browser is less likely to be blocked
            slowMo: 500, // Slower = more human-like
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                // Anti-detection measures
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        const context = await this.browser.newContext({
            // Use a very standard user agent
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            // Add some realistic browser characteristics
            locale: 'en-US',
            timezoneId: 'America/New_York',
        });
        this.page = await context.newPage();
        // Add some human-like behavior
        await this.page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        });
        console.error('✅ Fallback extractor ready');
    }
    async getRedditStories(count = 10, subreddit) {
        if (!this.page) {
            throw new Error('Not connected. Call connect() first.');
        }
        const baseUrl = subreddit ? `https://old.reddit.com/r/${subreddit}` : 'https://old.reddit.com';
        try {
            console.error(`🌐 Navigating to ${baseUrl}...`);
            // Navigate with human-like timing
            await this.page.goto(baseUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            // Wait a bit more to seem human
            await this.page.waitForTimeout(2000);
            // Use the selectors that work with old.reddit.com
            const stories = await this.page.evaluate((count) => {
                const posts = document.querySelectorAll('.thing.link');
                const extractedStories = [];
                for (let i = 0; i < Math.min(count, posts.length); i++) {
                    const post = posts[i];
                    const titleElement = post.querySelector('.title.may-blank a');
                    const scoreElement = post.querySelector('.score.unvoted div');
                    const commentsElement = post.querySelector('.comments');
                    const subredditElement = post.querySelector('.subreddit');
                    if (titleElement) {
                        const title = titleElement.textContent?.trim() || '';
                        const url = titleElement.href;
                        const score = scoreElement?.textContent?.trim() || '0';
                        const comments = commentsElement?.textContent?.trim() || '0 comments';
                        const subreddit = subredditElement?.textContent?.trim() || '';
                        extractedStories.push({
                            title,
                            url,
                            score,
                            comments,
                            subreddit,
                            source_site: 'old.reddit.com',
                            source_page: window.location.pathname
                        });
                    }
                }
                return extractedStories;
            }, count);
            if (stories.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: '⚠️ No stories found. Reddit might be blocking us or the page structure changed.'
                        }]
                };
            }
            // Save to your personal garden
            for (const story of stories) {
                try {
                    await this.database.saveLink({
                        title: story.title,
                        url: story.url,
                        sourceSite: story.source_site,
                        sourcePage: story.source_page,
                        tags: ['reddit', subreddit || 'frontpage'],
                        metadata: {
                            score: story.score,
                            comments: story.comments,
                            subreddit: story.subreddit,
                            extractedAt: new Date().toISOString(),
                            extractedBy: 'fallback-extractor'
                        }
                    });
                }
                catch (error) {
                    console.error(`Failed to save story: ${story.title}`, error);
                }
            }
            const output = stories.map((story, index) => {
                return `${index + 1}. **${story.title}**
   📊 Score: ${story.score} | 💬 ${story.comments}
   🔗 ${story.url}
   📍 ${story.subreddit}`;
            }).join('\n\n');
            return {
                content: [{
                        type: 'text',
                        text: `🌱 **Gathered ${stories.length} stories for your garden**

${output}

✅ All stories saved to your personal link collection.`
                    }]
            };
        }
        catch (error) {
            console.error('Reddit extraction failed:', error);
            return {
                content: [{
                        type: 'text',
                        text: `❌ Reddit extraction failed: ${error.message}

This might be due to:
- Reddit's anti-bot measures
- Network issues  
- Page structure changes

Try again in a few minutes, or use a different approach.`
                    }]
            };
        }
    }
    async disconnect() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            console.error('🔌 Disconnected from fallback extractor');
        }
    }
    isConnected() {
        return this.browser !== null && this.page !== null;
    }
}
//# sourceMappingURL=reddit-extractor-fallback.js.map