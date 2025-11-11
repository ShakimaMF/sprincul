// @ts-ignore - morphdom types not available
import morphdom from 'morphdom';
import {Utils} from './utils';
import type {SprinculModelRegistry, KeyedHTMLElement} from './types';

export default class Sprincul {
    [key: string]: any;
    $el: HTMLElement;
    state: Record<string, any> = {};

    static #registry: SprinculModelRegistry = new Map();
    static devMode: boolean = false;
    static sanitizeHtml: boolean = false;

    #bindings = new Map<string, Set<HTMLElement>>();
    #bindingHandlers = new Map<string, any>();
    #bindingCache = new WeakMap<HTMLElement, Map<string, any>>();

    #collectionTemplates = new Map<string, { container: HTMLElement; template: Node }>();

    #computed = new Map<string, (...args: any[]) => any>();
    #computedPropMap = new Map<string, string[]>();
    #reverseDependenciesMap = new Map<string, string[]>();

    // Track which properties trigger updates for each handler on each element
    #handlerSignals = new WeakMap<HTMLElement, Map<string, Set<string>>>();

    // For cleanup of event listeners
    #abortController = new AbortController();
    #collectionControllers = new WeakMap<HTMLElement, AbortController>();

    // For batching state updates
    #pendingUpdates = new Set<string>();
    // noinspection TypeScriptFieldCanBeMadeReadonly
    #debouncedUpdate?: Function;

    // Global store for cross-model communication
    static #store = new Map<string, any>();
    static #storeSubscribers = new Map<string, Set<{model: Sprincul, callback: Function}>>();
    #storeSubscriptions = new Map<string, {model: Sprincul, callback: Function}>();

    static store = {
        get(key: string) {
            return Sprincul.#store.get(key);
        },
        set(key: string, value: any) {
            const oldValue = Sprincul.#store.get(key);
            Sprincul.#store.set(key, value);

            if (!Object.is(oldValue, value)) {
                // Notify all subscribers
                const subscribers = Sprincul.#storeSubscribers.get(key);
                subscribers?.forEach(({model, callback}) => {
                    try {
                        callback.call(model, value, oldValue);
                    } catch (error) {
                        console.error(`Error in store subscriber callback for key "${key}":`, error);
                    }
                });
            }
        },
        clear() {
            Sprincul.#store.clear();
            Sprincul.#storeSubscribers.clear();
        }
    };

