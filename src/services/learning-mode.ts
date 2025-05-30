import type { Database } from '../types/index.js';
import type { 
  PlaywrightMCPClient, 
  LearningInteraction, 
  ElementSnapshot, 
  BrowserAction 
} from './playwright-mcp-client.js';

export interface LearningSession {
  id: string;
  name: string;
  targetSite: string;
  targetUrl: string;
  status: 'recording' | 'analyzing' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  interactions: LearningInteraction[];
  patterns: LearnedPattern[];
  metadata: {
    userAgent: string;
    viewport: { width: number; height: number };
    totalInteractions: number;
    successfulExtractions: number;
  };
}

export interface LearnedPattern {
  id: string;
  name: string;
  description: string;
  confidence: number;
  selectors: PatternSelector[];
  extractionRules: ExtractionRule[];
  validationResults: ValidationResult[];
  metadata: {
    learnedFrom: number; // number of interactions
    successRate: number;
    lastValidated: number;
  };
}

export interface PatternSelector {
  type: 'css' | 'xpath' | 'accessibility' | 'text';
  value: string;
  role: string; // title, link, score, comments, etc.
  confidence: number;
  fallbacks: string[]; // alternative selectors
}

export interface ExtractionRule {
  field: string; // title, url, score, etc.
  selector: PatternSelector;
  transform?: 'text' | 'href' | 'number' | 'date';
  required: boolean;
  validation?: string; // regex pattern
}

export interface ValidationResult {
  timestamp: number;
  url: string;
  success: boolean;
  extractedCount: number;
  expectedCount?: number;
  errors: string[];
  confidence: number;
}

export class LearningModeService {
  private activeSessions = new Map<string, LearningSession>();
  private patterns = new Map<string, LearnedPattern>();

  constructor(
    private mcpClient: PlaywrightMCPClient,
    private database: Database
  ) {}

  async startLearningSession(
    name: string, 
    targetUrl: string,
    options: {
      description?: string;
      expectedCount?: number;
      targetElements?: string[];
    } = {}
  ): Promise<LearningSession> {
    if (!this.mcpClient.isReady()) {
      throw new Error('Playwright MCP client is not ready. Please connect first.');
    }

    const sessionId = await this.mcpClient.startLearningSession(name, targetUrl);
    const domain = new URL(targetUrl).hostname;

    const session: LearningSession = {
      id: sessionId,
      name,
      targetSite: domain,
      targetUrl,
      status: 'recording',
      startedAt: Date.now(),
      interactions: [],
      patterns: [],
      metadata: {
        userAgent: 'LearningMode/1.0',
        viewport: this.mcpClient.getConfig().viewport || { width: 1280, height: 720 },
        totalInteractions: 0,
        successfulExtractions: 0
      }
    };

    this.activeSessions.set(sessionId, session);

    console.error(`🎓 Learning session started: ${name}`);
    console.error(`🌐 Target: ${targetUrl}`);
    console.error(`📝 Ready to record interactions...`);

    return session;
  }

  async recordClick(sessionId: string, elementDescription: string): Promise<LearningInteraction> {
    const session = this.getActiveSession(sessionId);
    
    // Get current accessibility snapshot to find the element
    const snapshot = await this.mcpClient.getAccessibilitySnapshot();
    
    // Try to find the element by description (smart matching)
    const targetElement = this.findElementByDescription(snapshot, elementDescription);
    
    if (!targetElement) {
      throw new Error(`Could not find element matching: ${elementDescription}`);
    }

    // Create click action
    const action: BrowserAction = {
      type: 'click',
      params: { selector: targetElement.selector }
    };

    // Capture the interaction
    const interaction = await this.mcpClient.captureInteraction(sessionId, action, targetElement);
    
    // Store interaction in session
    session.interactions.push(interaction);
    session.metadata.totalInteractions++;
    
    if (interaction.result.success) {
      session.metadata.successfulExtractions++;
    }

    console.error(`📍 Recorded click on: ${elementDescription}`);
    console.error(`✅ Success: ${interaction.result.success}`);

    return interaction;
  }

  async recordExtraction(sessionId: string, fieldName: string, elementDescription: string): Promise<void> {
    const session = this.getActiveSession(sessionId);
    
    // Get current page snapshot
    const snapshot = await this.mcpClient.getAccessibilitySnapshot();
    
    // Find all elements matching the description (for pattern learning)
    const elements = this.findElementsByDescription(snapshot, elementDescription);
    
    if (elements.length === 0) {
      throw new Error(`No elements found matching: ${elementDescription}`);
    }

    console.error(`🎯 Found ${elements.length} elements for field '${fieldName}'`);
    
    // Extract data from all matching elements
    for (const element of elements) {
      const extractedData = await this.extractDataFromElement(element, fieldName);
      
      // Store as a learning interaction
      const action: BrowserAction = {
        type: 'extract',
        params: { 
          field: fieldName,
          selector: element.selector,
          extractedData 
        }
      };

      const interaction = await this.mcpClient.captureInteraction(sessionId, action, element);
      session.interactions.push(interaction);
    }

    session.metadata.totalInteractions += elements.length;
  }

