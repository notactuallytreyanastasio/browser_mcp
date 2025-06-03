export interface PlaywrightMCPConfig {
    serverCommand?: string;
    serverArgs?: string[];
    browser?: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
}
export interface BrowserAction {
    type: 'navigate' | 'click' | 'type' | 'screenshot' | 'close';
    params: Record<string, any>;
}
export interface ActionResult {
    success: boolean;
    data?: any;
    error?: string;
    screenshot?: string;
}
export interface ElementSnapshot {
    role: string;
    name: string;
    selector: string;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    text?: string;
    value?: string;
}
export interface LearningInteraction {
    timestamp: number;
    action: BrowserAction;
    element?: ElementSnapshot;
    result: ActionResult;
    context: {
        url: string;
        title: string;
        snapshot: ElementSnapshot[];
    };
}
export declare class PlaywrightMCPClient {
    private client;
    private transport;
    private serverProcess;
    private isConnected;
    private config;
    constructor(config?: PlaywrightMCPConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    navigate(url: string): Promise<ActionResult>;
    private sleep;
    click(selector: string): Promise<ActionResult>;
    type(selector: string, text: string): Promise<ActionResult>;
    takeScreenshot(fullPage?: boolean): Promise<ActionResult>;
    getAccessibilitySnapshot(): Promise<ElementSnapshot[]>;
    waitForSelector(selector: string, timeout?: number): Promise<ActionResult>;
    evaluateScript(script: string): Promise<ActionResult>;
    private executeAction;
    private getToolName;
    startLearningSession(sessionName: string, targetUrl: string): Promise<string>;
    captureInteraction(sessionId: string, action: BrowserAction, element?: ElementSnapshot): Promise<LearningInteraction>;
    isReady(): boolean;
    getConfig(): PlaywrightMCPConfig;
}
//# sourceMappingURL=playwright-mcp-client.d.ts.map