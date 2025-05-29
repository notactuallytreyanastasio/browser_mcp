# Browser MCP Server Usage

Your browser control MCP server is now ready! Here's how to use it:

## Setup

1. **Configure Claude Desktop** (or your MCP client) to use this server by adding to your MCP config:

```json
{
  "mcpServers": {
    "browser-control": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/Users/robertgrayson/playground/luke_fun"
    }
  }
}
```

2. **Restart Claude Desktop** to load the new server.

## Available Commands

### Natural Language Commands
Use the `process_command` tool with natural language:

- `"open reddit and tell me the top three stories"`
- `"open google"`
- `"open github"`

### Direct Tools
- `open_browser` - Opens a browser instance
- `navigate_to` - Navigate to a specific URL
- `get_page_content` - Get text content from current page
- `get_top_stories` - Get top stories from Reddit (with count parameter)
- `close_browser` - Close the browser

## Example Usage

Once configured, you can simply say:

> "open reddit and tell me the top three stories"

And the system will:
1. Open a browser
2. Navigate to Reddit
3. Extract the top 3 stories
4. Return them to you with titles and links

## Supported Sites

The command processor recognizes common sites:
- reddit → reddit.com
- google → google.com
- youtube → youtube.com
- github → github.com
- stackoverflow → stackoverflow.com

## Installation Notes

The server uses Playwright with Chromium for reliable browser automation. All dependencies are installed and ready to go.

Start the server with: `npm start` or `node src/index.js`