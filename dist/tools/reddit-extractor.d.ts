import type { Browser, Page } from 'playwright';
import type { Database, MCPResult } from '../types/index.js';
export declare class RedditExtractor {
    private database;
    browser: Browser | null;
    page: Page | null;
    constructor(browser: Browser | null, database: Database);
    getTopStories(count?: number): Promise<MCPResult>;
    getTopStoriesMulti(sites: string[], count?: number, format?: 'markdown' | 'json' | 'plain', saveLinks?: boolean): Promise<MCPResult>;
    private extractFromReddit;
    private extractFromHackerNews;
    private saveStoriesToDatabase;
    private generateSuggestedTags;
    private formatResults;
}
//# sourceMappingURL=reddit-extractor.d.ts.map