import { type ReadableAtom, type MapStore } from "nanostores";
import type SprinculModel from "./SprinculModel";
import type { BoundDefaults } from "./types";
/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and event-listener wiring for a single model instance.
 */
export declare class SprinculCore {
    #private;
    instance: SprinculModel;
    private devMode;
    constructor(instance: SprinculModel, devMode?: boolean);
    static createStateProxy(stateStore: MapStore<Record<string, any>>, getCoreRef: () => SprinculCore | undefined): Record<string, any>;
    setupBindings(container: HTMLElement): BoundDefaults;
    processAddedElement(element: HTMLElement): void;
    /**
     * Reverses wire() for `element` and its descendants. Call before discarding a wired subtree.
     */
    unwireElement(element: HTMLElement): void;
    /**
     * Fires the initial data-bind-* callbacks and attaches the queued on* listeners from
     * setupBindings(). Call once beforeInit has genuinely finished, so a user interaction
     * can't reach a model method before its state is seeded.
     */
    runQueuedInitialCallbacks(): void;
    registerComputed(key: string, computedStore: ReadableAtom): void;
    getComputed(key: string): any;
    hasComputed(key: string): boolean;
    registerComputedFromModel(key: string, fn: () => any, dependencies: string[], stateStore: MapStore<Record<string, any>>): (() => void) | void;
    scheduleUpdate(key: string): void;
    destroy(): void;
}