  async analyzeSession(sessionId: string): Promise<LearnedPattern[]> {
    const session = this.getActiveSession(sessionId);
    session.status = 'analyzing';

    console.error(`🔍 Analyzing ${session.interactions.length} interactions...`);

    const patterns = await this.generatePatternsFromInteractions(session.interactions);
    
    // Validate patterns
    for (const pattern of patterns) {
      const validation = await this.validatePattern(pattern, session.targetUrl);
      pattern.validationResults.push(validation);
      pattern.confidence = this.calculatePatternConfidence(pattern);
    }

    session.patterns = patterns;
    session.status = 'completed';
    session.completedAt = Date.now();

    // Save patterns to database
    await this.savePatternsToDatabase(session.targetSite, patterns);

    console.error(`✅ Analysis complete! Generated ${patterns.length} patterns`);
    
    return patterns;
  }

  async validatePattern(pattern: LearnedPattern, testUrl: string): Promise<ValidationResult> {
    console.error(`🧪 Validating pattern '${pattern.name}' on ${testUrl}`);

    try {
      // Navigate to test URL
      const navResult = await this.mcpClient.navigate(testUrl);
      if (!navResult.success) {
        return {
          timestamp: Date.now(),
          url: testUrl,
          success: false,
          extractedCount: 0,
          errors: [`Navigation failed: ${navResult.error}`],
          confidence: 0
        };
      }

      // Apply pattern and count successful extractions
      let extractedCount = 0;
      const errors: string[] = [];

      for (const rule of pattern.extractionRules) {
        try {
          const elements = await this.mcpClient.evaluateScript(`
            document.querySelectorAll('${rule.selector.value}').length
          `);

          if (elements.success) {
            const count = parseInt(elements.data.text);
            extractedCount += count;
          }
        } catch (error) {
          errors.push(`Rule '${rule.field}' failed: ${(error as Error).message}`);
        }
      }

      const success = extractedCount > 0 && errors.length === 0;
      const confidence = success ? Math.min(extractedCount / 10, 1.0) : 0; // Confidence based on extraction count

      return {
        timestamp: Date.now(),
        url: testUrl,
        success,
        extractedCount,
        errors,
        confidence
      };

    } catch (error) {
      return {
        timestamp: Date.now(),
        url: testUrl,
        success: false,
        extractedCount: 0,
        errors: [(error as Error).message],
        confidence: 0
      };
    }
  }

  async applyPattern(patternId: string, url: string): Promise<any[]> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    // Navigate to URL
    await this.mcpClient.navigate(url);

    // Extract data using pattern
    const results = [];
    
    for (const rule of pattern.extractionRules) {
      const script = `
        Array.from(document.querySelectorAll('${rule.selector.value}')).map(el => {
          let value = el.textContent || '';
          if ('${rule.transform}' === 'href') value = el.href || el.getAttribute('href') || '';
          if ('${rule.transform}' === 'number') value = parseInt(value) || 0;
          return { field: '${rule.field}', value, element: el.tagName };
        })
      `;

      const result = await this.mcpClient.evaluateScript(script);
      if (result.success) {
        results.push(...JSON.parse(result.data.text));
      }
    }

