import type { Database, MCPResult } from '../types/index.js';
/**
 * Fallback Reddit extractor that uses direct Playwright when MCP fails
 * This provides a reliable backup for your personal Reddit browsing patterns
 */
export declare class RedditExtractorFallback {
    private database;
    private browser;
    private page;
    constructor(database: Database);
    connect(): Promise<void>;
    getRedditStories(count?: number, subreddit?: string): Promise<MCPResult>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=reddit-extractor-fallback.d.ts.map