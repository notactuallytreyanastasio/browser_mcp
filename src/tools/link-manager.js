export class LinkManager {
  constructor(database, server) {
    this.database = database;
    this.server = server;
  }

  async queryLinks(args) {
    try {
      const links = await this.database.getLinks(args);
      
      if (links.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No links found matching your criteria.'
          }]
        };
      }

      const linkList = links.map((link, index) => {
        const score = link.score > 0 ? `⭐ ${link.score}/5` : '';
        const curated = link.is_curated ? '✅' : '';
        const tags = link.tags.length > 0 ? `🏷️ ${link.tags.join(', ')}` : '';
        const notes = link.notes ? `📝 ${link.notes}` : '';
        
        return `**${index + 1}. ${link.title}** ${curated} ${score}
🔗 ${link.url}
📍 ${link.source_site} | ${link.source_page || 'Unknown page'}
📅 ${new Date(link.extracted_at).toLocaleDateString()}
${tags}
${notes}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `🔗 **Found ${links.length} links**\n\n${linkList}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Error querying links: ${error.message}`
        }]
      };
    }
  }

  async curateLink(args) {
    const { link_id, score, tags, notes, is_public } = args;
    
    try {
      const updates = {
        is_curated: true
      };
      
      if (score !== undefined) updates.score = score;
      if (tags !== undefined) updates.tags = tags;
      if (notes !== undefined) updates.notes = notes;
      if (is_public !== undefined) updates.is_public = is_public;
      
      const changesCount = await this.database.updateLink(link_id, updates);
      
      if (changesCount === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ Link with ID ${link_id} not found.`
          }]
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: `✅ Successfully curated link ${link_id}${score ? ` with score ${score}/5` : ''}${tags ? ` and tags: ${tags.join(', ')}` : ''}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Error curating link: ${error.message}`
        }]
      };
    }
  }

  async getBagOfLinks(count = 10, minDaysOld = 2, maxDaysOld = 90) {
    try {
      // First try with the date filter
      let query = `
        SELECT * FROM links 
        WHERE saved_at <= datetime('now', '-${minDaysOld} days') 
        AND saved_at >= datetime('now', '-${maxDaysOld} days')
        ORDER BY 
          CASE WHEN score > 0 THEN 1 ELSE 2 END,
          CASE WHEN notes IS NOT NULL AND notes != '' THEN 1 ELSE 2 END,
          score DESC,
          RANDOM()
        LIMIT ?
      `;
      
      let links = await this.database.executeSql(query, [count]);
      
      // If no links found with date filter, get from all available links
      if (links.length === 0) {
        console.error('No links found in date range, falling back to all links');
        query = `
          SELECT * FROM links 
          ORDER BY 
            CASE WHEN score > 0 THEN 1 ELSE 2 END,
            CASE WHEN notes IS NOT NULL AND notes != '' THEN 1 ELSE 2 END,
            score DESC,
            RANDOM()
          LIMIT ?
        `;
        links = await this.database.executeSql(query, [count]);
      }

      if (links.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No links available for bag of links.'
          }]
        };
      }

      // Ensure diversity across sources
      const diverseLinks = this.ensureSourceDiversity(links, count);
      
      // Generate HTML
      const html = this.generateBagOfLinksHtml(diverseLinks);
      const filePath = '/Users/robertgrayson/playground/luke_fun/bag_of_links.html';
      
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, html);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Generated bag of links with ${diverseLinks.length} curated items
📄 File: ${filePath}
🌐 Open the file in your browser to view the interactive collection

