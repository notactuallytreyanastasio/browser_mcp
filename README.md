# Browser MCP Control Server with Link Curation

A powerful MCP server that automatically finds, extracts, and curates stories from multiple websites. Build your own personal knowledge base by collecting stories from Reddit, Hacker News, and any site you want to monitor.

## 🎯 **Key Features**

- **Multi-site story extraction** - Get stories from Reddit, Hacker News, and custom sites
- **Automatic link saving** - All extracted links saved to SQLite database  
- **Smart curation** - Rate, tag, and organize your favorite stories
- **Natural language queries** - Ask questions about your saved content in plain English
- **Site learning** - Teach the system to extract from any website
- **Personal story feed** - Build your own curated news feed

---

## 🚀 **Complete Setup Guide**

### **Prerequisites**
1. **Claude Desktop** - Install from [Claude Desktop](https://claude.ai/desktop)
2. **Node.js** - Version 18+ required
3. **Git** - For cloning the repository

### **Installation**
```bash
# Clone the repository
git clone <your-repo-url>
cd luke_fun

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### **Configure Claude Desktop**
Add this to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "browser-automation": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/luke_fun/src/index.js"],
      "cwd": "/path/to/luke_fun"
    }
  }
}
```

### **Start Using**
1. Restart Claude Desktop
2. You'll see new tools available in Claude
3. Start with: `test_browser_health` to verify everything works

---

## 📰 **Story Collection Guide**

### **Step 1: Quick Story Collection**

**Get stories from popular sites:**
```
Get the top 10 stories from /r/technology and hacker news
```

**Get stories from specific subreddits:**
```
Get the top 5 stories from /r/programming /r/webdev /r/javascript
```

**Supported sites out of the box:**
- **Reddit**: Use `/r/subreddit` format (e.g., `/r/technology`, `/r/news`)
- **Hacker News**: Use `hacker news` or `news.ycombinator.com`

### **Step 2: Learn New Sites**

**To extract from any website:**

1. **Open visual browser:**
   ```
   Use open_visual_browser with url: "https://example-news-site.com"
   ```

2. **Start learning mode:**
   ```
   Use start_learning_mode with pattern_name: "example_news_stories"
   ```

3. **Click on story titles** in the browser window - they'll highlight in red

4. **Save the pattern:**
   ```
   Use extract_learned_elements with pattern_name: "example_news_stories"
   ```

5. **Use your new pattern:**
   ```
   Get the top 10 stories from https://example-news-site.com
   ```

### **Step 3: View Your Collected Stories**

**See all recent stories:**
```
Use query_links with limit: 20
```

**Filter by source:**
```
Use query_links with source_site: "news.ycombinator.com", limit: 10
```

**Search content:**
```
Use query_links with search_text: "AI", limit: 15
```

---

## 🎯 **Story Curation Workflow**

### **1. Collect Stories**
```
Get the top 15 stories from /r/technology /r/programming and hacker news
```
→ Stories automatically saved to database

### **2. Review Your Collection**
```
Use query_links with limit: 30
```
→ Browse through your saved stories

### **3. Curate the Best Ones**

**Rate a story highly:**
```
Use curate_link with link_id: 5, score: 5, tags: ["must-read", "ai"]
```

**Add personal notes:**
```
Use curate_link with link_id: 12, score: 4, tags: ["tutorial"], notes: "Great explanation of React hooks"
```

**Mark for sharing:**
```
Use curate_link with link_id: 8, score: 5, is_public: true, tags: ["team-share"]
```

### **4. Create Your Personal Feed**

**Natural language queries:**
```
Use query_with_natural_language with description: "Show me my highest rated AI-related links from Hacker News"
```

**Custom SQL queries:**
```
Use execute_sql with query: "SELECT title, url, score FROM links WHERE score >= 4 ORDER BY score DESC"
```

---

## 🔍 **Finding and Organizing Content**

### **Natural Language Search**

Ask questions about your content in plain English:

- `"Show me my highest rated programming articles"`
- `"What are my recent links about AI?"`
- `"How many curated links do I have?"`
- `"Find links from Reddit about web development"`
- `"Show me public links I've shared"`

### **Advanced Filtering**

**By rating:**
```
Use query_links with min_score: 4
```

**By tags:**
```
Use query_links with tags: ["ai", "programming"]
```

**Curated only:**
```
Use query_links with is_curated: true
```

**Public shares:**
```
Use query_links with is_public: true
```

### **SQL Power Queries**

**Top sources:**
```sql
SELECT source_site, COUNT(*) as story_count 
FROM links 
GROUP BY source_site 
ORDER BY story_count DESC;
```

**Reading trends:**
```sql
SELECT DATE(extracted_at) as date, COUNT(*) as stories_saved 
FROM links 
WHERE extracted_at >= date('now', '-7 days') 
GROUP BY DATE(extracted_at) 
ORDER BY date;
```

**Best curated content:**
```sql
SELECT title, url, score, tags 
FROM links 
WHERE is_curated = 1 AND score >= 4 
ORDER BY score DESC, curated_at DESC;
```

---

## 🛠️ **Complete Tool Reference**

### **Story Collection**
- **`get_top_stories_multi`** - Extract from multiple sites at once
- **`open_visual_browser`** - Open browser to learn new sites
- **`start_learning_mode`** - Begin teaching extraction patterns
- **`extract_learned_elements`** - Save learned patterns
- **`apply_saved_pattern`** - Use saved patterns for extraction

### **Content Management**
- **`query_links`** - Search and filter your saved stories
- **`curate_link`** - Rate, tag, and organize individual stories
- **`query_with_natural_language`** - Ask questions in plain English
- **`execute_sql`** - Run custom database queries
- **`get_database_schema`** - View database structure

### **System Management**
- **`test_browser_health`** - Verify system is working
- **`get_session_stats`** - View automation statistics
- **`list_all_patterns`** - See all learned site patterns

---

## 📈 **Example Workflows**

### **Daily News Curator**
```bash
# Morning: Collect fresh stories
Get the top 20 stories from /r/technology /r/programming and hacker news

# Review your collection
Use query_links with limit: 30

# Curate the best ones
Use curate_link with link_id: 15, score: 5, tags: ["daily-read"]

# Evening: Review your curated feed
Use query_with_natural_language with description: "Show me today's highest rated stories"
```

### **Research Assistant**
```bash
# Collect from specialized sources
Get the top 10 stories from /r/MachineLearning /r/artificial

# Search your archive
Use query_with_natural_language with description: "Find all my AI research links with high ratings"

# Export for sharing
Use execute_sql with query: "SELECT title, url FROM links WHERE tags LIKE '%research%' AND is_public = 1"
```

### **Content Discovery**
```bash
# Learn a new site
Use open_visual_browser with url: "https://dev.to"
Use start_learning_mode with pattern_name: "dev_to_articles"
# Click on article titles in browser
Use extract_learned_elements with pattern_name: "dev_to_articles"

# Use your new pattern
Get the top 10 stories from https://dev.to
```

---

## 🎯 **Pro Tips**

### **Efficient Collection**
- **Batch multiple sites** in one command for faster collection
- **Use specific subreddits** rather than general ones for better content
- **Set reasonable limits** (10-20 stories) to avoid overwhelming your feed

### **Smart Curation**
- **Rate immediately** while the content is fresh in your mind
- **Use consistent tags** to build searchable categories
- **Add notes** to remember why something was important
- **Mark public** only your best finds for team sharing

### **Pattern Learning**
- **Click 5-10 examples** when learning a new site pattern
- **Focus on title elements** rather than metadata for better extraction
- **Test patterns immediately** after creating them
- **Give descriptive names** to patterns for easy identification

### **Search Optimization**
- **Use natural language** for quick exploration
- **Use SQL** for complex analysis and reporting
- **Combine filters** for precise content discovery
- **Save useful queries** as documentation for repeated use

---

## 🔧 **Troubleshooting**

### **Browser Issues**
```
Use test_browser_health
```
If this fails:
- Run `npx playwright install chromium`
- Restart Claude Desktop
- Check file permissions

### **Site Learning Problems**
- **Red highlighting not appearing**: Refresh page and try `start_learning_mode` again
- **No stories extracted**: Click more examples or try different elements
- **Pattern not working**: Use `list_all_patterns` to verify it was saved

### **Database Issues**
```
Use get_database_schema
```
This shows your database structure and confirms it's working.

---

Your personal story curation system is now ready! Start collecting, organizing, and discovering the content that matters most to you.
