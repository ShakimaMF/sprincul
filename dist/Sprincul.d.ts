import SprinculModel from './SprinculModel';
import type { SprinculModelConstructor, SprinculModelInfo } from './types';
/**
 * @class Sprincul
 * @description Static registry and factory. Manages model registration, initialization, and lifecycle.
 */
export default class Sprincul {
    #private;
    static store: {
        get<T = any>(key: string): T | undefined;
        set<T = any>(key: string, value: T): void;
        subscribe<T = any>(key: string, callback: (value: T | undefined) => void): () => void;
        clear(): void;
    };
    /**
     * Register a single model class
     */
    static register(name: string, modelClass: SprinculModelConstructor): void;
    /**
     * Register multiple model classes at once
     */
    static registerAll(models: Record<string, SprinculModelConstructor>): void;
    /**
     * Register a callback to be called when all models are initialized
     */
    static onReady(callback: (models: SprinculModelInfo[]) => void): void;
    /**
     * Initialize all models on the page
     */
    static init(options?: {
        devMode?: boolean;
    }): void;
    /**
     * Process a single model element
     * Creates both the user model instance and internal core instance
     */
    static processModelElement(element: HTMLElement): SprinculModelInfo | null;
    static destroy(model: SprinculModel): void;
}
