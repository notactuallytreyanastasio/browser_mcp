// Error types
export class DatabaseError extends Error {
    originalError;
    constructor(message, originalError) {
        super(message);
        this.originalError = originalError;
        this.name = 'DatabaseError';
    }
}
export class BrowserError extends Error {
    originalError;
    constructor(message, originalError) {
        super(message);
        this.originalError = originalError;
        this.name = 'BrowserError';
    }
}
export class ExtractionError extends Error {
    site;
    originalError;
    constructor(message, site, originalError) {
        super(message);
        this.site = site;
        this.originalError = originalError;
        this.name = 'ExtractionError';
    }
}
//# sourceMappingURL=index.js.map