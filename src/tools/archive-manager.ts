import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type {
  Database,
  MCPResult,
  ArchiveResource,
  ArchiveResourceRecord
} from '../types/index.js';
import { BrowserError } from '../types/index.js';

export class ArchiveManager {
  private archivesDir: string;

  constructor(private database: Database) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.archivesDir = path.join(__dirname, '..', '..', 'archives');
  }

  async archiveUrl(
    url: string, 
    linkId: number | null = null, 
    format: 'directory' | 'mhtml' = 'directory', 
    includeScreenshot: boolean = true
  ): Promise<MCPResult> {
    try {
      // Create archives directory if it doesn't exist
      await fs.mkdir(this.archivesDir, { recursive: true });
      
      // Generate unique archive folder name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const urlParts = new URL(url);
      const safeHostname = urlParts.hostname.replace(/[^a-zA-Z0-9-]/g, '_');
      const archiveName = `${safeHostname}_${timestamp}`;
      const archivePath = path.join(this.archivesDir, archiveName);
      
      await fs.mkdir(archivePath, { recursive: true });
      
      console.error(`Starting archive of ${url}...`);
      
      // Create browser instance for archiving
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--allow-running-insecure-content']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      const resources: ArchiveResource[] = [];
      let pageTitle = '';
      let screenshotPath: string | null = null;
      
      // Intercept resources to save them locally
      await page.route('**/*', async route => {
        const request = route.request();
        const resourceType = request.resourceType();
        
        try {
          const response = await route.fetch();
          
          if (response.ok()) {
            // Save resource locally
            const resourceUrl = request.url();
            const resourcePath = this.getResourcePath(resourceUrl, archivePath);
            const buffer = await response.body();
            
            await fs.mkdir(path.dirname(resourcePath), { recursive: true });
            await fs.writeFile(resourcePath, buffer);
            
            resources.push({
              type: resourceType,
              originalUrl: resourceUrl,
              localPath: path.relative(this.archivesDir, resourcePath),
              fileSize: buffer.length
            });
            
            console.error(`Saved ${resourceType}: ${resourceUrl}`);
          }
          
          await route.fulfill({ response });
        } catch (error) {
          console.error(`Failed to save resource ${request.url()}:`, (error as Error).message);
          await route.continue();
        }
      });
      
      // Navigate and wait for page to fully load
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // Extra time for JS execution
      
      pageTitle = await page.title();
      
      // Capture screenshot if requested
      if (includeScreenshot) {
        const screenshotFullPath = path.join(archivePath, 'screenshot.png');
        await page.screenshot({ 
          path: screenshotFullPath, 
          fullPage: true 
        });
        screenshotPath = path.relative(this.archivesDir, screenshotFullPath);
      }
      
      // Save the main HTML content with rewritten URLs
      const htmlContent = await this.rewriteHtmlUrls(page, resources, archivePath);
      const htmlPath = path.join(archivePath, 'index.html');
      await fs.writeFile(htmlPath, htmlContent);
      
      await browser.close();
      
      // Calculate total archive size
      const archiveSize = await this.calculateDirectorySize(archivePath);
      
      // Save archive to database
      const archiveId = await this.database.saveArchive({
        linkId,
        url,
        title: pageTitle,
        archivePath: path.relative(this.archivesDir, archivePath),
        archiveFormat: format,
        archiveSize,
        contentType: 'webpage',
        screenshotPath,
        archiveMetadata: {
          resourceCount: resources.length,
          timestamp,
          userAgent: 'Chrome/120.0.0.0'
        },
        resources
      });
      
      console.error(`Archive completed: ${archivePath}`);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Successfully archived "${pageTitle}" (${url})

📁 Archive ID: ${archiveId}
📂 Path: ${archivePath}
📊 Size: ${(archiveSize / 1024 / 1024).toFixed(2)} MB
🔗 Resources: ${resources.length} files saved
${includeScreenshot ? '📸 Screenshot: Captured' : ''}

The page has been fully archived with all resources for offline viewing.`
        }]
      };
      
    } catch (error) {
      console.error('Archive failed:', error);
      throw new BrowserError(`Archive failed: ${(error as Error).message}`, error as Error);
    }
  }
  
  async listArchives(
    limit: number = 20, 
    contentType: string | null = null, 
    hasScreenshot: boolean | null = null
  ): Promise<MCPResult> {
    try {
      const archives = await this.database.getArchives({
        limit,
        contentType,
        hasScreenshot
      });
      
      if (archives.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No archives found.'
          }]
        };
      }
      
      const archiveList = archives.map(archive => {
        const sizeInMB = archive.archive_size ? (archive.archive_size / 1024 / 1024).toFixed(2) : 'Unknown';
        const screenshotStatus = archive.screenshot_path ? '📸' : '⭕';
        const linkInfo = archive.link_title ? ` (from link: ${archive.link_title})` : '';
        
        return `📁 **${archive.title || 'Untitled'}**${linkInfo}
   🆔 ID: ${archive.id} | 📊 ${sizeInMB} MB | ${screenshotStatus}
   🔗 ${archive.url}
   📅 Archived: ${new Date(archive.archived_at).toLocaleDateString()}`;
      }).join('\n\n');
      
      return {
        content: [{
          type: 'text',
          text: `📚 **Archives** (${archives.length} found)\n\n${archiveList}`
        }]
      };
      
    } catch (error) {
      throw new BrowserError(`Failed to list archives: ${(error as Error).message}`, error as Error);
    }
  }
  
  async browseArchive(archiveId: number, showResources: boolean = true): Promise<MCPResult> {
    try {
      const archive = await this.database.getArchiveById(archiveId);
      
      if (!archive) {
        return {
          content: [{
            type: 'text',
            text: `❌ Archive with ID ${archiveId} not found.`
          }]
        };
      }
      
      let response = `📁 **Archive Details**

🆔 **ID:** ${archive.id}
📄 **Title:** ${archive.title || 'Untitled'}
🔗 **URL:** ${archive.url}
📂 **Path:** ${archive.archive_path}
📊 **Size:** ${archive.archive_size ? (archive.archive_size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}
📅 **Archived:** ${new Date(archive.archived_at).toLocaleDateString()}
📸 **Screenshot:** ${archive.screenshot_path ? 'Available' : 'Not captured'}`;
      
      if (archive.link_title) {
        response += `\n🔗 **Linked to:** ${archive.link_title}`;
      }
      
      if (showResources) {
        const resources = await this.database.getArchiveResources(archiveId);
        
        if (resources.length > 0) {
          const resourcesByType: Record<string, ArchiveResourceRecord[]> = {};
          resources.forEach(resource => {
            const type = resource.resource_type || 'unknown';
            if (!resourcesByType[type]) {
              resourcesByType[type] = [];
            }
            resourcesByType[type]!.push(resource);
          });
          
          response += '\n\n📦 **Resources:**';
          for (const [type, typeResources] of Object.entries(resourcesByType)) {
            const totalSize = typeResources.reduce((sum, r) => sum + (r.file_size || 0), 0);
            response += `\n   ${type}: ${typeResources.length} files (${(totalSize / 1024).toFixed(1)} KB)`;
          }
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
      
    } catch (error) {
      throw new BrowserError(`Failed to browse archive: ${(error as Error).message}`, error as Error);
    }
  }
  
  // Helper methods for archiving
  private getResourcePath(resourceUrl: string, archivePath: string): string {
    try {
      const url = new URL(resourceUrl);
      let pathname = url.pathname;
      
      // Handle root path
      if (pathname === '/') {
        pathname = '/index';
      }
      
      // Remove leading slash and create safe filename
      pathname = pathname.substring(1);
      const safePath = pathname.replace(/[^a-zA-Z0-9.-_/]/g, '_');
      
      // Add file extension if missing
      if (!path.extname(safePath)) {
        const contentTypeGuess = this.guessContentType(resourceUrl);
        if (contentTypeGuess) {
          pathname = safePath + '.' + contentTypeGuess;
        } else {
          pathname = safePath;
        }
      } else {
        pathname = safePath;
      }
      
      return path.join(archivePath, 'resources', pathname);
    } catch (error) {
      // Fallback for invalid URLs
      const filename = resourceUrl.split('/').pop() || 'resource';
      return path.join(archivePath, 'resources', filename);
    }
  }
  
  private guessContentType(url: string): string | null {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.css') || urlLower.includes('text/css')) return 'css';
    if (urlLower.includes('.js') || urlLower.includes('javascript')) return 'js';
    if (urlLower.includes('.png')) return 'png';
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
    if (urlLower.includes('.gif')) return 'gif';
    if (urlLower.includes('.svg')) return 'svg';
    if (urlLower.includes('.woff') || urlLower.includes('.woff2')) return 'woff';
    return null;
  }
  
  private async rewriteHtmlUrls(page: Page, resources: ArchiveResource[], archivePath: string): Promise<string> {
    // Get the HTML content
    let html = await page.content();
    
    // Create a mapping of original URLs to local paths
    const urlMap: Record<string, string> = {};
    resources.forEach(resource => {
      const relativePath = path.relative(archivePath, path.join(archivePath, '..', resource.localPath));
      urlMap[resource.originalUrl] = relativePath;
    });
    
    // Rewrite URLs in HTML
    for (const [originalUrl, localPath] of Object.entries(urlMap)) {
      const regex = new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, localPath);
    }
    
    return html;
  }
  
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    const calculateSize = async (currentPath: string): Promise<void> => {
      const stats = await fs.stat(currentPath);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(currentPath);
        for (const file of files) {
          await calculateSize(path.join(currentPath, file));
        }
      } else {
        totalSize += stats.size;
      }
    };
    
    await calculateSize(dirPath);
    return totalSize;
  }
}