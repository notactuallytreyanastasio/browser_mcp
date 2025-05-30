import type { Database, MCPResult, QueryLinksArgs, CurateLinkArgs } from '../types/index.js';
export declare class LinkManager {
    private database;
    private _server;
    constructor(database: Database, _server: any);
    queryLinks(args: QueryLinksArgs): Promise<MCPResult>;
    curateLink(args: CurateLinkArgs): Promise<MCPResult>;
    getBagOfLinks(count?: number, minDaysOld?: number, maxDaysOld?: number): Promise<MCPResult>;
    private ensureSourceDiversity;
    private generateBagOfLinksHtml;
    generateTagCloud(maxTags?: number, linksPerTag?: number): Promise<MCPResult>;
    private generateTagCloudHtml;
}
//# sourceMappingURL=link-manager.d.ts.map