import type { Database, MCPResult } from '../types/index.js';
export declare class ArchiveManager {
    private database;
    private archivesDir;
    constructor(database: Database);
    archiveUrl(url: string, linkId?: number | null, format?: 'directory' | 'mhtml', includeScreenshot?: boolean): Promise<MCPResult>;
    listArchives(limit?: number, contentType?: string | null, hasScreenshot?: boolean | null): Promise<MCPResult>;
    browseArchive(archiveId: number, showResources?: boolean): Promise<MCPResult>;
    private getResourcePath;
    private guessContentType;
    private rewriteHtmlUrls;
    private calculateDirectorySize;
}
//# sourceMappingURL=archive-manager.d.ts.map