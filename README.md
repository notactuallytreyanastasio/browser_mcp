# Browser MCP Control Server

A Model Context Protocol (MCP) server that enables natural language browser automation using Playwright. Control web browsers through simple commands like "open reddit and tell me the top three stories."

## Features

- **Natural Language Commands**: Use simple English to control browsers
- **Reddit Integration**: Automatically extract top stories with titles and links
- **Headless Browser Automation**: Powered by Playwright with Chromium
- **MCP Protocol**: Full integration with Claude Desktop and other MCP clients
- **Multiple Tools**: Direct browser control and high-level command processing

## Installation

1. **Clone and setup:**
   ```bash
   git clone <your-repo>
   cd luke_fun
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Configure Claude Desktop:**
   Add to your Claude Desktop MCP configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "browser-control": {
         "command": "/path/to/your/node",
         "args": ["/path/to/luke_fun/src/index.js"],
         "cwd": "/path/to/luke_fun"
       }
     }
   }
   ```

4. **Find your Node.js path:**
   ```bash
   which node
   ```
   Use the full path in your configuration.

5. **Restart Claude Desktop** to load the new server.

## Usage

### Natural Language Commands

Use the `process_command` tool with natural language:

**Multi-Site Story Extraction:**
```
"Get the top 10 stories from /r/television /r/aitah /r/news and hacker news"
"Top stories from /r/programming and hacker news"
"Get the top 5 stories from /r/worldnews and news.ycombinator.com"
```

**Single Site Commands:**
```
"open reddit and tell me the top three stories"
"open google"
"open github"
"open stackoverflow"
```

### Direct Tools

The server provides these tools for direct control:

- **`open_browser`** - Opens a headless browser instance
- **`navigate_to`** - Navigate to a specific URL
  - Parameters: `url` (string)
- **`get_page_content`** - Get text content from current page
  - Parameters: `selector` (optional CSS selector)
- **`get_top_stories`** - Get top stories from Reddit
  - Parameters: `count` (number, default: 3)
- **`close_browser`** - Close the browser instance
- **`process_command`** - Process natural language commands
  - Parameters: `command` (string)
- **`get_top_stories_multi`** - Get stories from multiple sites in one call
  - Parameters: `sites` (array), `count` (number), `format` (string)
- **`apply_saved_pattern`** - Apply a saved pattern to current page
  - Parameters: `pattern_name` (string)
- **`list_all_patterns`** - List all saved patterns across domains

### Examples

#### Basic Usage
```
User: "open reddit and tell me the top three stories"
```
The system will:
1. Open a browser
2. Navigate to Reddit
3. Extract the top 3 stories with titles and links
4. Return formatted results

#### Direct Tool Usage
```
1. open_browser
2. navigate_to: {"url": "https://reddit.com"}
3. get_top_stories: {"count": 5}
4. close_browser
```

#### Site Recognition
The command processor recognizes common sites:
- `reddit` → `reddit.com`
- `google` → `google.com`
- `youtube` → `youtube.com`
- `github` → `github.com`
- `stackoverflow` → `stackoverflow.com`
- `twitter` → `twitter.com`
- `facebook` → `facebook.com`

## Technical Details

### Architecture
- **MCP Server**: Implements Model Context Protocol for tool integration
- **Browser Engine**: Playwright with Chromium for reliable automation
- **Command Processing**: Natural language parsing for common web tasks
- **Reddit Scraping**: Specialized extraction for Reddit post data

### Files
- `src/index.js` - Main MCP server implementation
- `src/command-processor.js` - Natural language command parsing
- `package.json` - Dependencies and scripts
- `mcp-config.json` - Example MCP configuration

### Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `playwright` - Browser automation framework

## Development

### Running the Server
```bash
npm start
# or
node src/index.js
```

### Testing
```bash
# Test the server directly
node test-client.js
```

### Logs
Check Claude Desktop logs for debugging:
- `/Users/<username>/Library/Logs/Claude/mcp-server-browser-control.log`
- `/Users/<username>/Library/Logs/Claude/mcp.log`

## Troubleshooting

### Common Issues

1. **"spawn node ENOENT"**
   - Use the full path to Node.js in your MCP config
   - Find with: `which node`

2. **"Executable doesn't exist" (Playwright)**
   - Run: `npx playwright install`

3. **Server not loading**
   - Check file paths in MCP config are absolute
   - Restart Claude Desktop after config changes
   - Check logs for detailed error messages

4. **Reddit scraping not working**
   - Reddit may have changed their HTML structure
   - Check browser console for JavaScript errors
   - The server handles Reddit's dynamic loading

### Configuration Template
```json
{
  "mcpServers": {
    "browser-control": {
      "command": "/Users/username/.asdf/installs/nodejs/20.16.0/bin/node",
      "args": ["/Users/username/path/to/luke_fun/src/index.js"],
      "cwd": "/Users/username/path/to/luke_fun"
    }
  }
}
```

## License

MIT
