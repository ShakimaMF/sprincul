import {atom, computed, map, type MapStore, type ReadableAtom} from 'nanostores';
import type {SprinculModel, SprinculModelRegistry, SprinculModelConstructor} from './types';

export default class Sprincul {
    $el: HTMLElement;
    $state: MapStore<Record<string, any>>;
    state!: Record<string, any>;

    #bindings = new Map<string, Set<{ element: HTMLElement, callback: string }>>();
    #computed = new Map<string, ReadableAtom>();
    #mutationObserver: MutationObserver | undefined;
    #pendingUpdates = new Set<string>();
    #updateScheduled: boolean = false;

    static #devMode: boolean = false;
    static #registry: SprinculModelRegistry = new Map();
    static #globalStores = new Map<string, ReturnType<typeof atom>>();
    static #processedElements = new WeakSet<HTMLElement>();
    static #instanceRegistry = new WeakMap<Sprincul, (container: HTMLElement) => void>();

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

    constructor(element: HTMLElement) {
        this.$el = element;
        this.$state = map<Record<string, any>>({});
        this.$state.listen((_, __, changed) => {
            if (!changed) return;
            this.#scheduleUpdate(changed as string);
        });
        this.#setupStateProxy();
        Sprincul.#instanceRegistry.set(this, (container) => this.#setupBindings(container));
    }

    afterInit?(): void;

    static register(name: string, modelClass: typeof Sprincul) {
        Sprincul.#registry.set(name, modelClass as any);
    }

    static init(options?: { devMode?: boolean }) {
        if (options?.devMode) {
            Sprincul.#devMode = true;
        }
        document.querySelectorAll('[data-model]').forEach(element => {
            Sprincul.processModelElement(element as HTMLElement);
        });
        document.querySelectorAll('[data-cloaked]').forEach(element => {
            element.removeAttribute('data-cloaked');
        })
    }

