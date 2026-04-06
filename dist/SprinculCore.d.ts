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
    constructor(instance: SprinculModel, devMode?: boolean);
    static createStateProxy(stateStore: MapStore<Record<string, any>>, getCoreRef: () => SprinculCore | undefined): Record<string, any>;
    setupBindings(container: HTMLElement): void;
    registerComputed(key: string, computedStore: ReadableAtom): void;
    getComputed(key: string): any;
    hasComputed(key: string): boolean;
    registerComputedFromModel(key: string, fn: () => any, dependencies: string[], stateStore: MapStore<Record<string, any>>): (() => void) | void;
    scheduleUpdate(key: string): void;
    destroy(): void;
}
