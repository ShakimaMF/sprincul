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
    /**
     * Wires `content` to this model. Content already in the model is brought in line with what it holds now: what
     * was wired through it and has since gone is released, and what's new is bound.
     */
    processAddedElement(content: HTMLElement | DocumentFragment): void;
    /**
     * Releases what wiring `element` registered, even if since removed from it, and what was wired anywhere inside it.
     * The model's own markup stays bound, so a callback can unwire the container it was handed.
     */
    unwireElement(element: HTMLElement): void;
    /**
     * Applies a change to one of this model's data-watch elements: everything bound inside the elements removed from
     * it is released, and the elements added to it are bound. An element moved within it stays bound.
     */
    applyWatchedChanges(watched: HTMLElement, added: Set<Element>, removed: Set<Element>): void;
    /**
     * Fires the initial data-bind-* callbacks and attaches the queued data-on-* listeners from setupBindings().
     * Call once beforeInit has genuinely finished, so a user interaction can't reach a model method before its
     * state is seeded.
     */
    runQueuedInitialCallbacks(): void;
    registerComputed(key: string, computedStore: ReadableAtom): void;
    getComputed(key: string): any;
    hasComputed(key: string): boolean;
    registerComputedFromModel(key: string, fn: () => any, dependencies: string[], stateStore: MapStore<Record<string, any>>): (() => void) | void;
    scheduleUpdate(key: string): void;
    destroy(): void;
    /** Dev-mode warning on behalf of the model. */
    warn(message: string): void;
}