Selected links span ${new Set(diverseLinks.map(l => l.source_site)).size} different sources.`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Error generating bag of links: ${error.message}`
        }]
      };
    }
  }

  ensureSourceDiversity(links, maxCount) {
    const sourceGroups = {};
    
    // Group by source
    links.forEach(link => {
      const source = link.source_site || 'unknown';
      if (!sourceGroups[source]) {
        sourceGroups[source] = [];
      }
      sourceGroups[source].push(link);
    });
    
    // Distribute evenly across sources
    const result = [];
    const sources = Object.keys(sourceGroups);
    const linksPerSource = Math.max(1, Math.floor(maxCount / sources.length));
    
    sources.forEach(source => {
      const sourceLinks = sourceGroups[source].slice(0, linksPerSource);
      result.push(...sourceLinks);
    });
    
    // Fill remaining slots with highest scored links
    if (result.length < maxCount) {
      const remaining = links.filter(link => !result.includes(link))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, maxCount - result.length);
      result.push(...remaining);
    }
    
    return result.slice(0, maxCount);
  }

  generateBagOfLinksHtml(links) {
    const now = new Date();
    const timestamp = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bag of Links - ${timestamp}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fafafa;
        }
        .header {
            text-align: center;
            margin-bottom: 2rem;
            padding: 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .link-item {
            background: white;
            margin-bottom: 1.5rem;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .link-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        .link-title {
            font-size: 1.2em;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        .link-title a {
            color: #2563eb;
            text-decoration: none;
        }
        .link-title a:hover {
            text-decoration: underline;
        }
        .link-meta {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 0.5rem;
        }
        .link-source {
            display: inline-block;
            background: #e5e7eb;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8em;
            margin-right: 0.5rem;
        }
        .link-score {
            color: #059669;
            font-weight: 600;
        }
        .link-notes {
            background: #f8fafc;
            padding: 1rem;
            border-left: 4px solid #3b82f6;
            margin-top: 1rem;
            font-style: italic;
        }
        .stats {
            text-align: center;
            padding: 1rem;
            background: #f1f5f9;
            border-radius: 8px;
            margin-bottom: 2rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎒 Bag of Links</h1>
        <p>Your curated collection for ${timestamp}</p>
    </div>
    
    <div class="stats">
        <strong>${links.length} handpicked links</strong> from ${new Set(links.map(l => l.source_site)).size} sources
    </div>
    
    <div class="links">
        ${links.map((link, index) => {
          const tags = JSON.parse(link.tags || '[]');
          const scoreDisplay = link.score > 0 ? `<span class="link-score">⭐ ${link.score}/5</span>` : '';
          const notesDisplay = link.notes ? `<div class="link-notes">💭 ${link.notes}</div>` : '';
          const tagsDisplay = tags.length > 0 ? `<br>🏷️ ${tags.join(', ')}` : '';
          
          return `
            <div class="link-item">
                <div class="link-title">
                    <a href="${link.url}" target="_blank">${link.title}</a>
                </div>
                <div class="link-meta">
                    <span class="link-source">${link.source_site}</span>
                    ${scoreDisplay}
                    <span style="color: #9ca3af;">• ${new Date(link.saved_at || link.extracted_at).toLocaleDateString()}</span>
                    ${tagsDisplay}
                </div>
                ${notesDisplay}
            </div>
          `;
        }).join('')}
    </div>
    
    <div style="text-align: center; margin-top: 3rem; color: #6b7280; font-size: 0.9em;">
        Generated on ${now.toLocaleString()}
    </div>
</body>
</html>`;
  }

  async generateTagCloud(maxTags = 50, linksPerTag = 5) {
    try {
      // Get all tags with their frequencies
      const tagsQuery = `
        SELECT 
          json_each.value as tag,
          COUNT(*) as frequency,
          GROUP_CONCAT(id) as link_ids
        FROM links, json_each(links.tags)
        WHERE json_each.value != ''
        GROUP BY json_each.value
        ORDER BY frequency DESC
        LIMIT ?
      `;
      
      const tagData = await this.database.executeSql(tagsQuery, [maxTags]);
      
      if (tagData.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No tags found in the database.'
          }]
        };
      }

      // Generate HTML for tag cloud
      const html = this.generateTagCloudHtml(tagData, linksPerTag);
      const filePath = '/Users/robertgrayson/playground/luke_fun/tag_cloud.html';
      
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, html);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Generated interactive tag cloud with ${tagData.length} tags
📄 File: ${filePath}
🌐 Open the file in your browser to explore your tags interactively

Click any tag to see associated links!`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Error generating tag cloud: ${error.message}`
        }]
      };
    }
  }

  generateTagCloudHtml(tagData, linksPerTag) {
    // Calculate font sizes based on frequency
    const maxFreq = Math.max(...tagData.map(t => t.frequency));
    const minFreq = Math.min(...tagData.map(t => t.frequency));
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Tag Cloud</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #2d3748;
            margin-bottom: 2rem;
        }
        .tag-cloud {
            text-align: center;
            line-height: 2;
            margin-bottom: 2rem;
        }
        .tag {
            display: inline-block;
            margin: 0.5rem;
            padding: 0.5rem 1rem;
            background: #f7fafc;
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }
        .tag:hover {
            background: #e2e8f0;
            transform: scale(1.05);
            border-color: #4299e1;
        }
        .tag.selected {
            background: #4299e1;
            color: white;
            border-color: #2b6cb0;
        }
        .links-container {
            display: none;
            margin-top: 2rem;
            padding: 1.5rem;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 4px solid #4299e1;
        }
        .links-container.active {
            display: block;
        }
        .link-item {
            margin-bottom: 1rem;
            padding: 1rem;
            background: white;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .link-title {
            font-weight: 600;
            color: #2d3748;
        }
        .link-url {
            color: #4299e1;
            text-decoration: none;
            font-size: 0.9em;
        }
        .link-url:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏷️ Interactive Tag Cloud</h1>
        <p style="text-align: center; color: #718096; margin-bottom: 2rem;">
            Click on any tag to see associated links • ${tagData.length} total tags
        </p>
        
        <div class="tag-cloud">
            ${tagData.map(tag => {
              const fontSize = 0.8 + (tag.frequency - minFreq) / (maxFreq - minFreq) * 1.5;
              const opacity = 0.6 + (tag.frequency - minFreq) / (maxFreq - minFreq) * 0.4;
              
              return `<span class="tag" 
                data-tag="${tag.tag}" 
                style="font-size: ${fontSize}em; opacity: ${opacity};">
                ${tag.tag} (${tag.frequency})
              </span>`;
            }).join('')}
        </div>
        
        ${tagData.map(tag => `
          <div class="links-container" data-tag="${tag.tag}">
            <h3>Links tagged with "${tag.tag}" (${tag.frequency} total)</h3>
            <div id="links-${tag.tag}">
              Loading links...
            </div>
          </div>
        `).join('')}
    </div>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const tags = document.querySelectorAll('.tag');
            const linksContainers = document.querySelectorAll('.links-container');
            
            tags.forEach(tag => {
                tag.addEventListener('click', function() {
                    const tagName = this.getAttribute('data-tag');
                    
                    // Remove selected class from all tags
                    tags.forEach(t => t.classList.remove('selected'));
                    
                    // Add selected class to clicked tag
                    this.classList.add('selected');
                    
                    // Hide all link containers
                    linksContainers.forEach(container => {
                        container.classList.remove('active');
                    });
                    
                    // Show the corresponding links container
                    const targetContainer = document.querySelector('.links-container[data-tag="' + tagName + '"]');
                    if (targetContainer) {
                        targetContainer.classList.add('active');
                        targetContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            });
        });
    </script>
</body>
</html>`;
  }
}