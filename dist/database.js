import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DatabaseError } from './types/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class Database {
    db = null;
    async init(customPath = null) {
        return new Promise((resolve, reject) => {
            const dbPath = customPath || join(__dirname, '..', 'browser_patterns.db');
            console.error(`Initializing database at: ${dbPath}`);
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error('Database connection error:', err);
                    reject(new DatabaseError('Failed to connect to database', err));
                }
                else {
                    console.error('Database connected successfully');
                    this.createTables().then(() => {
                        console.error('Database tables created/verified');
                        resolve();
                    }).catch(reject);
                }
            });
        });
    }
    async createTables() {
        return new Promise(async (resolve, reject) => {
            // First run migrations
            try {
                await this.runMigrations();
            }
            catch (migrationError) {
                console.error('Migration failed:', migrationError);
                // Continue with table creation even if migrations fail
            }
            const sql = `
        CREATE TABLE IF NOT EXISTS sites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT UNIQUE,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          site_id INTEGER,
          pattern_name TEXT,
          description TEXT,
          selectors TEXT, -- JSON array of selectors
          sample_data TEXT, -- JSON sample of extracted data
          success_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (site_id) REFERENCES sites (id)
        );

        CREATE TABLE IF NOT EXISTS interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          site_id INTEGER,
          url TEXT,
          element_selector TEXT,
          element_text TEXT,
          element_type TEXT, -- link, button, text, etc.
          x_position INTEGER,
          y_position INTEGER,
          action TEXT, -- click, hover, extract
          result TEXT, -- what happened after the action
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (site_id) REFERENCES sites (id)
        );

        CREATE TABLE IF NOT EXISTS links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          source_site TEXT, -- reddit.com, news.ycombinator.com, etc.
          source_page TEXT, -- /r/technology, front page, etc.
          description TEXT,
          tags TEXT, -- JSON array of tags
          is_curated BOOLEAN DEFAULT 0, -- 0 = auto-saved, 1 = manually curated
          is_public BOOLEAN DEFAULT 0, -- 0 = private, 1 = public for sharing
          score INTEGER DEFAULT 0, -- manual rating 1-5
          extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          curated_at DATETIME,
          notes TEXT, -- personal notes about the link
          metadata TEXT, -- JSONB metadata for analytics (comments, authors, categories, etc.)
          UNIQUE(url) -- prevent duplicate URLs
        );

        CREATE TABLE IF NOT EXISTS archives (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          link_id INTEGER,
          url TEXT NOT NULL,
          title TEXT,
          archive_path TEXT, -- local file path to archive
          archive_format TEXT, -- mhtml, directory, warc, pdf
          archive_size INTEGER, -- size in bytes
          archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          content_type TEXT, -- webpage, article, email
          screenshot_path TEXT, -- path to screenshot
          archive_metadata TEXT, -- JSON: resources, timing, etc.
          FOREIGN KEY (link_id) REFERENCES links (id)
        );

        CREATE TABLE IF NOT EXISTS archive_resources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          archive_id INTEGER,
          resource_type TEXT, -- css, js, image, font, other
          original_url TEXT,
          local_path TEXT,
          file_size INTEGER,
          FOREIGN KEY (archive_id) REFERENCES archives (id)
        );
      `;
            this.db.exec(sql, (err) => {
                if (err) {
                    reject(new DatabaseError('Failed to create tables', err));
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getSiteId(domain) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT id FROM sites WHERE domain = ?', [domain], (err, row) => {
                if (err) {
                    reject(new DatabaseError('Failed to get site ID', err));
                }
                else if (row) {
                    resolve(row.id);
                }
                else {
                    // Create new site
                    this.db.run('INSERT INTO sites (domain, name) VALUES (?, ?)', [domain, domain], function (err) {
                        if (err) {
                            reject(new DatabaseError('Failed to create site', err));
                        }
                        else {
                            resolve(this.lastID);
                        }
                    });
                }
            });
        });
    }
    async saveInteraction(domain, interaction) {
        const siteId = await this.getSiteId(domain);
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO interactions 
         (site_id, url, element_selector, element_text, element_type, x_position, y_position, action, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                siteId,
                interaction.url,
                interaction.selector,
                interaction.text,
                interaction.type,
                interaction.x,
                interaction.y,
                interaction.action,
                interaction.result
            ], function (err) {
                if (err) {
                    reject(new DatabaseError('Failed to save interaction', err));
                }
                else {
                    resolve(this.lastID);
                }
            });
        });
    }
    async savePattern(domain, pattern) {
        console.error(`Saving pattern "${pattern.name}" for domain "${domain}"`);
        const siteId = await this.getSiteId(domain);
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO patterns 
         (site_id, pattern_name, description, selectors, sample_data)
         VALUES (?, ?, ?, ?, ?)`, [
                siteId,
                pattern.name,
                pattern.description,
                JSON.stringify(pattern.selectors),
                JSON.stringify(pattern.sampleData)
            ], function (err) {
                if (err) {
                    console.error('Error saving pattern:', err);
                    reject(new DatabaseError('Failed to save pattern', err));
                }
                else {
                    console.error(`Pattern saved with ID: ${this.lastID}`);
                    resolve(this.lastID);
                }
            });
        });
    }
    async getPatterns(domain) {
        console.error(`Getting patterns for domain: ${domain}`);
        const siteId = await this.getSiteId(domain);
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM patterns WHERE site_id = ? ORDER BY success_count DESC, updated_at DESC', [siteId], (err, rows) => {
                if (err) {
                    console.error('Error getting patterns:', err);
                    reject(new DatabaseError('Failed to get patterns', err));
                }
                else {
                    console.error(`Found ${rows.length} patterns for ${domain}`);
                    const patterns = rows.map(row => ({
                        id: row.id,
                        name: row.pattern_name || '',
                        description: row.description || '',
                        selectors: JSON.parse(row.selectors),
                        sampleData: JSON.parse(row.sample_data || '{}'),
                        successCount: row.success_count
                    }));
                    resolve(patterns);
                }
            });
        });
    }
    async getInteractions(domain, limit = 50) {
        const siteId = await this.getSiteId(domain);
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM interactions WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?', [siteId, limit], (err, rows) => {
                if (err) {
                    reject(new DatabaseError('Failed to get interactions', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async incrementPatternSuccess(patternId) {
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE patterns SET success_count = success_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [patternId], function (err) {
                if (err) {
                    reject(new DatabaseError('Failed to increment pattern success', err));
                }
                else {
                    resolve();
                }
            });
        });
    }
    async saveLink(linkData) {
        const { title, url, sourceSite, sourcePage, description = null, tags = [], isCurated = false, isPublic = false, score = 0, notes = null, metadata = null } = linkData;
        if (!title || !url) {
            throw new DatabaseError('Title and URL are required');
        }
        const now = new Date().toISOString();
        return new Promise((resolve, reject) => {
            // First check if the URL already exists
            this.db.get('SELECT id, saved_at FROM links WHERE url = ?', [url], (err, existingLink) => {
                if (err) {
                    reject(new DatabaseError('Failed to check existing link', err));
                    return;
                }
                if (existingLink) {
                    // Update existing link but preserve original saved_at
                    this.db.run(`UPDATE links SET 
               title = ?, source_site = ?, source_page = ?, description = ?, 
               tags = ?, is_curated = ?, is_public = ?, score = ?, notes = ?, curated_at = ?, metadata = ?
               WHERE url = ?`, [
                        title,
                        sourceSite,
                        sourcePage,
                        description,
                        JSON.stringify(tags),
                        isCurated ? 1 : 0,
                        isPublic ? 1 : 0,
                        score,
                        notes,
                        isCurated ? now : null,
                        metadata ? JSON.stringify(metadata) : null,
                        url
                    ], function (err) {
                        if (err) {
                            console.error('Error updating link:', err);
                            reject(new DatabaseError('Failed to update link', err));
                        }
                        else {
                            console.error(`Link updated with ID: ${existingLink.id} (saved_at preserved: ${existingLink.saved_at})`);
                            resolve(existingLink.id);
                        }
                    });
                }
                else {
                    // Insert new link with saved_at
                    this.db.run(`INSERT INTO links 
               (title, url, source_site, source_page, description, tags, is_curated, is_public, score, notes, curated_at, saved_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        title,
                        url,
                        sourceSite,
                        sourcePage,
                        description,
                        JSON.stringify(tags),
                        isCurated ? 1 : 0,
                        isPublic ? 1 : 0,
                        score,
                        notes,
                        isCurated ? now : null,
                        now, // Set saved_at only for new records
                        metadata ? JSON.stringify(metadata) : null
                    ], function (err) {
                        if (err) {
                            console.error('Error saving new link:', err);
                            reject(new DatabaseError('Failed to save new link', err));
                        }
                        else {
                            console.error(`New link saved with ID: ${this.lastID} (saved_at: ${now})`);
                            resolve(this.lastID);
                        }
                    });
                }
            });
        });
    }
    async getLinks(filters = {}) {
        const { limit = 50, offset = 0, isCurated = null, isPublic = null, sourceSite = null, tags = null, minScore = null, searchText = null } = filters;
        let sql = 'SELECT * FROM links WHERE 1=1';
        const params = [];
        if (isCurated !== null) {
            sql += ' AND is_curated = ?';
            params.push(isCurated ? 1 : 0);
        }
        if (isPublic !== null) {
            sql += ' AND is_public = ?';
            params.push(isPublic ? 1 : 0);
        }
        if (sourceSite) {
            sql += ' AND source_site = ?';
            params.push(sourceSite);
        }
        if (minScore !== null) {
            sql += ' AND score >= ?';
            params.push(minScore);
        }
        if (searchText) {
            sql += ' AND (title LIKE ? OR description LIKE ? OR notes LIKE ?)';
            const searchPattern = `%${searchText}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }
        if (tags && tags.length > 0) {
            // Simple tag search - this could be improved with a proper tag table
            for (const tag of tags) {
                sql += ' AND tags LIKE ?';
                params.push(`%"${tag}"%`);
            }
        }
        sql += ' ORDER BY extracted_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error getting links:', err);
                    reject(new DatabaseError('Failed to get links', err));
                }
                else {
                    const links = rows.map(row => ({
                        id: row.id,
                        title: row.title,
                        url: row.url,
                        sourceSite: row.source_site || undefined,
                        sourcePage: row.source_page || undefined,
                        description: row.description || undefined,
                        tags: JSON.parse(row.tags || '[]'),
                        isCurated: !!row.is_curated,
                        isPublic: !!row.is_public,
                        score: row.score,
                        extractedAt: new Date(row.extracted_at),
                        curatedAt: row.curated_at ? new Date(row.curated_at) : null,
                        notes: row.notes || undefined,
                        savedAt: row.saved_at ? new Date(row.saved_at) : null,
                        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
                    }));
                    resolve(links);
                }
            });
        });
    }
    async updateLink(id, updates) {
        const allowedFields = [
            'title', 'description', 'tags', 'is_curated', 'is_public',
            'score', 'notes'
        ];
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setParts.push(`${key} = ?`);
                if (key === 'tags') {
                    params.push(JSON.stringify(value));
                }
                else if (key === 'is_curated' || key === 'is_public') {
                    params.push(value ? 1 : 0);
                }
                else {
                    params.push(value);
                }
            }
        }
        if (updates.isCurated) {
            setParts.push('curated_at = ?');
            params.push(new Date().toISOString());
        }
        if (setParts.length === 0) {
            throw new DatabaseError('No valid fields to update');
        }
        params.push(id);
        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE links SET ${setParts.join(', ')} WHERE id = ?`, params, function (err) {
                if (err) {
                    reject(new DatabaseError('Failed to update link', err));
                }
                else {
                    resolve(this.changes);
                }
            });
        });
    }
    async deleteLink(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM links WHERE id = ?', [id], function (err) {
                if (err) {
                    reject(new DatabaseError('Failed to delete link', err));
                }
                else {
                    resolve(this.changes);
                }
            });
        });
    }
    async executeSql(query, params = []) {
        return new Promise((resolve, reject) => {
            // Security check - only allow SELECT statements for safety
            const trimmedQuery = query.trim().toUpperCase();
            if (!trimmedQuery.startsWith('SELECT')) {
                reject(new DatabaseError('Only SELECT queries are allowed for security reasons'));
                return;
            }
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(new DatabaseError('SQL execution failed', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async saveArchive(archiveData) {
        const { linkId = null, url, title, archivePath, archiveFormat, archiveSize, contentType = 'webpage', screenshotPath = null, archiveMetadata = null, resources = [] } = archiveData;
        return new Promise((resolve, reject) => {
            // Insert archive record
            this.db.run(`INSERT INTO archives 
         (link_id, url, title, archive_path, archive_format, archive_size, content_type, screenshot_path, archive_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                linkId,
                url,
                title,
                archivePath,
                archiveFormat,
                archiveSize,
                contentType,
                screenshotPath,
                archiveMetadata ? JSON.stringify(archiveMetadata) : null
            ], function (err) {
                if (err) {
                    reject(new DatabaseError('Failed to save archive', err));
                    return;
                }
                const archiveId = this.lastID;
                console.error(`Archive saved with ID: ${archiveId}`);
                // Save resources if provided
                if (resources.length > 0) {
                    const resourcePromises = resources.map(resource => {
                        return new Promise((resolveResource, rejectResource) => {
                            this.db.run(`INSERT INTO archive_resources 
                   (archive_id, resource_type, original_url, local_path, file_size)
                   VALUES (?, ?, ?, ?, ?)`, [
                                archiveId,
                                resource.type,
                                resource.originalUrl,
                                resource.localPath,
                                resource.fileSize
                            ], (resourceErr) => {
                                if (resourceErr) {
                                    rejectResource(new DatabaseError('Failed to save archive resource', resourceErr));
                                }
                                else {
                                    resolveResource();
                                }
                            });
                        });
                    });
                    Promise.all(resourcePromises)
                        .then(() => resolve(archiveId))
                        .catch(reject);
                }
                else {
                    resolve(archiveId);
                }
            });
        });
    }
    async getArchives(filters = {}) {
        const { limit = 50, contentType = null, hasScreenshot = null } = filters;
        let query = `
      SELECT a.*, l.title as link_title, l.tags 
      FROM archives a 
      LEFT JOIN links l ON a.link_id = l.id 
      WHERE 1=1
    `;
        const params = [];
        if (contentType) {
            query += ` AND a.content_type = ?`;
            params.push(contentType);
        }
        if (hasScreenshot !== null) {
            if (hasScreenshot) {
                query += ` AND a.screenshot_path IS NOT NULL`;
            }
            else {
                query += ` AND a.screenshot_path IS NULL`;
            }
        }
        query += ` ORDER BY a.archived_at DESC LIMIT ?`;
        params.push(limit);
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(new DatabaseError('Failed to get archives', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getArchiveById(archiveId) {
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT a.*, l.title as link_title, l.url as link_url, l.tags 
         FROM archives a 
         LEFT JOIN links l ON a.link_id = l.id 
         WHERE a.id = ?`, [archiveId], (err, row) => {
                if (err) {
                    reject(new DatabaseError('Failed to get archive by ID', err));
                }
                else {
                    resolve(row || null);
                }
            });
        });
    }
    async getArchiveResources(archiveId) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM archive_resources WHERE archive_id = ? ORDER BY resource_type, original_url`, [archiveId], (err, rows) => {
                if (err) {
                    reject(new DatabaseError('Failed to get archive resources', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getSchema() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, rows) => {
                if (err) {
                    reject(new DatabaseError('Failed to get schema', err));
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async deletePattern(domain, patternName) {
        return new Promise((resolve, reject) => {
            // First, get the site_id for the domain
            this.db.get("SELECT id FROM sites WHERE domain = ?", [domain], (err, site) => {
                if (err) {
                    reject(new DatabaseError('Failed to get site for pattern deletion', err));
                    return;
                }
                if (!site) {
                    reject(new DatabaseError(`No site found for domain: ${domain}`));
                    return;
                }
                // Delete the pattern
                this.db.run("DELETE FROM patterns WHERE site_id = ? AND pattern_name = ?", [site.id, patternName], function (err) {
                    if (err) {
                        reject(new DatabaseError('Failed to delete pattern', err));
                    }
                    else {
                        if (this.changes === 0) {
                            reject(new DatabaseError(`Pattern "${patternName}" not found for domain "${domain}"`));
                        }
                        else {
                            console.error(`Deleted pattern "${patternName}" for domain "${domain}"`);
                            resolve(this.changes);
                        }
                    }
                });
            });
        });
    }
    async runMigrations() {
        return new Promise((resolve, reject) => {
            // Check existing schema
            Promise.all([
                this.getTableInfo('links'),
                this.getTableInfo('archives'),
                this.getTableInfo('archive_resources')
            ]).then(([linksColumns, archivesTable, resourcesTable]) => {
                const migrations = [];
                // Check links table columns
                const hasMetadata = linksColumns.some(col => col.name === 'metadata');
                const hasSavedAt = linksColumns.some(col => col.name === 'saved_at');
                if (!hasMetadata) {
                    migrations.push("ALTER TABLE links ADD COLUMN metadata TEXT");
                }
                if (!hasSavedAt) {
                    migrations.push("ALTER TABLE links ADD COLUMN saved_at DATETIME DEFAULT CURRENT_TIMESTAMP");
                }
                // Check if archive tables exist
                if (!archivesTable || archivesTable.length === 0) {
                    migrations.push(`
            CREATE TABLE archives (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              link_id INTEGER,
              url TEXT NOT NULL,
              title TEXT,
              archive_path TEXT,
              archive_format TEXT,
              archive_size INTEGER,
              archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              content_type TEXT,
              screenshot_path TEXT,
              archive_metadata TEXT,
              FOREIGN KEY (link_id) REFERENCES links (id)
            )
          `);
                }
                if (!resourcesTable || resourcesTable.length === 0) {
                    migrations.push(`
            CREATE TABLE archive_resources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              archive_id INTEGER,
              resource_type TEXT,
              original_url TEXT,
              local_path TEXT,
              file_size INTEGER,
              FOREIGN KEY (archive_id) REFERENCES archives (id)
            )
          `);
                }
                if (migrations.length === 0) {
                    resolve();
                    return;
                }
                // Run migrations sequentially
                this.runMigrationsSequentially(migrations, !hasSavedAt)
                    .then(resolve)
                    .catch(reject);
            }).catch(reject);
        });
    }
    getTableInfo(tableName) {
        return new Promise((resolve) => {
            this.db.all(`PRAGMA table_info(${tableName})`, [], (err, columns) => {
                if (err) {
                    // Table might not exist, which is fine
                    resolve([]);
                }
                else {
                    resolve(columns);
                }
            });
        });
    }
    runMigrationsSequentially(migrations, needsBackfill) {
        return new Promise((resolve, reject) => {
            let completed = 0;
            migrations.forEach((migration, index) => {
                this.db.run(migration, (err) => {
                    if (err) {
                        console.error(`Migration ${index + 1} failed:`, err.message);
                    }
                    else {
                        console.error(`Migration ${index + 1} completed`);
                    }
                    completed++;
                    if (completed === migrations.length) {
                        // If we added saved_at, backfill from extracted_at
                        if (needsBackfill) {
                            this.db.run("UPDATE links SET saved_at = extracted_at WHERE saved_at IS NULL", (backfillErr) => {
                                if (backfillErr) {
                                    console.error('Backfill failed:', backfillErr.message);
                                }
                                else {
                                    console.error('Backfilled saved_at from extracted_at');
                                }
                                resolve();
                            });
                        }
                        else {
                            resolve();
                        }
                    }
                });
            });
        });
    }
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}
//# sourceMappingURL=database.js.map