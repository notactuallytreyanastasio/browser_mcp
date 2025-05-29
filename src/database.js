import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Database {
  constructor() {
    this.db = null;
  }

  async init(customPath = null) {
    return new Promise((resolve, reject) => {
      const dbPath = customPath || join(__dirname, '..', 'browser_patterns.db');
      console.error(`Initializing database at: ${dbPath}`);
      
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          reject(err);
        } else {
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
    return new Promise((resolve, reject) => {
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
          UNIQUE(url) -- prevent duplicate URLs
        );
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getSiteId(domain) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM sites WHERE domain = ?',
        [domain],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve(row.id);
          } else {
            // Create new site
            this.db.run(
              'INSERT INTO sites (domain, name) VALUES (?, ?)',
              [domain, domain],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve(this.lastID);
                }
              }
            );
          }
        }
      );
    });
  }

  async saveInteraction(domain, interaction) {
    const siteId = await this.getSiteId(domain);
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO interactions 
         (site_id, url, element_selector, element_text, element_type, x_position, y_position, action, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          siteId,
          interaction.url,
          interaction.selector,
          interaction.text,
          interaction.type,
          interaction.x,
          interaction.y,
          interaction.action,
          interaction.result
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async savePattern(domain, pattern) {
    console.error(`Saving pattern "${pattern.name}" for domain "${domain}"`);
    const siteId = await this.getSiteId(domain);
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO patterns 
         (site_id, pattern_name, description, selectors, sample_data)
         VALUES (?, ?, ?, ?, ?)`,
        [
          siteId,
          pattern.name,
          pattern.description,
          JSON.stringify(pattern.selectors),
          JSON.stringify(pattern.sampleData)
        ],
        function(err) {
          if (err) {
            console.error('Error saving pattern:', err);
            reject(err);
          } else {
            console.error(`Pattern saved with ID: ${this.lastID}`);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getPatterns(domain) {
    console.error(`Getting patterns for domain: ${domain}`);
    const siteId = await this.getSiteId(domain);
    
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM patterns WHERE site_id = ? ORDER BY success_count DESC, updated_at DESC',
        [siteId],
        (err, rows) => {
          if (err) {
            console.error('Error getting patterns:', err);
            reject(err);
          } else {
            console.error(`Found ${rows.length} patterns for ${domain}`);
            const patterns = rows.map(row => ({
              ...row,
              selectors: JSON.parse(row.selectors),
              sampleData: JSON.parse(row.sample_data)
            }));
            resolve(patterns);
          }
        }
      );
    });
  }

  async getInteractions(domain, limit = 50) {
    const siteId = await this.getSiteId(domain);
    
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM interactions WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?',
        [siteId, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async incrementPatternSuccess(patternId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE patterns SET success_count = success_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [patternId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async saveLink(linkData) {
    const {
      title,
      url,
      sourceSite,
      sourcePage,
      description = null,
      tags = [],
      isCurated = false,
      isPublic = false,
      score = 0,
      notes = null
    } = linkData;

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO links 
         (title, url, source_site, source_page, description, tags, is_curated, is_public, score, notes, curated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          isCurated ? new Date().toISOString() : null
        ],
        function(err) {
          if (err) {
            console.error('Error saving link:', err);
            reject(err);
          } else {
            console.error(`Link saved with ID: ${this.lastID}`);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getLinks(filters = {}) {
    const {
      limit = 50,
      offset = 0,
      isCurated = null,
      isPublic = null,
      sourceSite = null,
      tags = null,
      minScore = null,
      searchText = null
    } = filters;

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
          reject(err);
        } else {
          const links = rows.map(row => ({
            ...row,
            tags: JSON.parse(row.tags || '[]'),
            is_curated: !!row.is_curated,
            is_public: !!row.is_public
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
        } else if (key === 'is_curated' || key === 'is_public') {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    }

    if (updates.is_curated) {
      setParts.push('curated_at = ?');
      params.push(new Date().toISOString());
    }

    if (setParts.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE links SET ${setParts.join(', ')} WHERE id = ?`,
        params,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  async deleteLink(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM links WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
        } else {
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
        reject(new Error('Only SELECT queries are allowed for security reasons'));
        return;
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getSchema() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name",
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}