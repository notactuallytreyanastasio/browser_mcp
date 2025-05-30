#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SQLQueryMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'sql-query-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.db = null;
    this.setupToolHandlers();
    this.initDatabase();
  }

  async initDatabase() {
    return new Promise((resolve, reject) => {
      const dbPath = join(__dirname, 'browser_patterns.db');
      console.error(`Connecting to database at: ${dbPath}`);
      
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          reject(err);
        } else {
          console.error('Database connected successfully');
          resolve();
        }
      });
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'ask_database',
          description: 'Ask natural language questions about your saved links and get intelligent SQL results',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'Natural language question about your saved links (e.g., "What are my highest rated AI articles from this week?")',
              },
              explain_sql: {
                type: 'boolean',
                description: 'Whether to show the generated SQL query (default: true)',
                default: true
              }
            },
            required: ['question'],
          },
        },
        {
          name: 'get_database_summary',
          description: 'Get a summary of your database contents and structure',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'execute_raw_sql',
          description: 'Execute a raw SQL query (SELECT only for safety)',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL SELECT query to execute',
              }
            },
            required: ['query'],
          },
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'ask_database':
            return await this.askDatabase(args.question, args.explain_sql !== false);
          
          case 'get_database_summary':
            return await this.getDatabaseSummary();
          
          case 'execute_raw_sql':
            return await this.executeRawSQL(args.query);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async askDatabase(question, explainSQL = true) {
    // Get database schema for context
    const schema = await this.getSchema();
    const stats = await this.getStats();
    
    // Generate SQL based on natural language
    const sqlQuery = this.generateSQLFromQuestion(question, schema, stats);
    
    let output = `# 🤖 Database Query Results\n\n`;
    output += `**Question:** ${question}\n\n`;
    
    if (explainSQL) {
      output += `**Generated SQL:**\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n\n`;
    }
    
    try {
      const results = await this.executeSql(sqlQuery);
      
      if (results.length === 0) {
        output += `📭 **No results found.**\n\nTry rephrasing your question or check if you have data for what you're asking about.`;
      } else {
        output += `📊 **Found ${results.length} result(s):**\n\n`;
        
        // Format as table
        const headers = Object.keys(results[0]);
        output += `| ${headers.join(' | ')} |\n`;
        output += `| ${headers.map(() => '---').join(' | ')} |\n`;
        
        results.forEach(row => {
          const values = headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            return String(value).length > 50 ? String(value).substring(0, 47) + '...' : String(value);
          });
          output += `| ${values.join(' | ')} |\n`;
        });
        
        // Add insights
        output += this.generateInsights(results, question);
      }
    } catch (error) {
      output += `❌ **Query Error:** ${error.message}\n\n`;
      output += `The generated SQL might need adjustment. Try rephrasing your question or use the execute_raw_sql tool with a custom query.`;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  generateSQLFromQuestion(question, schema, stats) {
    const q = question.toLowerCase();
    
    // Time-based queries using saved_at (immutable save time)
    if (q.includes('today') || q.includes('recent')) {
      return "SELECT title, url, source_site, saved_at FROM links WHERE DATE(saved_at) = DATE('now') ORDER BY saved_at DESC LIMIT 20;";
    }
    
    if (q.includes('this week') || q.includes('week')) {
      return "SELECT title, url, source_site, saved_at FROM links WHERE saved_at >= datetime('now', '-7 days') ORDER BY saved_at DESC;";
    }
    
    if (q.includes('last month') || q.includes('month')) {
      return "SELECT title, url, source_site, score, saved_at FROM links WHERE saved_at >= datetime('now', '-30 days') ORDER BY saved_at DESC;";
    }
    
    if (q.includes('yesterday')) {
      return "SELECT title, url, source_site, saved_at FROM links WHERE DATE(saved_at) = DATE('now', '-1 day') ORDER BY saved_at DESC;";
    }
    
    if (q.includes('last 3 days') || q.includes('past 3 days')) {
      return "SELECT title, url, source_site, saved_at FROM links WHERE saved_at >= datetime('now', '-3 days') ORDER BY saved_at DESC;";
    }
    
    // Rating/quality queries
    if (q.includes('highest rated') || q.includes('best') || q.includes('top rated')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE score > 0 ORDER BY score DESC, extracted_at DESC LIMIT 15;";
    }
    
    if (q.includes('curated') || q.includes('manually')) {
      return "SELECT title, url, score, tags, source_site, curated_at FROM links WHERE is_curated = 1 ORDER BY score DESC, curated_at DESC;";
    }
    
    if (q.includes('public') || q.includes('shared')) {
      return "SELECT title, url, score, source_site FROM links WHERE is_public = 1 ORDER BY score DESC;";
    }
    
    // Topic-based queries (enhanced with tag support)
    if (q.includes('ai') || q.includes('artificial intelligence') || q.includes('machine learning')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE (title LIKE '%AI%' OR title LIKE '%artificial intelligence%' OR title LIKE '%machine learning%' OR notes LIKE '%AI%' OR tags LIKE '%ai%') ORDER BY score DESC, saved_at DESC;";
    }
    
    if (q.includes('programming') || q.includes('coding') || q.includes('development')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE (title LIKE '%programming%' OR title LIKE '%coding%' OR title LIKE '%development%' OR title LIKE '%developer%' OR tags LIKE '%programming%' OR tags LIKE '%web-dev%') ORDER BY score DESC, saved_at DESC;";
    }
    
    if (q.includes('javascript') || q.includes('js') || q.includes('web dev')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE (title LIKE '%javascript%' OR title LIKE '%JS %' OR tags LIKE '%javascript%' OR tags LIKE '%web-dev%') ORDER BY score DESC, saved_at DESC;";
    }
    
    if (q.includes('startup') || q.includes('business')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE (tags LIKE '%startup%' OR tags LIKE '%tech-company%' OR tags LIKE '%finance%' OR title LIKE '%startup%') ORDER BY score DESC, saved_at DESC;";
    }
    
    if (q.includes('tutorial') || q.includes('how to') || q.includes('guide')) {
      return "SELECT title, url, score, source_site, tags FROM links WHERE (tags LIKE '%tutorial%' OR title LIKE '%how to%' OR title LIKE '%guide%') ORDER BY score DESC, saved_at DESC;";
    }
    
    // Source-based queries
    if (q.includes('hacker news') || q.includes('hn')) {
      return "SELECT title, url, score, saved_at FROM links WHERE source_site = 'news.ycombinator.com' ORDER BY saved_at DESC;";
    }
    
    if (q.includes('reddit')) {
      return "SELECT title, url, source_page, saved_at FROM links WHERE (source_site LIKE '%reddit%' OR source_site = 'old.reddit.com') ORDER BY saved_at DESC;";
    }
    
    if (q.includes('fark')) {
      return "SELECT title, url, saved_at FROM links WHERE source_site = 'www.fark.com' ORDER BY saved_at DESC;";
    }
    
    // Stats queries
    if (q.includes('how many') || q.includes('count') || q.includes('total')) {
      if (q.includes('curated')) {
        return "SELECT COUNT(*) as curated_count, AVG(score) as avg_score FROM links WHERE is_curated = 1;";
      }
      return "SELECT COUNT(*) as total_links, COUNT(CASE WHEN is_curated = 1 THEN 1 END) as curated_count, AVG(CASE WHEN score > 0 THEN score END) as avg_score FROM links;";
    }
    
    if (q.includes('sources') || q.includes('sites')) {
      return "SELECT source_site, COUNT(*) as link_count, AVG(CASE WHEN score > 0 THEN score END) as avg_score FROM links GROUP BY source_site ORDER BY link_count DESC;";
    }
    
    if (q.includes('tags') || q.includes('categories')) {
      return "SELECT tags, COUNT(*) as count FROM links WHERE tags != '[]' GROUP BY tags ORDER BY count DESC LIMIT 20;";
    }
    
    if (q.includes('popular tags') || q.includes('common tags')) {
      return "SELECT tags, COUNT(*) as count, AVG(score) as avg_score FROM links WHERE tags != '[]' GROUP BY tags ORDER BY count DESC LIMIT 15;";
    }
    
    // Default: recent links
    return "SELECT title, url, source_site, saved_at FROM links ORDER BY saved_at DESC LIMIT 20;";
  }

  generateInsights(results, question) {
    let insights = '\n\n💡 **Quick Insights:**\n';
    
    if (results.length > 0) {
      // Check for patterns in results
      const sources = {};
      const hasScores = results.some(r => r.score > 0);
      const hasTags = results.some(r => r.tags && r.tags !== '[]');
      
      results.forEach(r => {
        if (r.source_site) {
          sources[r.source_site] = (sources[r.source_site] || 0) + 1;
        }
      });
      
      const topSource = Object.keys(sources).reduce((a, b) => sources[a] > sources[b] ? a : b, '');
      
      if (topSource) {
        insights += `- Most results from: **${topSource}** (${sources[topSource]} links)\n`;
      }
      
      if (hasScores) {
        const avgScore = results.filter(r => r.score > 0).reduce((sum, r) => sum + r.score, 0) / results.filter(r => r.score > 0).length;
        insights += `- Average rating: **${avgScore.toFixed(1)}/5**\n`;
      }
      
      if (results.length >= 20) {
        insights += '- Showing first 20 results (there may be more)\n';
      }
    }
    
    return insights;
  }

  async getDatabaseSummary() {
    const stats = await this.getStats();
    const recentLinks = await this.executeSql("SELECT source_site, COUNT(*) as count FROM links WHERE saved_at >= datetime('now', '-7 days') GROUP BY source_site ORDER BY count DESC LIMIT 5");
    const topRated = await this.executeSql("SELECT title, score, source_site FROM links WHERE score > 0 ORDER BY score DESC LIMIT 3");
    
    let output = `# 📊 Database Summary\n\n`;
    output += `## Quick Stats\n`;
    output += `- **Total Links:** ${stats.total_links}\n`;
    output += `- **Curated Links:** ${stats.curated_count} (${((stats.curated_count / stats.total_links) * 100).toFixed(1)}%)\n`;
    output += `- **Public Links:** ${stats.public_count}\n`;
    output += `- **Sites Tracked:** ${stats.unique_sources}\n\n`;
    
    if (recentLinks.length > 0) {
      output += `## Recent Activity (Past Week)\n`;
      recentLinks.forEach(link => {
        output += `- **${link.source_site}**: ${link.count} new links\n`;
      });
      output += '\n';
    }
    
    if (topRated.length > 0) {
      output += `## Top Rated Content\n`;
      topRated.forEach((link, i) => {
        output += `${i + 1}. **${link.title}** (${link.score}/5) - ${link.source_site}\n`;
      });
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async executeRawSQL(query) {
    // Security check
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed for security reasons');
    }
    
    const results = await this.executeSql(query);
    
    let output = `# SQL Query Results\n\n`;
    output += `**Query:** \`${query}\`\n\n`;
    
    if (results.length === 0) {
      output += 'No results found.\n';
    } else {
      output += `Found ${results.length} rows:\n\n`;
      
      const headers = Object.keys(results[0]);
      output += `| ${headers.join(' | ')} |\n`;
      output += `| ${headers.map(() => '---').join(' | ')} |\n`;
      
      results.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return value !== null && value !== undefined ? String(value) : '';
        });
        output += `| ${values.join(' | ')} |\n`;
      });
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async executeSql(query) {
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getSchema() {
    return this.executeSql("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name");
  }

  async getStats() {
    const [totalStats] = await this.executeSql(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN is_curated = 1 THEN 1 END) as curated_count,
        COUNT(CASE WHEN is_public = 1 THEN 1 END) as public_count,
        COUNT(DISTINCT source_site) as unique_sources
      FROM links
    `);
    return totalStats;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SQL Query MCP server running on stdio');
  }
}

const server = new SQLQueryMCPServer();
server.run().catch(console.error);