    return results;
  }

  private getActiveSession(sessionId: string): LearningSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`No active learning session found: ${sessionId}`);
    }
    return session;
  }

  private findElementByDescription(snapshot: ElementSnapshot[], description: string): ElementSnapshot | null {
    const desc = description.toLowerCase();
    
    // Try exact text match first
    let element = snapshot.find(el => 
      el.text?.toLowerCase().includes(desc) || 
      el.name?.toLowerCase().includes(desc)
    );
    
    if (!element) {
      // Try role-based matching
      if (desc.includes('link') || desc.includes('title')) {
        element = snapshot.find(el => el.role === 'link');
      } else if (desc.includes('button')) {
        element = snapshot.find(el => el.role === 'button');
      } else if (desc.includes('score') || desc.includes('point')) {
        element = snapshot.find(el => /\d+/.test(el.text || ''));
      }
    }

    return element || null;
  }

  private findElementsByDescription(snapshot: ElementSnapshot[], description: string): ElementSnapshot[] {
    const desc = description.toLowerCase();
    
    return snapshot.filter(el => {
      const matchesText = el.text?.toLowerCase().includes(desc) || el.name?.toLowerCase().includes(desc);
      const matchesRole = desc.includes(el.role);
      return matchesText || matchesRole;
    });
  }

  private async extractDataFromElement(element: ElementSnapshot, fieldName: string): Promise<any> {
    const script = `
      const el = document.querySelector('${element.selector}');
      if (!el) return null;
      
      let value = el.textContent || '';
      
      // Smart extraction based on field name
      if ('${fieldName}'.includes('url') || '${fieldName}'.includes('link')) {
        value = el.href || el.getAttribute('href') || value;
      } else if ('${fieldName}'.includes('score') || '${fieldName}'.includes('point')) {
        value = parseInt(value) || 0;
      }
      
      return {
        field: '${fieldName}',
        value: value,
        selector: '${element.selector}',
        role: '${element.role}'
      };
    `;

    const result = await this.mcpClient.evaluateScript(script);
    return result.success ? JSON.parse(result.data.text) : null;
  }

  private async generatePatternsFromInteractions(interactions: LearningInteraction[]): Promise<LearnedPattern[]> {
    // Group interactions by field type
    const fieldGroups = new Map<string, LearningInteraction[]>();
    
    interactions.forEach(interaction => {
      if (interaction.action.type === 'extract') {
        const field = interaction.action.params.field;
        if (!fieldGroups.has(field)) {
          fieldGroups.set(field, []);
        }
        fieldGroups.get(field)!.push(interaction);
      }
    });

    const patterns: LearnedPattern[] = [];

    // Generate pattern for each field group
    for (const [fieldName, fieldInteractions] of fieldGroups) {
      if (fieldInteractions.length < 2) continue; // Need at least 2 examples

      const pattern = await this.analyzeFieldInteractions(fieldName, fieldInteractions);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private async analyzeFieldInteractions(fieldName: string, interactions: LearningInteraction[]): Promise<LearnedPattern | null> {
    // Find common patterns in selectors
    const selectors = interactions.map(i => i.element?.selector).filter(Boolean) as string[];
    const commonSelector = this.findCommonSelector(selectors);

    if (!commonSelector) return null;

    const patternId = `pattern_${fieldName}_${Date.now()}`;
    
    return {
      id: patternId,
      name: `${fieldName}_extraction`,
      description: `Pattern for extracting ${fieldName} learned from ${interactions.length} examples`,
      confidence: 0.8, // Will be updated during validation
      selectors: [{
        type: 'css',
        value: commonSelector,
        role: fieldName,
        confidence: 0.8,
        fallbacks: selectors.slice(0, 3) // Keep top 3 as fallbacks
      }],
      extractionRules: [{
        field: fieldName,
        selector: {
          type: 'css',
          value: commonSelector,
          role: fieldName,
          confidence: 0.8,
          fallbacks: []
        },
        transform: this.inferTransform(fieldName),
        required: true
      }],
      validationResults: [],
      metadata: {
        learnedFrom: interactions.length,
        successRate: 1.0,
        lastValidated: Date.now()
      }
    };
  }

  private findCommonSelector(selectors: string[]): string | null {
    if (selectors.length === 0) return null;
    if (selectors.length === 1) return selectors[0]!;

    // Find the most common selector pattern
    const selectorCounts = new Map<string, number>();
    
    selectors.forEach(selector => {
      // Try to generalize selector by removing specific indices
      const generalized = selector.replace(/\[\d+\]/g, '');
      selectorCounts.set(generalized, (selectorCounts.get(generalized) || 0) + 1);
    });

    // Return the most common pattern
    let bestSelector = '';
    let maxCount = 0;
    
    for (const [selector, count] of selectorCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestSelector = selector;
      }
    }

    return bestSelector || selectors[0]!;
  }

  private inferTransform(fieldName: string): 'text' | 'href' | 'number' | 'date' {
    const field = fieldName.toLowerCase();
    
    if (field.includes('url') || field.includes('link') || field.includes('href')) {
      return 'href';
    } else if (field.includes('score') || field.includes('point') || field.includes('count')) {
      return 'number';
    } else if (field.includes('date') || field.includes('time')) {
      return 'date';
    } else {
      return 'text';
    }
  }

  private calculatePatternConfidence(pattern: LearnedPattern): number {
    if (pattern.validationResults.length === 0) return 0.5;
    
    const avgConfidence = pattern.validationResults.reduce((sum, result) => sum + result.confidence, 0) / pattern.validationResults.length;
    const successRate = pattern.validationResults.filter(r => r.success).length / pattern.validationResults.length;
    
    return (avgConfidence * 0.7) + (successRate * 0.3);
  }

  private async savePatternsToDatabase(domain: string, patterns: LearnedPattern[]): Promise<void> {
    for (const pattern of patterns) {
      try {
        await this.database.savePattern(domain, {
          name: pattern.name,
          description: pattern.description,
          selectors: pattern.selectors.map(s => s.value),
          sampleData: {
            confidence: pattern.confidence,
            extractionRules: pattern.extractionRules,
            metadata: pattern.metadata
          }
        });
        
        console.error(`💾 Saved pattern: ${pattern.name} for ${domain}`);
      } catch (error) {
        console.error(`Failed to save pattern ${pattern.name}:`, error);
      }
    }
  }

  getActiveSessions(): LearningSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSession(sessionId: string): LearningSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session && session.status === 'recording') {
      await this.analyzeSession(sessionId);
    }
    this.activeSessions.delete(sessionId);
  }
}