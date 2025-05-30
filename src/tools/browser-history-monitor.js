import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';

/**
 * Browser History Monitor - Personal Link Garden
 * 
 * Monitors your natural browsing patterns by reading browser history databases
 * Distinguishes between organic browsing vs intentional link discovery
 */
export class BrowserHistoryMonitor {
  constructor(database) {
    this.database = database;
    this.browserPaths = this.getBrowserPaths();
    this.lastSyncTime = {};
  }

  getBrowserPaths() {
    const homeDir = os.homedir();
    
    return {
      chrome: {
        history: path.join(homeDir, 'Library/Application Support/Google/Chrome/Default/History'),
        name: 'chrome'
      },
      chromeBeta: {
        history: path.join(homeDir, 'Library/Application Support/Google/Chrome Beta/Default/History'),
        name: 'chrome-beta'
      },
      chromeCanary: {
        history: path.join(homeDir, 'Library/Application Support/Google/Chrome Canary/Default/History'),
        name: 'chrome-canary'
      },
      safari: {
        history: path.join(homeDir, 'Library/Safari/History.db'),
        name: 'safari'
      },
      arc: {
        history: path.join(homeDir, 'Library/Application Support/Arc/User Data/Default/History'),
        name: 'arc'
      },
      brave: {
        history: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser/Default/History'),
        name: 'brave'
      }
    };
  }

  async checkBrowserAvailability() {
    const available = {};
    
    for (const [browser, config] of Object.entries(this.browserPaths)) {
      try {
        await fs.promises.access(config.history, fs.constants.R_OK);
        available[browser] = config;
        console.error(`✅ ${browser} history available`);
      } catch (error) {
        console.error(`❌ ${browser} history not accessible: ${error.message}`);
      }
    }
    
    return available;
  }

