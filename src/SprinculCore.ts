import {computed, type ReadableAtom, type MapStore} from 'nanostores';
import SprinculModel from './SprinculModel';
import type {DomListenerRecord} from './types';

/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and DOM observation logic
 */
export class SprinculCore {
    #bindings = new Map<string, Set<{ element: HTMLElement, callback: string }>>();
    #computed = new Map<string, ReadableAtom>();
    #domListeners = new Set<DomListenerRecord>();
    #unsubscribers = new Set<() => void>();
    #mutationObserver: MutationObserver | undefined;
    #pendingUpdates = new Set<string>();
    #updateScheduled: boolean = false;
    readonly #isBrowser: boolean;

    constructor(
        public instance: SprinculModel,
        private devMode: boolean = false
    ) {
        this.#isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    }

    static createStateProxy(
        stateStore: MapStore<Record<string, any>>,
        getCoreRef: () => SprinculCore | undefined
    ): Record<string, any> {
        return new Proxy({}, {
            get: (_, prop: string) => {
                const core = getCoreRef();
                if (core?.hasComputed(prop)) {
                    return core?.getComputed(prop);
                }
                return stateStore.get()[prop];
            },
            set: (_, prop: string, value: any) => {
                stateStore.setKey(prop, value);
                return true;
            }
        });
    }

    setupBindings(container: HTMLElement) {
        // Process container itself if it has data-bind-* attributes
        this.#processElementBindings(container);

        // Process all descendants
        container.querySelectorAll('*').forEach(el => {
            const element = el as HTMLElement;
            const closestModelElement = element.closest('[data-model]');

            // Skip nested model elements - they will be processed by their own instance
            if (element.hasAttribute('data-model') && element !== container) return;
            if (closestModelElement !== this.instance.$el) return;

            this.#processElementBindings(element);
        });

        // Watch for removed descendants and purge them from #bindings to prevent memory leaks
        if (this.#isBrowser) {
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
            this.#mutationObserver?.observe(this.instance.$el, {childList: true, subtree: true});
        }
    }

    registerComputed(key: string, computedStore: ReadableAtom) {
        this.#computed.set(key, computedStore);
    }

    getComputed(key: string): any {
        return this.#computed.get(key)?.get();
    }

    hasComputed(key: string): boolean {
        return this.#computed.has(key);
    }

    registerComputedFromModel(
        key: string,
        fn: () => any,
        dependencies: string[],
        stateStore: MapStore<Record<string, any>>
    ): (() => void) | void {
        // Create a computed store that recalculates when dependencies change
        const computedStore = computed(stateStore, fn);
        
        // Register with core
        this.registerComputed(key, computedStore);

        // Subscribe only to the specific state keys this computed depends on
        if (dependencies.length > 0) {
            const unsubscribe = stateStore.listen((_, __, changed) => {
                // Only update if one of our dependencies changed
                if (changed && dependencies.includes(changed as string)) {
                    this.scheduleUpdate(key);
                }
            });
            
            // Store unsubscribe function for automatic cleanup
            this.#unsubscribers.add(unsubscribe);
            
            // Return wrapped unsubscribe function for manual cleanup
            return () => {
                this.#unsubscribers.delete(unsubscribe);
                unsubscribe();
            };
        }
    }

    scheduleUpdate(key: string) {
        if (!this.#isBrowser) return;
        
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

    destroy() {
        // Clean up computed property listeners
        this.#unsubscribers.forEach(unsubscribe => unsubscribe());
        this.#unsubscribers.clear();

        // Clean up DOM event listeners registered from on* attributes
        this.#domListeners.forEach(({element, type, listener, options}) => {
            element.removeEventListener(type, listener, options);
        });
        this.#domListeners.clear();
        this.#mutationObserver?.disconnect();
        this.#bindings.clear();
        this.#computed.clear();
        this.#pendingUpdates.clear();
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
                const bindFn = Reflect.get(this.instance, callbackName);
                if (typeof bindFn === 'function') {
                    try {
                        bindFn.call(this.instance, element);
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
                element.removeAttribute(attr.name);

                // Bind the event to the model method
                const eventFn = Reflect.get(this.instance, methodName);
                if (typeof eventFn === 'function') {
                    const listener: EventListener = (e: Event) => {
                        try {
                            eventFn.call(this.instance, e);
                        } catch (error) {
                            console.error(`Error in event handler "${methodName}" for event "${eventName}":`, error);
                        }
                    };

                    element.addEventListener(eventName, listener);
                    this.#domListeners.add({ element, type: eventName, listener });
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

        this.#domListeners.forEach(record => {
            if (record.element !== element) return;
            record.element.removeEventListener(record.type, record.listener, record.options);
            this.#domListeners.delete(record);
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
        const fn = Reflect.get(this.instance, binding.callback);
        if (typeof fn === 'function') {
            try {
                fn.call(this.instance, binding.element);
            } catch (error) {
                console.error(`Error in binding callback "${binding.callback}":`, error);
            }
        }
    }

    #warn(message: string) {
        if (!this.devMode) return;
        console.warn(`[Sprincul] ${message}`);
    }
}
