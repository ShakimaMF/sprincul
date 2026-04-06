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
    static #instancesByName = new Map<string, Set<SprinculModel>>();
    static #modelNames = new WeakMap<SprinculModel, string>();
    static #rootMutationObserver: MutationObserver | null = null;
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
        for (const [name, cls] of Object.entries(models)) {
            Sprincul.#registry.set(name, cls);
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
        Sprincul.#startRootDetachObserver();

        const modelElements = Array.from(document.querySelectorAll('[data-model]'));
        const modelInfos: SprinculModelInfo[] = [];
        
        modelElements.forEach(element => {
            try {
                const info = Sprincul.processModelElement(element as HTMLElement);
                if (info) {
                    modelInfos.push(info);
                }
            } catch (e) {
                console.error(`[Sprincul] Failed to process model element:`, e);
            }
        });
        
        // Remove page-level cloaks and fire ready callbacks after all afterInit hooks are called (not necessarily completed)
        document.querySelectorAll('[data-cloaked]:not([data-model])').forEach(element => {
            element.removeAttribute('data-cloaked');
        });
        
        Sprincul.#dispatchReadyEvents(modelInfos);
    }

    static #startRootDetachObserver(): void {
        if (!Sprincul.#isBrowser) return;
        if (Sprincul.#rootMutationObserver) return;

        Sprincul.#rootMutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    const removedElement = node as HTMLElement;

                    Sprincul.#destroyRemovedModelRoots(removedElement);
                    removedElement.querySelectorAll('[data-model]').forEach((nestedRoot) => {
                        Sprincul.#destroyRemovedModelRoots(nestedRoot as HTMLElement);
                    });
                }
            }
        });

        Sprincul.#rootMutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    static #destroyRemovedModelRoots(element: HTMLElement): void {
        const modelName = element.dataset.model;
        if (!modelName) return;
        Sprincul.destroy(modelName, element);
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
        Sprincul.#trackModelInstance(modelName, model);

        // Flush any computed props that were added during construction
        if (typeof model[FLUSH_PENDING] === 'function') {
            model[FLUSH_PENDING]();
        }

        // Setup bindings
        core.setupBindings(element);

        // Run lifecycle hook then, remove cloaking
        Sprincul.#runHook(model, 'afterInit')
            .catch(e => console.error('Error in "afterInit" hook call:', e))
            .finally(() => {
                if (element.hasAttribute('data-cloaked')) {
                    element.removeAttribute('data-cloaked');
                }
            })

        const modelInfo: SprinculModelInfo = { name: modelName, element };
        if (Sprincul.#devMode) {
            modelInfo.instance = model;
        }

        return modelInfo;
    }

    static destroy(modelName: string, element?: HTMLElement): void {
        const instances = Sprincul.#instancesByName.get(modelName);
        if (!instances || instances.size === 0) return;

        if (element) {
            const target = Array.from(instances).find(instance => instance.$el === element);
            if (target) {
                Sprincul.#destroyInstance(target);
            }
            return;
        }

        Array.from(instances).forEach(instance => {
            Sprincul.#destroyInstance(instance);
        });
    }

    static #destroyInstance(model: SprinculModel): void {
        const core = getCore(model);
        if (core) {
            core.destroy();
            deleteCore(model);
        }
        Sprincul.#processedElements.delete(model.$el);
        Sprincul.#untrackModelInstance(model);
    }

    static #trackModelInstance(modelName: string, model: SprinculModel): void {
        if (!Sprincul.#instancesByName.has(modelName)) {
            Sprincul.#instancesByName.set(modelName, new Set());
        }

        Sprincul.#instancesByName.get(modelName)!.add(model);
        Sprincul.#modelNames.set(model, modelName);
    }

    static #untrackModelInstance(model: SprinculModel): void {
        const modelName = Sprincul.#modelNames.get(model);
        if (!modelName) return;

        const instances = Sprincul.#instancesByName.get(modelName);
        if (!instances) return;

        instances.delete(model);
        if (instances.size === 0) {
            Sprincul.#instancesByName.delete(modelName);
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
