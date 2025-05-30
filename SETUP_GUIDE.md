# Personal Link Garden - Setup Guide

## 🌱 What This Is

Your **Personal Link Garden** is a place where you cultivate links you care about, with Claude as your gardening assistant. Instead of writing scrapers, you teach Claude your browsing habits so it can help you collect and tend to links the way you naturally do.

## 🌿 Garden Features

- **🧠 Learning Mode**: Teach Claude your browsing patterns
- **🔄 Personal Automation**: Claude learns to collect links the way you do
- **🎭 Playwright MCP**: Professional browser automation through MCP
- **📦 Archive System**: Keep special pages like pressing flowers
- **🏷️ Personal Tagging**: Organize your garden your way
- **📊 Garden Health**: See how your collection grows over time

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Node.js 18+ required
node --version

# Install Playwright MCP server globally
npm install -g @microsoft/playwright-mcp
```

### 2. Install Dependencies

```bash
cd intelligent-content-discovery
npm install
```

### 3. Configure Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "personal-link-garden": {
      "command": "node", 
      "args": ["src/index-playwright.ts"],
      "env": {}
    }
  }
}
```

### 4. Start the System

```bash
# Option 1: New Playwright MCP version (Recommended)
npm run start:playwright

# Option 2: Legacy version (for compatibility)
npm run start:legacy
```

## 🌱 Teaching Claude Your Browsing Habits

### Step 1: Connect to Your Garden Tools

```
Please connect to the browser so we can tend the garden together
```

### Step 2: Start Teaching Claude

```
I want to show you how I browse Reddit. Let's start a learning session.
Target URL: https://old.reddit.com
```

### Step 3: Show Claude What You Care About

```
When I'm on Reddit, I care about the story titles - record that
I also look at the scores to see what's popular - record that
And of course I need the actual links - record that too
```

### Step 4: Let Claude Learn Your Pattern

```
Analyze what I just showed you and remember how I browse Reddit
```

### Step 5: Test Claude's Understanding

```
Now try browsing /r/programming the way I just showed you
```

## 🛠️ Advanced Configuration

### Playwright MCP Settings

Edit `config.json`:

```json
{
  "playwright_mcp": {
    "browser": "chromium",
    "headless": true,
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

### Learning Mode Tuning

```json
{
  "learning": {
    "confidence_threshold": 0.85,
    "max_patterns_per_site": 15,
    "auto_validate": true
  }
}
```

## 📋 Available Tools

### Learning Mode
- `connect_browser` - Connect to Playwright MCP
- `start_learning_session` - Begin pattern learning
- `record_click` - Record user interactions
- `record_extraction` - Mark content for extraction
- `analyze_learning_session` - Generate patterns
- `apply_pattern` - Use learned patterns

### Content Management  
- `query_links` - Search saved content
- `curate_link` - Rate and organize content
- `bag_of_links` - Generate curated HTML collections
- `tag_cloud` - Interactive tag visualization

### Archive System
- `archive_url` - Save complete pages offline
- `list_archives` - Browse archived content
- `browse_archive` - View archive details

## 🎯 Example Workflows

### Learning Reddit Extraction

1. **Connect**: `connect_browser`
2. **Start Learning**: `start_learning_session "reddit_stories" "https://old.reddit.com"`
3. **Record Title Extraction**: `record_extraction session_id "title" "story titles"`
4. **Record Score Extraction**: `record_extraction session_id "score" "vote scores"`
5. **Generate Pattern**: `analyze_learning_session session_id`
6. **Apply Pattern**: `apply_pattern pattern_id "https://old.reddit.com/r/technology"`

### Content Discovery Pipeline

1. **Extract Content**: Use learned patterns to extract from multiple sources
2. **Curate**: Rate and tag extracted content
3. **Generate Collections**: Create curated "bag of links" HTML pages
4. **Archive**: Save important pages for offline access

## 🔧 Troubleshooting

### Common Issues

**Playwright MCP Connection Failed**
```bash
# Ensure Playwright MCP is installed globally
npm install -g @microsoft/playwright-mcp

# Check if MCP server is accessible
npx @microsoft/playwright-mcp --help
```

**Learning Mode Not Recording**
- Ensure browser is connected first
- Check element descriptions are specific enough
- Verify target page has loaded completely

**Pattern Confidence Low**
- Record more examples (5+ recommended)
- Use more specific element descriptions
- Validate patterns on similar pages

### Debug Mode

```bash
# Enable verbose logging
DEBUG=* npm run start:playwright

# Check logs
tail -f logs/discovery.log
```

## 🔄 Migration from Legacy Version

If you're upgrading from the custom browser automation:

1. **Backup Data**: Your database and patterns are preserved
2. **Install Playwright MCP**: `npm install -g @microsoft/playwright-mcp`
3. **Update Configuration**: Add Playwright MCP settings to `config.json`
4. **Test Learning Mode**: Create a test learning session
5. **Switch Startup Script**: Use `start:playwright` instead of `start:legacy`

## 🚀 Production Deployment

### Docker Setup (Coming Soon)

```yaml
version: '3.8'
services:
  content-discovery:
    image: intelligent-content-discovery:latest
    environment:
      - PLAYWRIGHT_MCP_URL=http://playwright-mcp:3000
    volumes:
      - ./data:/app/data
      - ./config.json:/app/config.json
```

### Environment Variables

```bash
export PLAYWRIGHT_MCP_URL=http://localhost:3000
export DATABASE_PATH=/app/data/patterns.db
export LOG_LEVEL=info
```

## 📞 Support

- **Documentation**: See `PRODUCT_ROADMAP.md` for development plans
- **Issues**: Report bugs and feature requests on GitHub
- **Community**: Join discussions about MCP servers and content discovery

## 🎯 Next Steps

1. **Try Learning Mode**: Create your first pattern with the tutorial above
2. **Explore Advanced Features**: Archive systems, content curation
3. **Share Patterns**: Export and share successful extraction patterns
4. **Integrate**: Build workflows with other MCP servers

The system is now production-ready with professional architecture, comprehensive error handling, and an intuitive learning interface!