import { ExtractionError } from '../types/index.js';
export class RedditExtractor {
    database;
    browser;
    page;
    constructor(browser, database) {
        this.database = database;
        this.browser = browser;
        this.page = null;
    }
    async getTopStories(count = 3) {
        if (!this.browser || !this.page) {
            throw new ExtractionError('Browser not initialized. Please open browser first.');
        }
        console.error(`Getting top ${count} stories from Reddit...`);
        await this.page.goto('https://old.reddit.com');
        await this.page.waitForLoadState('networkidle');
        try {
            // Get the top stories from old.reddit.com using working selectors
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
                        const title = titleElement.textContent?.trim() || '';
                        const link = titleElement.href;
                        const score = scoreElement?.textContent?.trim() || '0';
                        const comments = commentsElement?.textContent?.trim() || '0 comments';
                        const subreddit = subredditElement?.textContent?.trim() || '';
                        topStories.push({
                            title,
                            url: link,
                            score,
                            comments,
                            subreddit,
                            source_site: 'old.reddit.com',
                            source_page: 'front page'
                        });
                    }
                }
                return topStories;
            }, count);
            if (stories.length === 0) {
                throw new ExtractionError('No stories found on Reddit');
            }
            console.error(`Successfully extracted ${stories.length} stories from Reddit`);
            // Format as markdown
            const output = stories.map((story, index) => {
                return `${index + 1}. **${story.title}**
   Score: ${story.score} | Comments: ${story.comments}
   Link: ${story.url}
   Subreddit: ${story.subreddit}`;
            }).join('\n\n');
            return {
                content: [{
                        type: 'text',
                        text: `🔥 **Top ${stories.length} Reddit Stories**\n\n${output}`
                    }]
            };
        }
        catch (error) {
            console.error('Reddit extraction error:', error);
            throw new ExtractionError('Failed to extract Reddit stories', 'reddit', error);
        }
    }
    async getTopStoriesMulti(sites, count = 10, format = 'markdown', saveLinks = true) {
        const allStories = [];
        const results = {
            success: [],
            failed: []
        };
        for (const site of sites) {
            try {
                console.error(`Processing site: ${site}`);
                let stories = [];
                if (site.includes('reddit') || site.startsWith('/r/')) {
                    stories = await this.extractFromReddit(site, count);
                }
                else if (site.includes('news.ycombinator') || site.includes('hacker news')) {
                    stories = await this.extractFromHackerNews(count);
                }
                else {
                    throw new ExtractionError(`Unsupported site: ${site}`, site);
                }
                if (saveLinks && stories.length > 0) {
                    await this.saveStoriesToDatabase(stories, site);
                }
                allStories.push(...stories);
                results.success.push(site);
            }
            catch (error) {
                const err = error;
                console.error(`Failed to extract from ${site}:`, err.message);
                results.failed.push({ site, error: err.message });
            }
        }
        return this.formatResults(allStories, format, results);
    }
    async extractFromReddit(site, count) {
        if (!this.page) {
            throw new ExtractionError('Browser page not available');
        }
        let url = 'https://old.reddit.com';
        let sourcePage = 'front page';
        if (site.startsWith('/r/')) {
            url = `https://old.reddit.com${site}`;
            sourcePage = site;
        }
        else if (site.includes('reddit')) {
            const subredditMatch = site.match(/r\/([^\/\s]+)/);
            if (subredditMatch) {
                url = `https://old.reddit.com/r/${subredditMatch[1]}`;
                sourcePage = `/r/${subredditMatch[1]}`;
            }
        }
        console.error(`Navigating to: ${url}`);
        await this.page.goto(url);
        await this.page.waitForLoadState('networkidle');
        const stories = await this.page.evaluate((count) => {
            const posts = document.querySelectorAll('.thing.link');
            const extractedStories = [];
            for (let i = 0; i < Math.min(count, posts.length); i++) {
                const post = posts[i];
                const titleElement = post.querySelector('.title.may-blank a');
                const scoreElement = post.querySelector('.score.unvoted div');
                if (titleElement) {
                    extractedStories.push({
                        title: titleElement.textContent?.trim() || '',
                        url: titleElement.href,
                        score: scoreElement?.textContent?.trim() || '0',
                        source_site: 'old.reddit.com',
                        source_page: window.location.pathname
                    });
                }
            }
            return extractedStories;
        }, count);
        return stories.map(story => ({
            ...story,
            source_page: sourcePage
        }));
    }
    async extractFromHackerNews(count) {
        if (!this.page) {
            throw new ExtractionError('Browser page not available');
        }
        console.error('Navigating to Hacker News...');
        await this.page.goto('https://news.ycombinator.com');
        await this.page.waitForLoadState('networkidle');
        const stories = await this.page.evaluate((count) => {
            const posts = document.querySelectorAll('.athing');
            const extractedStories = [];
            for (let i = 0; i < Math.min(count, posts.length); i++) {
                const post = posts[i];
                const titleElement = post.querySelector('.titleline > a');
                const scoreRow = post.nextElementSibling;
                const scoreElement = scoreRow?.querySelector('.score');
                if (titleElement) {
                    extractedStories.push({
                        title: titleElement.textContent?.trim() || '',
                        url: titleElement.href,
                        score: scoreElement?.textContent?.trim() || '0',
                        source_site: 'news.ycombinator.com',
                        source_page: 'front page'
                    });
                }
            }
            return extractedStories;
        }, count);
        return stories;
    }
    async saveStoriesToDatabase(stories, sourceSite) {
        for (const story of stories) {
            try {
                await this.database.saveLink({
                    title: story.title,
                    url: story.url,
                    sourceSite: story.source_site,
                    sourcePage: story.source_page,
                    tags: await this.generateSuggestedTags(story.title, story.source_site)
                });
            }
            catch (error) {
                console.error(`Failed to save story: ${story.title}`, error.message);
            }
        }
    }
    async generateSuggestedTags(title, sourceSite = '') {
        // Simplified tag generation - can be enhanced with LLM later
        const tags = [];
        if (sourceSite.includes('reddit'))
            tags.push('reddit');
        if (sourceSite.includes('hackernews') || sourceSite.includes('ycombinator'))
            tags.push('hackernews');
        const titleLower = title.toLowerCase();
        if (titleLower.includes('programming') || titleLower.includes('code'))
            tags.push('programming');
        if (titleLower.includes('tech') || titleLower.includes('technology'))
            tags.push('technology');
        if (titleLower.includes('ai') || titleLower.includes('artificial intelligence'))
            tags.push('ai');
        return tags;
    }
    formatResults(allStories, format, results) {
        if (format === 'json') {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({ stories: allStories, results }, null, 2)
                    }]
            };
        }
        let output = `# Top Stories (${allStories.length} found)\n\n`;
        allStories.forEach((story, index) => {
            output += `## ${index + 1}. ${story.title}\n`;
            output += `**Score:** ${story.score} | **Source:** ${story.source_site}\n`;
            output += `**Link:** ${story.url}\n\n`;
        });
        if (results.failed.length > 0) {
            output += `\n## Failed Extractions\n`;
            results.failed.forEach(failure => {
                output += `- ${failure.site}: ${failure.error}\n`;
            });
        }
        return {
            content: [{
                    type: 'text',
                    text: output
                }]
        };
    }
}
//# sourceMappingURL=reddit-extractor.js.map