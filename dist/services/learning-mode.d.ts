import type { Database } from '../types/index.js';
import type { PlaywrightMCPClient, LearningInteraction } from './playwright-mcp-client.js';
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
        viewport: {
            width: number;
            height: number;
        };
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
        learnedFrom: number;
        successRate: number;
        lastValidated: number;
    };
}
export interface PatternSelector {
    type: 'css' | 'xpath' | 'accessibility' | 'text';
    value: string;
    role: string;
    confidence: number;
    fallbacks: string[];
}
export interface ExtractionRule {
    field: string;
    selector: PatternSelector;
    transform?: 'text' | 'href' | 'number' | 'date';
    required: boolean;
    validation?: string;
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
export declare class LearningModeService {
    private mcpClient;
    private database;
    private activeSessions;
    private patterns;
    constructor(mcpClient: PlaywrightMCPClient, database: Database);
    startLearningSession(name: string, targetUrl: string, options?: {
        description?: string;
        expectedCount?: number;
        targetElements?: string[];
    }): Promise<LearningSession>;
    recordClick(sessionId: string, elementDescription: string): Promise<LearningInteraction>;
    recordExtraction(sessionId: string, fieldName: string, elementDescription: string): Promise<void>;
    analyzeSession(sessionId: string): Promise<LearnedPattern[]>;
    validatePattern(pattern: LearnedPattern, testUrl: string): Promise<ValidationResult>;
    applyPattern(patternId: string, url: string): Promise<any[]>;
    private getActiveSession;
    private findElementByDescription;
    private findElementsByDescription;
    private extractDataFromElement;
    private generatePatternsFromInteractions;
    private analyzeFieldInteractions;
    private findCommonSelector;
    private inferTransform;
    private calculatePatternConfidence;
    private savePatternsToDatabase;
    getActiveSessions(): LearningSession[];
    getSession(sessionId: string): LearningSession | undefined;
    endSession(sessionId: string): Promise<void>;
}
//# sourceMappingURL=learning-mode.d.ts.map