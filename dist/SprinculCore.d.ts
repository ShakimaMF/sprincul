import { type ReadableAtom, type MapStore } from 'nanostores';
import SprinculModel from './SprinculModel';
/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and DOM observation logic
 */
export declare class SprinculCore {
    #private;
    instance: SprinculModel;
    private devMode;
    /**
     * Create a state proxy for a model
     * Static factory method to create the reactive state proxy
     */
    static createStateProxy(stateStore: MapStore<Record<string, any>>, getCoreRef: () => SprinculCore | undefined): Record<string, any>;
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
     * Register a computed property from the model
     * Internal method called by SprinculModel.addComputedProp()
     */
    registerComputedFromModel(key: string, fn: () => any, dependencies: string[], stateStore: MapStore<Record<string, any>>): (() => void) | void;
    /**
     * Schedule an update for a specific property
     */
    scheduleUpdate(key: string): void;
    /**
     * Clean up resources when instance is destroyed
     */
    destroy(): void;
}
