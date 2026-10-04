import SprinculModel from "./SprinculModel";
import type { SprinculInitOptions, SprinculModelConstructor, SprinculModelInfo, SprinculMountOptions } from "./types";
/**
 * @class Sprincul
 * @description Static registry and factory. Manages model registration, initialization, and lifecycle.
 */
export default class Sprincul {
    #private;
    static store: {
        get<T = any>(key: string): T | undefined;
        set<T = any>(key: string, value: T): void;
        /**
         * Listen for changes to a key. Pass `options.signal` (e.g. a model's `$signal`) to unsubscribe when it aborts.
         */
        subscribe<T = any>(key: string, callback: (value: T | undefined) => void, options?: {
            signal?: AbortSignal;
        }): () => void;
        clear(): void;
    };
    /**
     * Register a single model class
     */
    static register(name: string, modelClass: SprinculModelConstructor): void;
    /**
     * Register multiple model classes at once, each under its key. Takes an object literal or a module namespace
     * (`import * as models`) whose exports are all models; any value that isn't one is skipped with a warning.
     */
    static registerAll<T extends {
        [K in keyof T]: SprinculModelConstructor;
    }>(models: T): void;
    /**
     * Mount every registered `[data-model]` element within `options.root` (default `document.body`), the root included.
     * Elements already mounted are skipped, so it is safe to call again on content added later.
     * Nested models mount before the models containing them, so a parent's `afterInit()` finds its children mounted.
     *
     * @param {SprinculInitOptions} options
     *
     * @return {void}
     */
    static init(options?: SprinculInitOptions): void;
    /**
     * Process a single model element
     * Creates both the user model instance and internal core instance
     *
     * @param {HTMLElement} element
     * @param {Boolean} devMode
     *
     * @returns The model info, or `null` if the element couldn't be processed
     */
    static processModelElement(element: HTMLElement, devMode?: boolean): SprinculModelInfo | null;
    /**
     * Manually mount a model instance on a specific element
     *
     * @param element - The HTML element to bind to
     * @param modelClassOrName - Either a registered model class or the name of a registered model
     * @param options
     *
     * @returns The created model instance
     */
    static mount<T extends SprinculModel = SprinculModel>(element: HTMLElement, modelClassOrName: SprinculModelConstructor | string, options?: SprinculMountOptions): T;
    /**
     * Tear down the model on `element` and every model inside it. A parent's `beforeDestroy()` settles
     * before its nested models are torn down, so it can still reach them.
     * The reverse of `init({ root })`: `element` doesn't need a model of its own.
     *
     * @param element - The element whose models to tear down
     * @returns A promise that resolves once every `beforeDestroy()` has settled and teardown is complete
     */
    static unmount(element: HTMLElement): Promise<void>;
    /**
     * @deprecated An element has only one model, so pass just the element: `unmount(element)`, which also
     * tears down the models inside it. This form tears down only the model on `element`, if it is named `modelName`.
     */
    static unmount(element: HTMLElement, modelName: string): Promise<void>;
    /**
     * Tear down every instance of a model, the same way as `unmount()`.
     *
     * @param modelName - The registered model name
     * @returns A promise that resolves once every `beforeDestroy()` has settled and teardown is complete
     */
    static destroy(modelName: string): Promise<void>;
    /**
     * @deprecated Use `unmount(element)` to tear down the model on an element. This form tears down only
     * the model on `element`, if it is named `modelName`.
     */
    static destroy(modelName: string, element: HTMLElement): Promise<void>;
    /**
     * Destroy every live model, the same way as `unmount()`. It also reaches models
     * whose elements have already left the page.
     *
     * @returns A promise that resolves once every `beforeDestroy()` has settled and teardown is complete
     */
    static destroyAll(): Promise<void>;
}
