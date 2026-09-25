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
     * Initiate a one-time scan of every `[data-model]` element within `options.root` (default `document.body`).
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
     * Unmount a model instance from a specific element
     * @param element - The HTML element to unmount from
     * @param modelName - Optional model name to target specific instance
     */
    static unmount(element: HTMLElement, modelName?: string): void;
    /**
     * Destroy a model instance by name. If `element` is provided, destroy only that instance.
     * Otherwise, destroy all instances of the model.
     *
     * @param modelName
     * @param element
     */
    static destroy(modelName: string, element?: HTMLElement): void;
    static destroyAll(): void;
}
