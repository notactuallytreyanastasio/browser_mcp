# Personal Link Garden 🌱

A tool for Claude Desktop that helps you collect, organize, and curate interesting links from around the web. Think of it as your personal digital garden where you can grow a collection of meaningful content.

## What This Does

Instead of bookmarking links randomly or losing track of interesting articles, this tool helps Claude learn how you browse and what you care about. Once Claude understands your patterns, it can help you collect and organize links automatically.

## What You Need

- Claude Desktop (which you already have!)
- About 10 minutes to set up
- No technical experience required!

## Quick Setup

### Step 1: Get the Tool Ready

1. **Download this folder** to your computer
2. **Open Terminal** (don't worry, we'll keep it simple!)
   - On Mac: Press Cmd+Space, type "Terminal", press Enter
   - On Windows: Press Windows key, type "Command Prompt", press Enter
3. **Go to the folder** where you downloaded this:
   ```
   cd Downloads/luke_fun
   ```
4. **Install it**:
   ```
   npm install
   ```

### Step 2: Connect to Claude Desktop

1. **Open Claude Desktop**
2. **Go to Settings** (gear icon)
3. **Find "MCP Servers"** section
4. **Add this configuration**:

```json
{
  "mcpServers": {
    "personal-link-garden": {
      "command": "node",
      "args": ["src/index.js"],
      "env": {}
    }
  }
}
```

5. **Restart Claude Desktop**

### Step 3: Test It

Open a new chat in Claude Desktop and ask:

> "Do you see my personal link garden tools? Can you help me get started?"

If Claude says yes, you're ready to go! 🎉

## How to Use Your Link Garden

### 🎓 Part 1: Teaching Claude Your Browsing Style

The magic happens when you show Claude how YOU like to browse websites. Let's start with Reddit:

**Say to Claude:**
> "I want to teach you how I browse Reddit. Can you help me start a learning session for the Reddit front page?"

Claude will guide you through:
1. **Opening a browser** to Reddit
2. **Starting learning mode** so it can watch what you do
3. **Showing what matters to you** - click on story titles, vote scores, whatever you care about
4. **Analyzing your pattern** so Claude remembers for next time

**When you're done, say:**
> "Okay, I think you understand how I browse Reddit. Can you remember this pattern so you can help me collect stories later?"

### 🌐 Part 2: Getting Stories Automatically

Once Claude knows your pattern:

> "Can you check Reddit using the pattern I taught you and bring me back 10 interesting stories?"

Claude will browse Reddit exactly the way you showed it and return a neat list of stories for you to look through.

**You can also try:**
- "Get me stories from the programming subreddit"
- "Check Hacker News for interesting tech articles"
- "Look for cooking content on Reddit"

### 🏷️ Part 3: Organizing Your Collection

As you collect links, you'll want to organize the good ones:

**Rate something you loved:**
> "I really liked that article about gardening. Give it 5 stars and tag it as 'gardening' and 'weekend-project'"

**Add personal notes:**
> "For that recipe link, add a note: 'Mom would love this - try for her birthday dinner'"

**Mark favorites:**
> "Mark that travel article as curated - it's definitely a keeper"

**Find things later:**
> "Show me all my 5-star cooking articles"
> "What articles did I save about travel last month?"

### 📖 Part 4: Creating Beautiful Reading Lists

When you want a nice collection to read:

> "Make me a weekend reading list with about 8 of my favorite recent articles"

Claude will create a beautiful HTML page with your best links, formatted perfectly for reading on your phone, tablet, or computer.

### 📊 Part 5: Watching Your Garden Grow

See what you've been collecting:

> "Show me a visual map of all my interests based on the links I've saved"

This creates a colorful "tag cloud" showing your reading patterns and interests over time.

## If Something Goes Wrong

### Reddit Won't Let You In?

Sometimes Reddit blocks automated browsing. Just say:

> "Reddit seems to be blocking us. Can you try the backup method?"

Claude will switch to a gentler approach that works better with Reddit's rules.

### Confused About What You Can Do?

> "What can you help me do with my link garden?"

Claude will explain all the available features in simple terms.

### Want to Start Over?

> "Can you help me learn a completely different website, like a news site I like?"

Claude can learn any website you show it!

## What Makes This Special

### 🧠 It Learns YOUR Preferences
- You teach Claude exactly what parts of websites matter to YOU
- Your patterns are completely personal
- No two gardens are alike

### 🌱 It Grows With You
- The more you use it, the better it gets
- You can teach it new websites anytime
- It remembers everything you've shown it

### 🏡 It's Completely Private
- Everything stays on your computer
- No data is shared anywhere
- It's your personal digital space

### 🎯 It Stays Focused
- Not about consuming more content
- About thoughtfully collecting what matters
- Quality over quantity, always

## Real Examples of How People Use It

### The Curious Learner
*"I taught Claude how I browse educational YouTube channels and science blogs. Now it helps me find interesting documentaries and research articles. I rate them and create weekend learning lists."*

### The Recipe Collector
*"Claude learned how I browse food blogs and cooking subreddits. It finds great recipes for me, and I tag them by meal type and difficulty. Now I have my own searchable cookbook!"*

### The Tech Enthusiast  
*"I showed Claude my favorite programming blogs and GitHub trending pages. It helps me stay current with tech trends and I curate the best tutorials for later reference."*

### The Hobbyist
*"Claude learned my gardening forums and craft sites. I collect project ideas, rate them by season and difficulty, and create 'inspiration lists' when I'm ready to start something new."*

## 🔍 Part 6: Understanding Your Natural Browsing (Optional)

Your link garden can also learn from your everyday browsing to understand your natural interests:

**Enable browser history monitoring:**
> "Can you check what browsers I have available for monitoring my browsing patterns?"

**Sync your browsing history:**
> "Sync my Chrome browsing history from the last week so you can see what I naturally browse"

**Discover hidden gems:**
> "Look through my browsing history and find interesting links I visited but haven't saved to my garden yet"

**Understand your patterns:**
> "Analyze my browsing patterns to show me what I'm naturally interested in"

This creates two types of links in your garden:
- 🌱 **Organic browsing** - Things you naturally discovered while browsing
- ⭐ **Curated links** - Things you intentionally chose to save

**Privacy Note:** All browsing data stays completely on your computer. This feature requires "Full Disk Access" permission and works best when your browser is closed during sync.

## Growing Your Garden Over Time

Think of this as tending a real garden:

🌱 **Planting Seeds** - Teaching Claude new websites and patterns
🌿 **Daily Tending** - Reviewing and rating the links Claude finds
🌸 **Seasonal Harvests** - Creating themed reading lists from your collection
🌳 **Long-term Growth** - Building a personal knowledge base that reflects your journey

The goal isn't to save everything you see online. It's to thoughtfully curate content that genuinely interests you, creating a personal library that becomes more valuable over time.

## Getting Help

Claude is designed to be your guide through all of this. If you ever get stuck:

1. **Ask Claude directly**: "I'm not sure how to [do something]"
2. **Request explanations**: "Can you explain how the rating system works?"
3. **Get suggestions**: "What's a good way to organize cooking links?"

Remember: This tool is designed for regular people, not programmers. If something feels too complicated, it probably is - ask Claude to explain it more simply!

Start with one website you enjoy browsing, teach Claude your pattern, and watch your personal link garden begin to grow. 🌱