import {atom} from 'nanostores';
import {SprinculCore} from './SprinculCore';
import SprinculModel from './SprinculModel';
import type {SprinculModelConstructor, SprinculModelRegistry, SprinculModelInfo} from './types';
import { getCore, setCore, deleteCore, FLUSH_PENDING } from './registry';

/**
 * @class Sprincul
 * @description Static registry and factory. Manages model registration, initialization, and lifecycle.
 */
export default class Sprincul {
    static #registry: SprinculModelRegistry = new Map();
    static #devMode: boolean = false;
    static #isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    static #globalStores = new Map<string, ReturnType<typeof atom>>();
    static #processedElements = new WeakSet<HTMLElement>();
    static #readyCallbacks: Array<(models: SprinculModelInfo[]) => void> = [];

    static store = {
        get<T = any>(key: string): T | undefined {
            const store = Sprincul.#globalStores.get(key);
            return store ? (store.get() as T) : undefined;
        },
        set<T = any>(key: string, value: T): void {
            if (!Sprincul.#globalStores.has(key)) {
                Sprincul.#globalStores.set(key, atom<T>(value));
            }
            Sprincul.#globalStores.get(key)!.set(value);
        },
        subscribe<T = any>(key: string, callback: (value: T | undefined) => void): () => void {
            if (!Sprincul.#globalStores.has(key)) {
                // Initialize an atom that can hold undefined until a value is set
                Sprincul.#globalStores.set(key, atom<T | undefined>());
            }
            return Sprincul.#globalStores.get(key)!.listen(callback as (value: any) => void);
        },
        clear(): void {
            Sprincul.#globalStores.clear();
        }
    };

    /**
     * Register a single model class
     */
    static register(name: string, modelClass: SprinculModelConstructor) {
        Sprincul.#registry.set(name, modelClass);
    }

    /**
     * Register multiple model classes at once
     */
    static registerAll(models: Record<string, SprinculModelConstructor>) {
        for (const name in models) {
            Sprincul.#registry.set(name, models[name]);
        }
    }

    /**
     * Register a callback to be called when all models are initialized
     */
    static onReady(callback: (models: SprinculModelInfo[]) => void): void {
        if (!Sprincul.#isBrowser) {
            console.warn('[Sprincul] onReady() called in non-browser environment.');
            return;
        }

        Sprincul.#readyCallbacks.push(callback);
    }

    /**
     * Initialize all models on the page
     */
    static init(options?: { devMode?: boolean }): void {
        if (!Sprincul.#isBrowser) {
            console.warn('[Sprincul] init() called in non-browser environment. Skipping initialization.');
            return;
        }

        // Reset devMode each time init is called, then set it if specified
        Sprincul.#devMode = options?.devMode ?? false;

        const modelElements = Array.from(document.querySelectorAll('[data-model]'));
        const modelInfos: SprinculModelInfo[] = [];
        
        modelElements.forEach(element => {
            const info = Sprincul.processModelElement(element as HTMLElement);
            if (info) {
                modelInfos.push(info);
            }
        });
        
        // Remove page-level cloaks and fire ready callbacks after all afterInit hooks are called (not necessarily completed)
        document.querySelectorAll('[data-cloaked]:not([data-model])').forEach(element => {
            element.removeAttribute('data-cloaked');
        });
        
        Sprincul.#dispatchReadyEvents(modelInfos);
    }

    /**
     * Process a single model element
     * Creates both the user model instance and internal core instance
     */
    static processModelElement(element: HTMLElement): SprinculModelInfo | null {
        const modelName = element.dataset.model;
        if (!modelName) {
            throw new Error('Element is missing a "data-model" attribute');
        }

        const ModelClass = this.#registry.get(modelName);
        if (!ModelClass) {
            throw new Error(`The model, "${modelName}" is not registered for use.`);
        }

        if (Sprincul.#processedElements.has(element)) return null;
        Sprincul.#processedElements.add(element);

        // Create user's model instance, then link internal core instance
        const model = new ModelClass(element);
        const core = new SprinculCore(model, Sprincul.#devMode);
        setCore(model, core);

        // Flush any computed props that were added during construction
        if (typeof model[FLUSH_PENDING] === 'function') {
            model[FLUSH_PENDING]();
        }

        // Setup bindings
        core.setupBindings(element);

        // Run lifecycle hook (don't wait for it to complete)
        Sprincul.#runHook(model, 'afterInit')
            .then(() => {
                if (element.hasAttribute('data-cloaked')) {
                    element.removeAttribute('data-cloaked');
                }
            })
            .catch((error) => {
                console.error('Error in "afterInit" hook call:', error);
            });

        const modelInfo: SprinculModelInfo = { name: modelName, element };
        if (Sprincul.#devMode) {
            modelInfo.instance = model;
        }

        return modelInfo;
    }

    static destroy(model: SprinculModel): void {
        const core = getCore(model);
        if (core) {
            core.destroy();
            deleteCore(model);
        }
    }

    static #runHook(instance: SprinculModel, methodName: string): Promise<unknown> {
        const hook = Reflect.get(instance, methodName);
        if (typeof hook !== 'function') {
            return Promise.resolve(undefined);
        }

        return Promise.resolve().then(() => hook.call(instance));
    }

    static #dispatchReadyEvents(models: SprinculModelInfo[]) {
        const readyEvent = new CustomEvent('sprincul:ready', {
            bubbles: true,
            detail: { models }
        });
        document.dispatchEvent(readyEvent);

        Sprincul.#readyCallbacks.forEach(callback => {
            try {
                callback(models);
            } catch (error) {
                console.error('Error in onReady callback:', error);
            }
        });

        Sprincul.#readyCallbacks = [];
    }
}
