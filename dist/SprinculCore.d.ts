import type { ReadableAtom } from 'nanostores';
import SprinculModel from './SprinculModel';
/**
 * @class SprinculCore
 * @description Internal framework class. Handles all binding, computed properties, and DOM observation logic
 */
export declare class SprinculCore {
    #private;
    instance: SprinculModel;
    private devMode;
    constructor(instance: SprinculModel, devMode?: boolean);
    /**
     * Initialize bindings and start observing the model's element
     */
    setupBindings(container: HTMLElement): void;
    /**
     * Register a computed property
     */
    registerComputed(key: string, computedStore: ReadableAtom): void;
    /**
     * Get a computed property value
     */
    getComputed(key: string): any;
    /**
     * Check if a property is computed
     */
    hasComputed(key: string): boolean;
    /**
     * Schedule an update for a specific property
     */
    scheduleUpdate(key: string): void;
    /**
     * Clean up resources when instance is destroyed
     */
    destroy(): void;
}
