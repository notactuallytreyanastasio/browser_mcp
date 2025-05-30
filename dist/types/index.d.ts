import type { Browser, Page } from 'playwright';
import type { Database as SQLiteDatabase } from 'sqlite3';
export interface LinkRecord {
    id: number;
    title: string;
    url: string;
    source_site: string | null;
    source_page: string | null;
    description: string | null;
    tags: string;
    is_curated: boolean;
    is_public: boolean;
    score: number;
    extracted_at: string;
    curated_at: string | null;
    notes: string | null;
    saved_at: string | null;
    metadata: string | null;
}
export interface ArchiveRecord {
    id: number;
    link_id: number | null;
    url: string;
    title: string | null;
    archive_path: string | null;
    archive_format: string | null;
    archive_size: number | null;
    archived_at: string;
    content_type: string | null;
    screenshot_path: string | null;
    archive_metadata: string | null;
    link_title?: string;
    link_url?: string;
    tags?: string;
}
export interface ArchiveResourceRecord {
    id: number;
    archive_id: number;
    resource_type: string | null;
    original_url: string | null;
    local_path: string | null;
    file_size: number | null;
}
export interface SiteRecord {
    id: number;
    domain: string;
    name: string | null;
    created_at: string;
}
export interface PatternRecord {
    id: number;
    site_id: number;
    pattern_name: string | null;
    description: string | null;
    selectors: string;
    sample_data: string | null;
    success_count: number;
    created_at: string;
    updated_at: string;
}
export interface InteractionRecord {
    id: number;
    site_id: number;
    url: string | null;
    element_selector: string | null;
    element_text: string | null;
    element_type: string | null;
    x_position: number | null;
    y_position: number | null;
    action: string | null;
    result: string | null;
    timestamp: string;
}
export interface Link {
    id?: number;
    title: string;
    url: string;
    sourceSite?: string | undefined;
    sourcePage?: string | undefined;
    description?: string | undefined;
    tags: string[];
    isCurated?: boolean;
    isPublic?: boolean;
    score?: number;
    extractedAt?: Date | undefined;
    curatedAt?: Date | null | undefined;
    notes?: string | undefined;
    savedAt?: Date | null | undefined;
    metadata?: Record<string, any> | undefined;
}
export interface StoryData {
    title: string;
    url: string;
    score?: string;
    comments?: string;
    subreddit?: string;
    source_site: string;
    source_page: string;
}
export interface ArchiveData {
    linkId?: number | null;
    url: string;
    title?: string;
    archivePath: string;
    archiveFormat: string;
    archiveSize: number;
    contentType?: string;
    screenshotPath?: string | null;
    archiveMetadata?: Record<string, any>;
    resources?: ArchiveResource[];
}
export interface ArchiveResource {
    type: string;
    originalUrl: string;
    localPath: string;
    fileSize: number;
}
export interface Pattern {
    id?: number;
    name: string;
    description: string;
    selectors: string[];
    sampleData: Record<string, any>;
    successCount?: number;
}
export interface Interaction {
    url: string;
    selector: string;
    text: string;
    type: string;
    x: number;
    y: number;
    action: string;
    result: string;
}
export interface LinkFilters {
    limit?: number;
    offset?: number;
    isCurated?: boolean | null;
    isPublic?: boolean | null;
    sourceSite?: string | null;
    tags?: string[] | null;
    minScore?: number | null;
    searchText?: string | null;
}
export interface ArchiveFilters {
    limit?: number;
    contentType?: string | null;
    hasScreenshot?: boolean | null;
}
export interface MCPContent {
    type: 'text';
    text: string;
}
export interface MCPResult {
    content: MCPContent[];
}
export interface QueryLinksArgs {
    limit?: number;
    is_curated?: boolean;
    is_public?: boolean;
    source_site?: string;
    search_text?: string;
    min_score?: number;
    tags?: string[];
}
export interface CurateLinkArgs {
    link_id: number;
    score?: number;
    tags?: string[];
    notes?: string;
    is_public?: boolean;
}
export interface BagOfLinksArgs {
    count?: number;
    min_days_old?: number;
    max_days_old?: number;
}
export interface TagCloudArgs {
    max_tags?: number;
    links_per_tag?: number;
}
export interface ArchiveUrlArgs {
    url: string;
    link_id?: number;
    format?: 'directory' | 'mhtml';
    include_screenshot?: boolean;
}
export interface ListArchivesArgs {
    limit?: number;
    content_type?: string;
    has_screenshot?: boolean;
}
export interface BrowseArchiveArgs {
    archive_id: number;
    show_resources?: boolean;
}
export interface GetTopStoriesMultiArgs {
    sites: string[];
    count?: number;
    format?: 'markdown' | 'json' | 'plain';
    save_links?: boolean;
}
export interface TagData {
    tag: string;
    frequency: number;
    link_ids: string;
}
export interface BrowserState {
    browser: Browser | null;
    page: Page | null;
    isLearning: boolean;
    currentPattern: string | null;
    clickedElements: any[];
}
export interface DatabaseConnection {
    db: SQLiteDatabase | null;
    init(customPath?: string | null): Promise<void>;
    close(): void;
}
export interface ExtractionResults {
    success: string[];
    failed: Array<{
        site: string;
        error: string;
    }>;
}
export interface ServerConfig {
    name: string;
    version: string;
}
export interface BrowserConfig {
    headless: boolean;
    slowMo?: number;
    args?: string[];
}
export interface Database {
    db: SQLiteDatabase | null;
    init(customPath?: string | null): Promise<void>;
    close(): void;
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
}
export declare class DatabaseError extends Error {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
export declare class BrowserError extends Error {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
export declare class ExtractionError extends Error {
    readonly site?: string | undefined;
    readonly originalError?: Error | undefined;
    constructor(message: string, site?: string | undefined, originalError?: Error | undefined);
}
//# sourceMappingURL=index.d.ts.map