    #scheduleUpdate(key: string) {
        this.#pendingUpdates.add(key);
        if (!this.#updateScheduled) {
            this.#updateScheduled = true;
            requestAnimationFrame(() => {
                this.#pendingUpdates.forEach(prop => this.#updateDependentElements(prop));
                this.#pendingUpdates.clear();
                this.#updateScheduled = false;
            });
        }
    }

    #setupStateProxy() {
        this.state = new Proxy({}, {
            get: (_, prop: string) => {
                if (this.#computed.has(prop)) {
                    return this.#computed.get(prop)!.get();
                }
                return this.$state.get()[prop];
            },
            set: (_, prop: string, value: any) => {
                this.$state.setKey(prop, value);
                return true;
            }
        });
    }

    static #runHook(instance: SprinculModel, methodName: string): Promise<unknown> {
        const hook = Reflect.get(instance, methodName);
        if (typeof hook !== 'function') {
            return Promise.resolve(undefined);
        }

        return Promise.resolve().then(() => hook.call(instance));
    }

    static processModelElement(element: HTMLElement) {
        const modelName = element.dataset.model;
        if (!modelName) {
            throw new Error('Element is missing a "data-model" attribute');
        }

        const ModelClass: SprinculModelConstructor|undefined = this.#registry.get(modelName);
        if (!ModelClass) {
            throw new Error(`The model, "${modelName}" is not registered for use.`);
        }

        if (Sprincul.#processedElements.has(element)) return;
        Sprincul.#processedElements.add(element);

        const model: SprinculModel = new ModelClass(element);
        if (!(model instanceof Sprincul)) {
            throw new Error(`The model, "${modelName}" must be an instance of Sprincul.`);
        }

        Sprincul.#instanceRegistry.get(model)?.(element);
        Sprincul.#instanceRegistry.delete(model);
        void Sprincul.#runHook(model, 'afterInit').catch((error) => {
            console.error('Error in "afterInit" hook call:', error);
        });
    }

    #setupBindings(container: HTMLElement = this.$el) {
        // Process container itself if it has data-bind-* attributes
        this.#processElementBindings(container);

        // Process all descendants
        container.querySelectorAll('*').forEach(el => {
            const element = el as HTMLElement;
            const closestModelElement = element.closest('[data-model]');

            // Skip nested model elements - they will be processed by their own instance
            if (element.hasAttribute('data-model') && element !== container) return;
            if (closestModelElement !== this.$el) return;

            this.#processElementBindings(element);
        });

        // Watch for removed descendants and purge them from #bindings to prevent memory leaks
        this.#mutationObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    this.#purgeElement(node);
                    node.querySelectorAll('*').forEach(child => {
                        if (child instanceof HTMLElement) this.#purgeElement(child);
                    });
                }
            }
        });
        this.#mutationObserver?.observe(this.$el, {childList: true, subtree: true});
    }

    /**
     * Add a computed property that derives its value from state
     * The computed property will re-calculate only when the specified dependencies change
     * Example: this.addComputedProp('total', () => this.state.price * this.state.quantity, ['price', 'quantity'])
     *
     * @param key - The computed property name
     * @param fn - Function that returns the computed value
     * @param dependencies - Array of state keys this computed property depends on.
     *                       Without dependencies, the computed value is still accessible via state
     *                       but bound elements will not re-render when it changes.
     */
    addComputedProp(key: string, fn: () => any, dependencies: Array<string> = []) {

        if (dependencies.length === 0) {
            console.warn(`[Sprincul] addComputedProp("${key}") called without dependencies. Bound elements will not re-render when the value changes.`);
        }

        // Create a computed store that recalculates when dependencies change
        const computedStore = computed(this.$state, fn.bind(this));
        this.#computed.set(key, computedStore);

        // Subscribe only to the specific state keys this computed depends on
        if (dependencies.length > 0) {
            this.$state.listen((_, __, changed) => {
                // Only update if one of our dependencies changed
                if (changed && dependencies.includes(changed as string)) {
                    this.#scheduleUpdate(key);
                }
            });
        }
    }

    // Process all data-bind-* attributes and on* event handlers for an element
    #processElementBindings(element: HTMLElement) {
        Array.from(element.attributes).forEach(attr => {
            // Handle data-bind-* attributes for reactive property bindings (e.g. data-bind-<prop>="callbackFn")
            if (attr.name.startsWith('data-bind-')) {
                const propertyName = attr.name.substring('data-bind-'.length); // The state property to watch
                const callbackName = attr.value; // The callback to call when it changes

                // Track this binding: when propertyName changes, update this element
                this.#trackBinding(propertyName, element, callbackName);

                // Call the callback initially
                const bindFn = Reflect.get(this, callbackName);
                if (typeof bindFn === 'function') {
                    try {
                        bindFn.call(this, element);
                    } catch (error) {
                        console.error(`Error in binding callback "${callbackName}" for property "${propertyName}":`, error);
                    }
                } else {
                    this.#warn(`Binding callback "${callbackName}" not found for data-bind-${propertyName}.`);
                }
            }

            // Handle on* event attributes (onclick, onkeydown, etc.)
            else if (attr.name.startsWith('on') && attr.name.length > 2) {
                const eventName = attr.name.substring(2); // Remove 'on' prefix
                const methodName = attr.value;

                // Bind the event to the model method
                const eventFn = Reflect.get(this, methodName);
                if (typeof eventFn === 'function') {
                    element.addEventListener(eventName, (e: Event) => {
                        try {
                            eventFn.call(this, e);
                        } catch (error) {
                            console.error(`Error in event handler "${methodName}" for event "${eventName}":`, error);
                        }
                    });
                    element.removeAttribute(attr.name);
                } else {
                    this.#warn(`Event handler method "${methodName}" not found for ${attr.name}.`);
                }
            }
        });
    }

    #trackBinding(prop: string, element: HTMLElement, callback: string) {
        if (!this.#bindings.has(prop)) {
            this.#bindings.set(prop, new Set());
        }
        this.#bindings.get(prop)!.add({element, callback});
    }

    #purgeElement(element: HTMLElement) {
        this.#bindings.forEach(bindings => {
            bindings.forEach(binding => {
                if (binding.element === element) bindings.delete(binding);
            });
        });
    }

    #updateDependentElements(prop: string) {
        const dependentElements = this.#bindings.get(prop);
        if (!dependentElements) return;

        dependentElements.forEach(binding => {
            this.#updateElement(binding);
        });
    }

    #updateElement(binding: { element: HTMLElement, callback: string }) {
        const fn = Reflect.get(this, binding.callback);
        if (typeof fn === 'function') {
            try {
                fn.call(this, binding.element);
            } catch (error) {
                console.error(`Error in binding callback "${binding.callback}":`, error);
            }
        }
    }

    #warn(message: string) {
        if (!Sprincul.#devMode) return;
        console.warn(`[Sprincul] ${message}`);
    }
}
