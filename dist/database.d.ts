import sqlite3 from 'sqlite3';
import type { DatabaseConnection, ArchiveRecord, ArchiveResourceRecord, InteractionRecord, Link, LinkFilters, ArchiveFilters, ArchiveData, Pattern, Interaction } from './types/index.js';
export declare class Database implements DatabaseConnection {
    db: sqlite3.Database | null;
    init(customPath?: string | null): Promise<void>;
    createTables(): Promise<void>;
    getSiteId(domain: string): Promise<number>;
    saveInteraction(domain: string, interaction: Interaction): Promise<number>;
    savePattern(domain: string, pattern: Pattern): Promise<number>;
    getPatterns(domain: string): Promise<Pattern[]>;
    getInteractions(domain: string, limit?: number): Promise<InteractionRecord[]>;
    incrementPatternSuccess(patternId: number): Promise<void>;
    saveLink(linkData: Partial<Link>): Promise<number>;
    getLinks(filters?: LinkFilters): Promise<Link[]>;
    updateLink(id: number, updates: Partial<Link>): Promise<number>;
    deleteLink(id: number): Promise<number>;
    executeSql(query: string, params?: any[]): Promise<any[]>;
    saveArchive(archiveData: ArchiveData): Promise<number>;
    getArchives(filters?: ArchiveFilters): Promise<ArchiveRecord[]>;
    getArchiveById(archiveId: number): Promise<ArchiveRecord | null>;
    getArchiveResources(archiveId: number): Promise<ArchiveResourceRecord[]>;
    getSchema(): Promise<Array<{
        name: string;
        sql: string;
    }>>;
    deletePattern(domain: string, patternName: string): Promise<number>;
    private runMigrations;
    private getTableInfo;
    private runMigrationsSequentially;
    close(): void;
}
//# sourceMappingURL=database.d.ts.map