export class CommandProcessor {
  constructor(browserServer) {
    this.browserServer = browserServer;
  }

  async processCommand(command) {
    const normalizedCommand = command.toLowerCase().trim();
    
    // Parse multi-site story extraction: "get the top 10 stories from /r/television /r/news and hacker news"
    const multiStoriesMatch = normalizedCommand.match(/get (?:the )?top (\d+) stories? from (.+)/);
    if (multiStoriesMatch) {
      const count = parseInt(multiStoriesMatch[1]);
      const sitesText = multiStoriesMatch[2];
      const sites = this.parseSitesList(sitesText);
      
      return await this.browserServer.getTopStoriesMulti(sites, count, 'markdown');
    }

    // Parse simpler multi-site: "top stories from /r/television and hacker news" 
    const simpleMultiMatch = normalizedCommand.match(/top stories? from (.+)/);
    if (simpleMultiMatch) {
      const sitesText = simpleMultiMatch[1];
      const sites = this.parseSitesList(sitesText);
      
      return await this.browserServer.getTopStoriesMulti(sites, 10, 'markdown');
    }
    
    // Parse "open [site] and tell me the top [number] stories"
    const redditTopStoriesMatch = normalizedCommand.match(/open reddit and tell me the top (\w+) stories?/);
    if (redditTopStoriesMatch) {
      const countWord = redditTopStoriesMatch[1];
      const count = this.wordToNumber(countWord);
      return await this.browserServer.getTopStories(count);
    }

    // Parse "open [website]"
    const openMatch = normalizedCommand.match(/open (.+)/);
    if (openMatch) {
      const site = openMatch[1].trim();
      const url = this.normalizeUrl(site);
      
      await this.browserServer.openBrowser();
      return await this.browserServer.navigateTo(url);
    }

    // Parse "get page content" or "what's on this page"
    if (normalizedCommand.includes('page content') || normalizedCommand.includes("what's on this page")) {
      return await this.browserServer.getPageContent();
    }

    // Parse "close browser"
    if (normalizedCommand.includes('close browser')) {
      return await this.browserServer.closeBrowser();
    }

    // Default fallback
    throw new Error(`Command not recognized: ${command}`);
  }

  parseSitesList(sitesText) {
    // Handle various formats:
    // "/r/television /r/news and hacker news"
    // "/r/television, /r/news, and hacker news"
    // "reddit.com and news.ycombinator.com"
    
    const sites = [];
    
    // Split by common delimiters and clean up
    const parts = sitesText
      .split(/,|\sand\s|\s&\s/)
      .map(part => part.trim())
      .filter(part => part.length > 0);
    
    for (const part of parts) {
      // Handle space-separated sites in a single part (like "/r/television /r/news")
      const spaceSeparated = part.split(/\s+/)
        .filter(item => item.startsWith('/r/') || item.includes('.com') || item.includes('hacker'));
      
      if (spaceSeparated.length > 1) {
        sites.push(...spaceSeparated);
      } else {
        sites.push(part);
      }
    }
    
    return sites;
  }

  wordToNumber(word) {
    const numbers = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    return numbers[word] || parseInt(word) || 3;
  }

  normalizeUrl(site) {
    const commonSites = {
      'reddit': 'reddit.com',
      'google': 'google.com',
      'youtube': 'youtube.com',
      'github': 'github.com',
      'stackoverflow': 'stackoverflow.com',
      'twitter': 'twitter.com',
      'facebook': 'facebook.com'
    };

    const normalizedSite = commonSites[site] || site;
    
    if (!normalizedSite.startsWith('http://') && !normalizedSite.startsWith('https://')) {
      return 'https://' + normalizedSite;
    }
    
    return normalizedSite;
  }
}