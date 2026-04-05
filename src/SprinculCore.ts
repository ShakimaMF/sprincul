import type {ReadableAtom} from 'nanostores';
import SprinculModel from './SprinculModel';

/**
 * @class SprinculCore
 * @description Internal framework class. Handles all binding, computed properties, and DOM observation logic
 */
export class SprinculCore {
    #bindings = new Map<string, Set<{ element: HTMLElement, callback: string }>>();
    #computed = new Map<string, ReadableAtom>();
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

    /**
     * Initialize bindings and start observing the model's element
     */
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

    /**
     * Register a computed property
     */
    registerComputed(key: string, computedStore: ReadableAtom) {
        this.#computed.set(key, computedStore);
    }

    /**
     * Get a computed property value
     */
    getComputed(key: string): any {
        return this.#computed.get(key)?.get();
    }

    /**
     * Check if a property is computed
     */
    hasComputed(key: string): boolean {
        return this.#computed.has(key);
    }

    /**
     * Schedule an update for a specific property
     */
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

    /**
     * Clean up resources when instance is destroyed
     */
    destroy() {
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

                // Bind the event to the model method
                const eventFn = Reflect.get(this.instance, methodName);
                if (typeof eventFn === 'function') {
                    element.addEventListener(eventName, (e: Event) => {
                        try {
                            eventFn.call(this.instance, e);
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
