import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SessionManager {
  constructor() {
    this.sessionsDir = join(__dirname, '..', 'sessions');
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
    ];
    this.sessions = new Map();
    this.requestCounts = new Map();
    this.lastRequestTime = new Map();
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create sessions directory:', error);
    }
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async getSessionPath(domain) {
    const sessionFile = join(this.sessionsDir, `${domain.replace(/[^a-zA-Z0-9]/g, '_')}_session.json`);
    return sessionFile;
  }

  async loadSession(domain) {
    try {
      const sessionPath = await this.getSessionPath(domain);
      const data = await fs.readFile(sessionPath, 'utf8');
      const session = JSON.parse(data);
      console.error(`Loaded session for ${domain}: ${session.cookies.length} cookies`);
      return session;
    } catch (error) {
      console.error(`No existing session for ${domain}, creating new one`);
      return null;
    }
  }

  async saveSession(domain, cookies, userAgent) {
    try {
      const sessionPath = await this.getSessionPath(domain);
      const session = {
        domain,
        userAgent,
        cookies,
        lastUsed: new Date().toISOString(),
        requestCount: this.requestCounts.get(domain) || 0
      };
      
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
      console.error(`Saved session for ${domain}: ${cookies.length} cookies`);
    } catch (error) {
      console.error(`Failed to save session for ${domain}:`, error);
    }
  }

  async setupPageForDomain(page, domain) {
    try {
      console.error(`Setting up page for domain: ${domain}`);
      
      // Load existing session if available
      const session = await this.loadSession(domain);
      let userAgent;
      
      if (session && session.userAgent) {
        userAgent = session.userAgent;
        console.error(`Using saved user agent for ${domain}`);
      } else {
        userAgent = this.getRandomUserAgent();
        console.error(`Using new random user agent for ${domain}`);
      }
      
      // Set user agent
      await page.setUserAgent(userAgent);
      
      // Set viewport to common resolution
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      // Set extra headers to look more human
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      });
      
      // Load cookies if we have a session
      if (session && session.cookies && session.cookies.length > 0) {
        try {
          await page.context().addCookies(session.cookies);
          console.error(`Loaded ${session.cookies.length} cookies for ${domain}`);
        } catch (error) {
          console.error(`Failed to load cookies for ${domain}:`, error);
        }
      }
      
      // Store session info
      this.sessions.set(domain, { userAgent, startTime: Date.now() });
      this.requestCounts.set(domain, (this.requestCounts.get(domain) || 0) + 1);
      
      return { userAgent, hasSession: !!session };
    } catch (error) {
      console.error(`Session setup failed for ${domain}:`, error.message);
      // Return basic setup on failure
      return { userAgent: this.getRandomUserAgent(), hasSession: false };
    }
  }

  async savePageSession(page, domain) {
    try {
      const cookies = await page.context().cookies();
      const session = this.sessions.get(domain);
      
      if (session) {
        await this.saveSession(domain, cookies, session.userAgent);
      }
    } catch (error) {
      console.error(`Failed to save session for ${domain}:`, error);
    }
  }

  async respectRateLimit(domain, minDelay = 1000, maxDelay = 3000) {
    const lastRequest = this.lastRequestTime.get(domain) || 0;
    const timeSinceLastRequest = Date.now() - lastRequest;
    const requestCount = this.requestCounts.get(domain) || 0;
    
    // Calculate delay based on request count and recent activity
    let baseDelay = minDelay;
    if (requestCount > 10) baseDelay = Math.min(maxDelay, minDelay * 2);
    if (requestCount > 20) baseDelay = Math.min(maxDelay * 2, minDelay * 3);
    
    // Add random jitter
    const jitter = Math.random() * 1000;
    const totalDelay = baseDelay + jitter;
    
    if (timeSinceLastRequest < totalDelay) {
      const waitTime = totalDelay - timeSinceLastRequest;
      console.error(`Rate limiting for ${domain}: waiting ${Math.round(waitTime)}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(domain, Date.now());
    this.requestCounts.set(domain, requestCount + 1);
  }

  async handleDetectionPrevention(page) {
    try {
      // Add some human-like behaviors
      await page.evaluate(() => {
        // Override webdriver detection
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Add some realistic properties
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });
      
      // Random mouse movements (optional, for more advanced evasion)
      await page.mouse.move(
        Math.random() * 100 + 100,
        Math.random() * 100 + 100
      );
    } catch (error) {
      console.error('Detection prevention failed:', error.message);
    }
  }

  getSessionStats() {
    const stats = {};
    for (const [domain, count] of this.requestCounts) {
      stats[domain] = {
        requestCount: count,
        lastRequest: this.lastRequestTime.get(domain),
        hasSession: this.sessions.has(domain)
      };
    }
    return stats;
  }
}