    constructor(element: HTMLElement) {
        this.$el = element;
        this.#initBindingHandlers();
        this.#setupCollectionTemplates();

        // Create debounced update function once and reuse it
        this.#debouncedUpdate = Utils.debounce(() => {
            this.#pendingUpdates.forEach(prop => this.#updateDependentElements(prop));
            this.#pendingUpdates.clear();
            // Apply dynamic attributes once after all updates complete
            Utils.applyDynamicAttributes(this.$el, this.state);
        });

        this.#setupStateProxy();
    }

    static register(name: string, modelClass: typeof Sprincul) {
        Sprincul.#registry.set(name, modelClass as any);
    }

    static init(options?: { devMode?: boolean, sanitizeHtml?: boolean }) {
        if (options?.devMode) {
            Sprincul.devMode = true;
        }
        if (options?.sanitizeHtml) {
            Sprincul.sanitizeHtml = true;
        }
        document.querySelectorAll('[data-model]').forEach(element => {
            Utils.processModelElement(this.#registry, element as HTMLElement);
        });
        document.querySelectorAll('[data-cloaked]').forEach(element => {
            element.removeAttribute('data-cloaked');
        })
    }

    addComputedProp(key: string, fn: (...args: any[]) => any, dependencies: Array<string> = []) {
        this.#computed.set(key, fn.bind(this));
        this.#computedPropMap.set(key, dependencies);
        dependencies.forEach(dep => {
            if (!this.#reverseDependenciesMap.has(dep)) {
                this.#reverseDependenciesMap.set(dep, []);
            }
            this.#reverseDependenciesMap.get(dep)!.push(key);
        });
    }

    /**
     * Subscribe to a global store value
     * The callback is called immediately with the current value and whenever the value changes
     */
    subscribeToStore(key: string, callback: (value: any, oldValue?: any) => void) {
        if (!Sprincul.#storeSubscribers.has(key)) {
            Sprincul.#storeSubscribers.set(key, new Set());
        }

        const subscription = {model: this, callback};
        Sprincul.#storeSubscribers.get(key)!.add(subscription);

        // Track for cleanup
        this.#storeSubscriptions.set(key, subscription);

        // Call immediately with current value
        const currentValue = Sprincul.#store.get(key);
        if (currentValue !== undefined) {
            try {
                callback.call(this, currentValue, undefined);
            } catch (error) {
                console.error(`Error in store subscriber callback for key "${key}":`, error);
            }
        }
    }

    /**
     * Clean up all event listeners and resources.
     * Call this when removing a model from the page to prevent memory leaks.
     */
    destroy() {
        // Abort all event listeners on the main model
        this.#abortController.abort();

        // Cleanup store subscriptions
        this.#storeSubscriptions.forEach((subscription, key) => {
            const subscribers = Sprincul.#storeSubscribers.get(key);
            subscribers?.delete(subscription);
        });
        this.#storeSubscriptions.clear();

        // Note: Collection item listeners are cleaned up automatically when elements are removed
        // or when collections are re-rendered (via #renderCollection)
    }

    // Initialize a binding handler registry with reusable logic
    #initBindingHandlers() {
        // data-text: update textContent
        this.#setTextBindingHandler()

        // data-html: update innerHTML
        this.#setInnerHtmlBindingHandler()

        // data-val: bind input value (or checked, if checkbox/radio)
        this.#setInputValuesBindingHandler()

        // data-class: conditionally add/remove classes (example: "strike: isSomeTaskCompleted")
        this.#setClassBindingHandler()

        // data-evt: bind event handlers
        this.#setEventBindingHandler()

        // data-attr: bind attributes conditionally
        this.#setAttributesBindingHandler()
    }

    /**
     * Proxy the state for reactivity
     */
    #setupStateProxy() {
        this.state = new Proxy({}, {
            get: (target: Record<string, any>, prop: string) => {
                return (this.#computed.has(prop)) ? this.#computed.get(prop) : target[prop];
            },
            set: (target: Record<string, any>, prop: string, value: any) => {
                const oldValue = target[prop];
                target[prop] = value;
                if (!Object.is(oldValue, value)) {
                    // Add to pending updates and call the shared debounced function
                    this.#pendingUpdates.add(prop);
                    this.#debouncedUpdate?.();
                }
                return true;
            }
        });
    }

    get setupBindings() {
        return this.#setupBindings;
    }

    // Set up bindings by looping over all registered binding types.
    #setupBindings(container: HTMLElement = this.$el, skipContainer: boolean = false) {
        for (const [attrName, handler] of this.#bindingHandlers) {
            if (handler.setup) {
                // First, check if the container itself has this attribute
                // Skip if we're being called from within a binding handler to prevent recursion
                if (!skipContainer && container.hasAttribute(attrName)) {
                    const value = container.getAttribute(attrName);
                    handler.setup(container, value);
                }

                // Then process descendants
                container.querySelectorAll(`[${attrName}]`).forEach(element => {

                    const closestModelElement = element.closest('[data-model]');

                    // Checks if the element is nested inside another parent Model container
                    const isNestedInParentModel = closestModelElement !== container;

                    // Skip child data-model elements - they will be processed by their own setupBindings call
                    // But allow the container itself to have data attributes
                    if (element.hasAttribute('data-model') && element !== container) return;

                    // Prevent the parent model from processing elements within its nested child models.
                    if (isNestedInParentModel) return;

                    const value = element.getAttribute(attrName);
                    handler.setup(element, value);
                });
            }
        }
    }

    #trackBinding(prop: string, element: HTMLElement) {
        if (!this.#bindings.has(prop)) {
            this.#bindings.set(prop, new Set());
        }
        this.#bindings.get(prop)!.add(element);
    }

    // Track which properties trigger updates for a specific handler on an element
    #trackHandlerSignal(element: HTMLElement, attrName: string, prop: string) {
        if (!this.#handlerSignals.has(element)) {
            this.#handlerSignals.set(element, new Map());
        }
        const elementMap = this.#handlerSignals.get(element)!;
        if (!elementMap.has(attrName)) {
            elementMap.set(attrName, new Set());
        }
        elementMap.get(attrName)!.add(prop);
    }

    // Check if a handler on an element should update for a given prop
    #shouldHandlerUpdate(element: HTMLElement, attrName: string, prop: string): boolean {
        const elementMap = this.#handlerSignals.get(element);
        if (!elementMap) return false;
        const propSet = elementMap.get(attrName);
        return propSet ? propSet.has(prop) : false;
    }

    #applyCollectionBindings(element: HTMLElement, item: Record<string, any>, index: number) {
        for (const [attrName, handler] of this.#bindingHandlers.entries()) {
            if (!handler.updateCollection) continue;

            // First, process the element itself if it has the attribute
            if (element.hasAttribute(attrName)) {
                const bindingValue = element.getAttribute(attrName);
                handler.updateCollection(element, bindingValue, item, index);
            }

            // Then process all descendants
            element.querySelectorAll(`[${attrName}]`).forEach(child => {
                const bindingValue = child.getAttribute(attrName);
                handler.updateCollection(child, bindingValue, item, index);
            });
        }
    }

    #setupCollectionTemplates() {
        this.$el.querySelectorAll('[data-collection]').forEach(el => {
            const element = el as HTMLElement;
            const prop = element.getAttribute('data-collection');
            const templateId = element.getAttribute('data-template');
            const template = templateId ? document.getElementById(templateId) : element.querySelector('template');
            if (prop && template && template instanceof HTMLTemplateElement && template.content.firstElementChild) {
                this.#collectionTemplates.set(prop, {
                    container: element, template: template.content.firstElementChild.cloneNode(true)
                });
                if (!templateId && template.parentElement === element) {
                    template.remove();
                }
                this.#trackBinding(prop, element);
            } else if (prop) {
                if (!template) {
                    Utils.devWarn(Sprincul.devMode, `[Sprincul] No template found for data-collection="${prop}". Expected a <template> child or data-template attribute.`);
                } else if (!(template instanceof HTMLTemplateElement)) {
                    Utils.devWarn(Sprincul.devMode, `[Sprincul] Template for data-collection="${prop}" is not a <template> element.`);
                } else if (!template.content.firstElementChild) {
                    Utils.devWarn(Sprincul.devMode, `[Sprincul] Template for data-collection="${prop}" is empty. Expected at least one child element.`);
                }
            }
        });
    }

    #renderCollection(prop: string, container: HTMLElement, template: Node, items: Array<Record<string, any>> = []) {
        const containerChildNodes = Array.from(container.children);
        const preservedNodes = [...containerChildNodes].filter(child => {
            const el = child as KeyedHTMLElement;
            return !el.key
        });

        const headerOffset = preservedNodes.length;
        const newKeys = new Set();

        items.forEach((data: Record<string, any>, i: number) => {
            const node = template.cloneNode(true) as KeyedHTMLElement;
            const nodeKey: string | number = data?.key ?? data?.id ?? data?.value ?? i;
            newKeys.add(nodeKey);

            node.key = String(nodeKey);

            const existingDomNode = containerChildNodes.find(child => {
                const el = child as KeyedHTMLElement;
                return el.key === String(nodeKey)
            }) as KeyedHTMLElement | undefined;

            if (existingDomNode) {
                // Abort old event listeners before re-applying bindings with new index
                const oldController = this.#collectionControllers.get(existingDomNode);
                oldController?.abort();

                // Morphdom first to sync DOM structure with template
                morphdom(existingDomNode, node);

                // Then apply bindings with updated data and index
                this.#applyCollectionBindings(existingDomNode, data, i);
                Utils.applyDynamicAttributes(existingDomNode, data);
                return;
            }

            // Brand new element - apply bindings and insert
            this.#applyCollectionBindings(node, data, i);
            Utils.applyDynamicAttributes(node, data);

            const insertionIndex = headerOffset + i;
            if (container.children[insertionIndex]) {
                container.insertBefore(node, container.children[insertionIndex]);
            } else {
                container.append(node);
            }
        })

        containerChildNodes.forEach((child) => {
            const el = child as KeyedHTMLElement;
            if (el.key !== undefined && !newKeys.has(el.key)) {
                // Clean up listeners before removing element
                const controller = this.#collectionControllers.get(el);
                controller?.abort();
                el.remove();
            }
        });
    }

    #updateDependentElements(prop: string) {
        const dependentElements = this.#bindings.get(prop);
        if (!dependentElements) return;
        dependentElements.forEach((element: HTMLElement) => {
            this.#updateElement(element, prop);
        });
    }

    #updateElement(element: HTMLElement, prop: string) {
        // First, if the property is a collection, re-render
        if (this.#collectionTemplates.has(prop)) {
            const collectionData = this.#collectionTemplates.get(prop);
            if (collectionData) {
                const {container, template} = collectionData;
                const items = Array.isArray(this.state[prop]) ? this.state[prop] : [];
                this.#renderCollection(prop, container, template, items);
                return;
            }
        }
        // Otherwise, for every registered binding handler, update if applicable.
        for (const [attrName, handler] of this.#bindingHandlers) {
            if (!element.hasAttribute(attrName) || !handler.update) continue;
            if (!this.#shouldHandlerUpdate(element, attrName, prop)) continue;

            try {
                handler.update.call(this, element, prop, this.state[prop]);
            } catch (error) {
                console.error(`Error in ${attrName} update handler for property "${prop}":`, error);
            }
        }
    }

    #setTextBindingHandler() {
        this.#bindingHandlers.set('data-text', {
            setup: (element: HTMLElement, propertyName: string) => {
                const elDefaultText = (element.textContent || element.innerText || '').trim();
                this.#trackBinding(propertyName, element);
                this.#trackHandlerSignal(element, 'data-text', propertyName);

                // Priority: element text > existing state > class property > empty
                if (elDefaultText) {
                    this.state[propertyName] = elDefaultText;
                } else if (this.state[propertyName] !== undefined) {
                    // Keep existing state value
                } else if (this[propertyName] !== undefined) {
                    this.state[propertyName] = this[propertyName];;
                } else {
                    this.state[propertyName] = '';
                }

                // Set the initial text from state if element was empty
                if (!elDefaultText && this.state[propertyName] !== undefined) {
                    const valueToSet = String(this.state[propertyName]);
                    element.textContent = valueToSet;
                }
            },
            update: (element: HTMLElement, prop: string, stateValue: null | any) => {
                const value = stateValue ?? '';
                if (element.textContent !== String(value)) {
                    element.textContent = String(value);
                }
            },
            updateCollection: (element: HTMLElement, field: string, item: Record<string, any>) => {
                if (field in item) {
                    element.textContent = item[field];
                }
            }
        });
    }

    #setInnerHtmlBindingHandler() {
        this.#bindingHandlers.set('data-html', {
            setup: (element: HTMLElement, propertyName: string) => {
                let elDefaultHTML = element.innerHTML.trim();

                // Sanitize initial HTML if sanitization is enabled
                if (Sprincul.sanitizeHtml && elDefaultHTML) {
                    elDefaultHTML = Utils.sanitizeHtml(elDefaultHTML, Sprincul.devMode);
                    element.innerHTML = elDefaultHTML;
                }

                this.#trackBinding(propertyName, element);
                this.#trackHandlerSignal(element, 'data-html', propertyName);

                // Priority: element HTML > existing state > class property > empty
                if (elDefaultHTML) {
                    this.state[propertyName] = elDefaultHTML;
                } else if (this.state[propertyName] !== undefined) {
                    // Keep existing state value
                } else if (this[propertyName] !== undefined) {
                    this.state[propertyName] = this[propertyName];
                } else {
                    this.state[propertyName] = '';
                }

                // Set the initial HTML from state if element was empty
                if (!elDefaultHTML && this.state[propertyName]) {
                    element.innerHTML = this.state[propertyName];
                    // Process any nested data-model elements
                    element.querySelectorAll('[data-model]').forEach(modelElement => {
                        Utils.processModelElement(Sprincul.#registry, modelElement as HTMLElement);
                    });
                }

                // Process child bindings, but skip re-processing the container to prevent recursion
                this.#setupBindings(element, true);
            },
            update: (element: HTMLElement, prop: string, stateValue: null | any) => {
                let value = stateValue ?? '';
                if (Sprincul.sanitizeHtml && typeof value === 'string') {
                    value = Utils.sanitizeHtml(value, Sprincul.devMode);
                }
                if (element.innerHTML !== value) {
                    element.innerHTML = value;
                    // First, instantiate any nested data-model elements
                    element.querySelectorAll('[data-model]').forEach(modelElement => {
                        Utils.processModelElement(Sprincul.#registry, modelElement as HTMLElement);
                    });
                    // Then process other data-* attributes on descendants only
                    // Skip the container itself to prevent infinite recursion
                    this.#setupBindings(element, true);
                }
            },
            updateCollection: (element: HTMLElement, field: string, item: Record<string, any>) => {
                if (field in item) {
                    let value = item[field];
                    if (Sprincul.sanitizeHtml && typeof value === 'string') {
                        value = Utils.sanitizeHtml(value, Sprincul.devMode);
                    }
                    element.innerHTML = value;
                    // First, instantiate any nested data-model elements
                    element.querySelectorAll('[data-model]').forEach(modelElement => {
                        Utils.processModelElement(Sprincul.#registry, modelElement as HTMLElement);
                    });
                    // Then process other data-* attributes on descendants only
                    // Skip the container itself to prevent infinite recursion
                    this.#setupBindings(element, true);
                }
            }
        });
    }

    #setInputValuesBindingHandler() {
        this.#bindingHandlers.set('data-val', {
            setup: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, propertyName: string) => {
                this.#trackBinding(propertyName, element);
                this.#trackHandlerSignal(element, 'data-val', propertyName);

                const elHasCheckedStates = (element.type === 'checkbox' || element.type === 'radio');

                let defaultVal: string | string[];
                if (element instanceof HTMLSelectElement && element.multiple) {
                    defaultVal = Array.from(element.selectedOptions, opt => opt.value);
                } else {
                    defaultVal = element.value;
                }

                const elDefault = (element instanceof HTMLInputElement && elHasCheckedStates)
                    ? element.checked : defaultVal;
                const eventType = elHasCheckedStates ? 'change' : 'input';

                // Initialize the state property using the element's default if not already set
                this.state[propertyName] = this.state[propertyName] ?? elDefault;

                // Sync initial state value to the DOM
                const stateValue = this.state[propertyName];
                if (stateValue !== undefined) {
                    if (element instanceof HTMLInputElement && elHasCheckedStates) {
                        element.checked = stateValue;
                    } else if (element instanceof HTMLSelectElement && element.multiple) {
                        Array.from(element.options).forEach(option => {
                            option.selected = stateValue.includes(option.value);
                        });
                    } else if ('value' in element) {
                        element.value = stateValue;
                    }
                }

                element.addEventListener(eventType, (e) => {
                    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                    const targetHasCheckedStates = (target.type === 'checkbox' || target.type === 'radio');
                    if (target instanceof HTMLInputElement && targetHasCheckedStates) {
                        this.state[propertyName] = target.checked;
                    } else {
                        this.state[propertyName] = target.value;
                    }
                }, { signal: this.#abortController.signal });
            },
            update: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, prop: string, stateValue: any) => {
                const elHasCheckedStates = (element.type === 'checkbox' || element.type === 'radio');
                if (stateValue !== undefined) {
                    if (element instanceof HTMLInputElement && elHasCheckedStates) {
                        element.checked = stateValue;
                    } else if (element instanceof HTMLSelectElement && element.multiple) {
                        Array.from(element.options).forEach(option => {
                            option.selected = stateValue.includes(option.value);
                        });
                    } else if ('value' in element && element.value !== stateValue) {
                        element.value = stateValue;
                    }
                }
            },
            updateCollection: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, field: string, item: Record<string, any>) => {
                if (!(field in item)) return;

                const itemValue = item[field];
                const elHasCheckedStates = (element.type === 'checkbox' || element.type === 'radio');
                if (element instanceof HTMLInputElement && elHasCheckedStates) {
                    element.checked = itemValue ?? false;
                } else if ('value' in element) {
                    element.value = itemValue;
                }
            }
        });
    }

    #setEventBindingHandler() {
        this.#bindingHandlers.set('data-evt', {
            setup: (element: HTMLElement, bindingString: string) => {
                Utils.parseEventBindings(bindingString).forEach(({event, method}) => {
                    element.addEventListener(event, (e) => {
                        if (typeof this[method] === 'function') {
                            try {
                                this[method](e);
                            } catch (error) {
                                console.error(`Error in event handler "${method}" for event "${event}":`, error);
                            }
                        } else {
                            Utils.devWarn(Sprincul.devMode, `[Sprincul] Event handler method "${method}" not found for event "${event}".`);
                        }
                    }, { signal: this.#abortController.signal });
                });
            }, // For collections, pass the relevant index as well.
            updateCollection: (element: HTMLElement, bindingString: string, item: Record<string, any>, index: number) => {
                // Create or get AbortController for this collection element
                let controller = this.#collectionControllers.get(element);
                if (!controller) {
                    controller = new AbortController();
                    this.#collectionControllers.set(element, controller);
                }

                Utils.parseEventBindings(bindingString).forEach(({event, method}) => {
                    element.addEventListener(event, (e) => {
                        if (typeof this[method] === 'function') {
                            try {
                                this[method](e, index);
                            } catch (error) {
                                console.error(`Error in collection event handler "${method}" for event "${event}":`, error);
                            }
                        }
                    }, { signal: controller!.signal });
                });
            }
        });
    }

    #setClassBindingHandler() {
        this.#bindingHandlers.set('data-class', {
            setup: (element: HTMLElement, bindingString: string) => {
                // Parse and cache the binding structure
                const parsed = Utils.parseClassBindings(bindingString);
                if (!this.#bindingCache.has(element)) {
                    this.#bindingCache.set(element, new Map());
                }
                this.#bindingCache.get(element)!.set('data-class', parsed);

                parsed.forEach(({prop}) => {
                    if (this.#computed.has(prop) && this.#computedPropMap.has(prop)) {
                        const dependencies = this.#computedPropMap.get(prop);
                        dependencies?.forEach(dependency => {
                            this.#trackBinding(dependency, element);
                            this.#trackHandlerSignal(element, 'data-class', dependency);
                        });
                        return;
                    }
                    this.#trackBinding(prop, element);
                    this.#trackHandlerSignal(element, 'data-class', prop);
                });
            },
            update: (element: HTMLElement, prop: string, stateValue: any) => {

                const computedResults: Record<string, any> = {};
                if (this.#reverseDependenciesMap.has(prop)) {
                    const computedKeys = this.#reverseDependenciesMap.get(prop);
                    computedKeys?.forEach((computedKey: string) => {
                        const computedFn = this.#computed.get(computedKey);
                        if (typeof computedFn === 'function') {
                            try {
                                // Store the raw value, not Boolean
                                computedResults[computedKey] = computedFn.call(this, element);
                            } catch (error) {
                                console.error(`Error in computed property "${computedKey}" for data-class:`, error);
                                computedResults[computedKey] = undefined;
                            }
                        }
                    })
                } else {
                    if (stateValue === undefined && typeof this[prop] === 'function') {
                        try {
                            // Store raw value - let applyDynamicClasses decide how to use it
                            stateValue = this[prop](element);
                        } catch (error) {
                            console.error(`Error calling function "${prop}" for data-class:`, error);
                            stateValue = undefined;
                        }
                    } else if (typeof stateValue === 'function') {
                        try {
                            stateValue = stateValue(element);
                        } catch (error) {
                            console.error(`Error calling state function for data-class:`, error);
                            stateValue = undefined;
                        }
                    }
                }

                // Retrieve cached parsed bindings
                const cachedBindings = this.#bindingCache.get(element)?.get('data-class');
                if (cachedBindings) {
                    cachedBindings.forEach(({prop: bindProp, classes}: {prop: string, classes: string[] | null}) => {
                        let value = bindProp in computedResults ? computedResults[bindProp] : stateValue;
                        // Apply classes - with brackets uses boolean, without brackets uses string
                        Utils.applyDynamicClasses(element, value, classes);
                    });
                }
            },
            updateCollection: (element: HTMLElement, bindingString: string, item: Record<string, any>) => {
                Utils.parseClassBindings(bindingString).forEach(({prop, classes}) => {
                    let value = item[prop];
                    if (value === undefined && typeof this[prop] === 'function') {
                        value = this[prop](element);
                    } else if (typeof value === 'function') {
                        value = value(element);
                    }
                    Utils.applyDynamicClasses(element, value, classes);
                });
            }
        });
    }

    #setAttributesBindingHandler() {
        this.#bindingHandlers.set('data-attr', {
            setup: (element: HTMLElement, bindingString: string) => {
                const allBindings = bindingString
                    .split(';')
                    .map(b => b.trim())
                    .filter(b => b)
                    .map(binding => {
                        const [attr, prop] = binding.split(':').map(s => s.trim());
                        return {attr, prop};
                    });

                // Filter out event handler attributes if sanitization is enabled
                const blockedAttrs: string[] = [];
                const bindings = allBindings.filter(({attr}) => {
                    if (Sprincul.sanitizeHtml && attr.startsWith('on')) {
                        blockedAttrs.push(attr);
                        return false;
                    }
                    return true;
                });

                if (blockedAttrs.length > 0) {
                    Utils.devWarn(Sprincul.devMode, `[Sprincul] Blocked event handler attributes in data-attr: ${blockedAttrs.join(', ')}. Use data-evt for event handlers.`);
                }

                // Cache parsed bindings (excluding blocked ones)
                if (!this.#bindingCache.has(element)) {
                    this.#bindingCache.set(element, new Map());
                }
                this.#bindingCache.get(element)!.set('data-attr', bindings);

                bindings.forEach(({prop}) => {
                    this.#trackBinding(prop, element);
                    this.#trackHandlerSignal(element, 'data-attr', prop);
                });
            },
            update: (element: HTMLElement) => {
                // Retrieve cached parsed bindings
                const cachedBindings = this.#bindingCache.get(element)?.get('data-attr');
                if (!cachedBindings) return;

                cachedBindings.forEach(({attr, prop}: {attr: string, prop: string}) => {
                    // Update the attribute if the corresponding state property exists
                    if (this.state[prop] !== undefined) {
                        element.setAttribute(attr, this.state[prop]);
                    }
                });
            },
            updateCollection: (element: HTMLElement, bindingString: string, item: Record<string, any>) => {
                const bindings = bindingString
                    .split(';')
                    .map(b => b.trim())
                    .filter(b => b)
                    .map(binding => {
                        const [attr, prop] = binding.split(':').map(s => s.trim());
                        return {attr, prop};
                    });
                bindings.forEach(({attr, prop}) => {
                    if (prop in item) {
                        element.setAttribute(attr, item[prop]);
                    }
                });
            }
        });
    }
}
