export class CommandProcessor {
  constructor(browserServer) {
    this.browserServer = browserServer;
  }

  async processCommand(command) {
    const normalizedCommand = command.toLowerCase().trim();
    
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