  async syncBrowserHistory(browserName = 'chrome', options = {}) {
    const {
      since = null,
      limit = 1000,
      dryRun = false
    } = options;

    const browserConfig = this.browserPaths[browserName];
    if (!browserConfig) {
      throw new Error(`Unknown browser: ${browserName}`);
    }

    try {
      // Check if file exists and is readable
      await fs.promises.access(browserConfig.history, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Cannot access ${browserName} history: ${error.message}. Make sure ${browserName} is closed and you have Full Disk Access permission.`);
    }

    console.error(`🔄 Syncing ${browserName} history...`);
    
    return new Promise((resolve, reject) => {
      // Open browser's history database
      const browserDb = new sqlite3.Database(browserConfig.history, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`Failed to open ${browserName} history database: ${err.message}`));
          return;
        }

        // Build query based on browser type
        let query, params;
        
        if (browserName === 'safari') {
          query = `
            SELECT 
              hi.url,
              hv.title,
              datetime(hv.visit_time + 978307200, 'unixepoch') as visit_time,
              hv.visit_count,
              hi.visit_count as total_visits
            FROM history_items hi
            JOIN history_visits hv ON hi.id = hv.history_item
            WHERE 1=1
          `;
          params = [];
          
          if (since) {
            query += ` AND datetime(hv.visit_time + 978307200, 'unixepoch') >= ?`;
            params.push(since);
          }
          
          query += ` ORDER BY hv.visit_time DESC LIMIT ?`;
          params.push(limit);
          
        } else {
          // Chrome-based browsers (Chrome, Arc, Brave, etc.)
          query = `
            SELECT 
              urls.url,
              urls.title,
              datetime(visits.visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as visit_time,
              visits.visit_duration,
              visits.transition,
              urls.visit_count,
              visits.from_visit,
              visits.id as visit_id
            FROM visits 
            JOIN urls ON visits.url = urls.id
            WHERE 1=1
          `;
          params = [];
          
          if (since) {
            query += ` AND datetime(visits.visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') >= ?`;
            params.push(since);
          }
          
          query += ` ORDER BY visits.visit_time DESC LIMIT ?`;
          params.push(limit);
        }

        browserDb.all(query, params, async (err, rows) => {
          browserDb.close();
          
          if (err) {
            reject(new Error(`Query failed: ${err.message}`));
            return;
          }

          if (dryRun) {
            resolve({
              browser: browserName,
              found: rows.length,
              sample: rows.slice(0, 5),
              dryRun: true
            });
            return;
          }

          // Process and save the history
          try {
            const processedHistory = rows.map(row => this.processHistoryEntry(row, browserName));
            const savedCount = await this.database.bulkSaveBrowsingHistory(processedHistory);
            
            resolve({
              browser: browserName,
              found: rows.length,
              saved: savedCount,
              lastSynced: new Date().toISOString()
            });
            
          } catch (error) {
            reject(new Error(`Failed to save history: ${error.message}`));
          }
        });
      });
    });
  }

  processHistoryEntry(row, browserName) {
    // Determine if this is organic browsing vs intentional
    const isOrganic = this.classifyBrowsingIntent(row, browserName);
    
    return {
      url: row.url,
      title: row.title,
      visit_time: row.visit_time,
      browser: browserName,
      visit_count: row.visit_count || row.total_visits || 1,
      transition_type: this.mapTransitionType(row.transition),
      visit_duration: row.visit_duration || null,
      is_organic: isOrganic,
      metadata: {
        original_visit_id: row.visit_id,
        from_visit: row.from_visit,
        raw_transition: row.transition
      }
    };
  }

  classifyBrowsingIntent(row, browserName) {
    // Heuristics to determine if this was organic browsing vs intentional
    const url = row.url;
    const transition = row.transition;
    const duration = row.visit_duration;
    
    // Definitely NOT organic (intentional/automated)
    if (url.includes('claude.ai') || 
        url.includes('anthropic.com') ||
        url.includes('/mcp-') ||
        url.includes('localhost:') ||
        url.includes('127.0.0.1')) {
      return false;
    }
    
    // Chrome transition types that indicate intentional browsing
    if (browserName !== 'safari' && transition) {
      const intentionalTransitions = [
        0, // Typed URL (LINK)
        2, // Auto bookmark
        3, // Auto subframe  
        6, // Manual subframe
        8  // Reload
      ];
      
      if (intentionalTransitions.includes(transition)) {
        return false;
      }
    }
    
    // Very short visits are often accidental or automated
    if (duration && duration < 2000) { // Less than 2 seconds
      return false;
    }
    
    // Default to organic browsing
    return true;
  }

  mapTransitionType(transition) {
    if (!transition) return null;
    
    const transitionMap = {
      0: 'link',
      1: 'typed', 
      2: 'auto_bookmark',
      3: 'auto_subframe',
      4: 'manual_subframe',
      5: 'generated',
      6: 'start_page',
      7: 'form_submit',
      8: 'reload',
      9: 'keyword',
      10: 'keyword_generated'
    };
    
    return transitionMap[transition] || `unknown_${transition}`;
  }

  async analyzeBrowsingPatterns(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const history = await this.database.getBrowsingHistory({
      since,
      organic_only: true,
      limit: 1000
    });

    const patterns = {
      topDomains: {},
      browsingTimes: {},
      referrerPatterns: {},
      totalVisits: history.length
    };

    history.forEach(entry => {
      try {
        const url = new URL(entry.url);
        const domain = url.hostname;
        const hour = new Date(entry.visit_time).getHours();
        
        // Count domains
        patterns.topDomains[domain] = (patterns.topDomains[domain] || 0) + 1;
        
        // Count hourly activity
        patterns.browsingTimes[hour] = (patterns.browsingTimes[hour] || 0) + 1;
        
        // Analyze referrer patterns
        if (entry.referrer_url) {
          try {
            const referrerDomain = new URL(entry.referrer_url).hostname;
            const pattern = `${referrerDomain} → ${domain}`;
            patterns.referrerPatterns[pattern] = (patterns.referrerPatterns[pattern] || 0) + 1;
          } catch (e) {
            // Invalid referrer URL, skip
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return {
      period: `${days} days`,
      ...patterns,
      topDomains: Object.entries(patterns.topDomains)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20),
      mostActiveHours: Object.entries(patterns.browsingTimes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      topReferrerPaths: Object.entries(patterns.referrerPatterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    };
  }

  async getRecentBrowsingActivity(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    return await this.database.getBrowsingHistory({
      since,
      limit: 50,
      organic_only: true
    });
  }

  async findInterestingUnvisitedLinks() {
    // Find URLs from browsing history that might be worth revisiting
    // but aren't in our curated links collection
    
    const sql = `
      SELECT DISTINCT bh.url, bh.title, bh.visit_time, bh.visit_count, bh.browser
      FROM browsing_history bh
      LEFT JOIN links l ON bh.url = l.url
      WHERE l.url IS NULL 
        AND bh.is_organic = 1
        AND bh.visit_time >= datetime('now', '-30 days')
        AND bh.url NOT LIKE '%google.com%'
        AND bh.url NOT LIKE '%facebook.com%'
        AND bh.url NOT LIKE '%twitter.com%'
        AND bh.url NOT LIKE '%youtube.com/watch%'
        AND length(bh.title) > 10
      ORDER BY bh.visit_count DESC, bh.visit_time DESC
      LIMIT 20
    `;

    return new Promise((resolve, reject) => {
      this.database.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}