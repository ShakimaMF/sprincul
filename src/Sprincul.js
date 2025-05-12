import morphdom from 'https://cdn.jsdelivr.net/npm/morphdom@2.7.3/+esm'

export default class Sprincul {
    $el;
    static #registry = new Map();

    #bindings = new Map();
    #bindingHandlers = new Map();
    #collectionTemplates = new Map();

    constructor(element) {
        this.$el = element;
        this.#initBindingHandlers();
        this.#setupCollectionTemplates();

        this.state = new Proxy({}, {
            get: (target, prop) => target[prop],
            set: (target, prop, value) => {
                const oldValue = target[prop];
                target[prop] = value;
                if (!Object.is(oldValue, value)) {
                    const debounceFn = Sprincul.debounce(() => this.#updateDependentElements(prop));
                    debounceFn();
                }
                return true;
            }
        });

        this.#setupBindings();
        this.#applyDynamicAttributes(this.$el, this.state);
    }

    static register(name, modelClass) {
        Sprincul.#registry.set(name, modelClass);
    }

    static init() {
        document.querySelectorAll('[data-model]').forEach(element => {
            this.processModelElement(element);
        });
        document.querySelectorAll('[data-cloaked]').forEach(element => {
            element.removeAttribute('data-cloaked');
        })
    }

    static processModelElement(element) {
        const modelName = element.dataset.model ?? element.getAttribute('data-model');
        const ModelClass = Sprincul.#registry.get(modelName);
        if (ModelClass) {
            const model = new ModelClass(element);
            if (model.connectedCallback && typeof model.connectedCallback === 'function') {
                model.connectedCallback();
            }
        } else {
            console.warn(`Model "${modelName}" not found in registry`);
        }
    }

    static debounce(callback) {
        let animationFrameId;

        return function debounced(...args) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }

            animationFrameId = requestAnimationFrame(() => {
                callback.apply(this, args);
                animationFrameId = null;
            });
        };
    }

    // Utility to parse data-class binding strings
    #parseClassBindings(bindingString) {
        return bindingString.split(';').map(binding => {
            const [className, prop] = binding.split(':').map(s => s.trim());
            return {prop, className};
        }).filter(({prop, className}) => prop && className);
    }

    // Utility to parse data-evt binding strings
    #parseEventBindings(bindingString) {
        return bindingString.split(';').map(binding => {
            const [event, method] = binding.split(':').map(s => s.trim());
            return {event, method};
        }).filter(({event, method}) => event && method);
    }

    // Set up bindings by looping over all registered binding types.
    #setupBindings(container = this.$el) {
        for (const [attrName, handler] of this.#bindingHandlers) {
            if (handler.setup) {
                container.querySelectorAll(`[${attrName}]`).forEach(element => {
                    const value = element.getAttribute(attrName);
                    handler.setup(element, value);
                });
            }
        }
    }

    #trackBinding(prop, element) {
        if (!this.#bindings.has(prop)) {
            this.#bindings.set(prop, new Set());
        }
        this.#bindings.get(prop).add(element);
    }

    #setupCollectionTemplates() {
        this.$el.querySelectorAll('[data-collection]').forEach(element => {
            const prop = element.getAttribute('data-collection');
            const templateId = element.getAttribute('data-template');
            const template = templateId
                ? document.getElementById(templateId)
                : element.querySelector('template');
            if (template && template instanceof HTMLTemplateElement) {
                this.#collectionTemplates.set(prop, {
                    container: element,
                    template: template.content.firstElementChild.cloneNode(true)
                });
                if (!templateId && template.parentElement === element) {
                    template.remove();
                }
                this.#trackBinding(prop, element);
            }
        });
    }

    #renderCollection(prop, container, template, items) {

        const isSelect = container.tagName.toLowerCase() === 'select';
        const preservedNodes = Array.from(container.children).filter(
            child => !child.hasAttribute('data-key')
        );

        if (isSelect) {
            container.innerHTML = '';
            preservedNodes.forEach(node => container.append(node));
        }

        const headerOffset = preservedNodes.length;
        const newKeys = new Set();

        items.forEach((data, i) => {
            const node = template.cloneNode(true);
            const nodeKey = data.key ?? data.value;
            newKeys.add(nodeKey);

            node.setAttribute('data-key', nodeKey);
            this.#applyCollectionBindings(node, data, i);
            this.#applyDynamicAttributes(node, data);

            const existingDomNode = container.querySelector(`[data-key="${nodeKey}"]`);
            if (existingDomNode) {
                morphdom(existingDomNode, node);
                return;
            }

            const insertionIndex = isSelect ? 1 : headerOffset + i;
            if (container.children[insertionIndex]) {
                container.insertBefore(node, container.children[insertionIndex]);
            } else {
                container.append(node);
            }

        })
        if (!isSelect) {
            container.querySelectorAll('[data-key]').forEach((child) => {
                if (!newKeys.has(child.dataset.key)) child.remove();
            });
        }
    }

    #applyCollectionBindings(element, item, index) {
        for (const [attrName, handler] of this.#bindingHandlers.entries()) {
            if (element.hasAttribute(attrName)) {
                const bindingValue = element.getAttribute(attrName);
                if (typeof handler.updateCollection === 'function') {
                    handler.updateCollection(element, bindingValue, item, index);
                }
            }
            element.querySelectorAll(`[${attrName}]`).forEach(child => {
                const bindingValue = child.getAttribute(attrName);
                if (typeof handler.updateCollection === 'function') {
                    handler.updateCollection(child, bindingValue, item, index);
                }
            });
        }
    }

    #updateDependentElements(prop) {
        const dependentElements = this.#bindings.get(prop);
        if (!dependentElements) return;
        dependentElements.forEach(element => {
            this.#updateElement(element, prop);
        });
        this.#applyDynamicAttributes(this.$el, this.state);
    }

    #updateElement(element, prop) {
        // First, if the property is a collection, re-render
        if (this.#collectionTemplates.has(prop)) {
            const {container, template} = this.#collectionTemplates.get(prop);
            const items = Array.isArray(this.state[prop]) ? this.state[prop] : [];
            this.#renderCollection(prop, container, template, items);
            return;
        }
        // Otherwise, for every registered binding handler, update if applicable.
        for (const [attrName, handler] of this.#bindingHandlers) {
            if (element.hasAttribute(attrName) && handler.update) {
                handler.update(element, prop, this.state[prop]);
            }
        }

    }

    #applyDynamicAttributes(element, context = {}) {
        // Use context if provided, or fall back to the overall state.
        const ctx = context || this.state;

        // Process the element itself.
        if (element.hasAttribute('id')) {
            const key = element.getAttribute('id');
            if (key in ctx) {
                element.setAttribute('id', ctx[key]);
            }
        }
        if (element.tagName === 'LABEL' && element.hasAttribute('for')) {
            const key = element.getAttribute('for');
            if (key in ctx) {
                element.setAttribute('for', ctx[key]);
            }
        }

        // Process all child elements.
        element.querySelectorAll('*').forEach(child => {
            if (child.hasAttribute('id')) {
                const key = child.getAttribute('id');
                if (key in ctx) {
                    child.setAttribute('id', ctx[key]);
                }
            }
            if (child.tagName === 'LABEL' && child.hasAttribute('for')) {
                const key = child.getAttribute('for');
                if (key in ctx) {
                    child.setAttribute('for', ctx[key]);
                }
            }
        });
    }

    // Initialize a binding handler registry with reusable logic
    #initBindingHandlers() {
        // data-text: update textContent
        this.#bindingHandlers.set('data-text', {
            setup: (element, propertyName) => {
                const elDefaultText = element.textContent.trim() || element.innerText.trim();
                this.#trackBinding(propertyName, element);
                this.state[propertyName] = elDefaultText ?? (this.state[propertyName] ?? elDefaultText);
            },
            update: (element, prop, stateValue) => {
                const value = stateValue ?? '';
                if (element.textContent !== value) {
                    element.textContent = value;
                }
            },
            updateCollection: (element, field, item) => {
                const itemValue = item[field];
                element.textContent = itemValue ?? element.textContent;
            }
        });

        // data-html: update innerHTML
        this.#bindingHandlers.set('data-html', {
            setup: (element, propertyName) => {
                const elDefaultHTML = element.innerHTML.trim() || element.innerHTML.trim();
                this.#trackBinding(propertyName, element);
                this.state[propertyName] = elDefaultHTML ?? (this.state[propertyName] ?? elDefaultHTML);
            },
            update: (element, prop, stateValue) => {
                const value = stateValue ?? '';
                if (element.innerHTML !== value) {
                    element.innerHTML = value;
                }
            },
            updateCollection: (element, field, item) => {
                const itemValue = item[field];
                element.innerHTML = itemValue ?? element.innerHTML;
            }
        });

        // data-val: bind input value (or checked, if checkbox/radio)
        this.#bindingHandlers.set('data-val', {
            setup: (element, propertyName) => {
                this.#trackBinding(propertyName, element);

                // Determine the element's default value based on its type
                const elHasCheckedStates = (element.type === 'checkbox' || element.type === 'radio');
                const defaultVal = (element.tagName === 'SELECT' && element.multiple)
                    ? Array.from(element.selectedOptions, opt => opt.value)
                    : element.value;
                const elDefault = elHasCheckedStates ? element.checked : defaultVal;
                const eventType = elHasCheckedStates ? 'change' : 'input';

                // Initialize the state property using the element's default if not already set
                this.state[propertyName] = this.state[propertyName] ?? elDefault;

                element.addEventListener(eventType, () => {
                    this.state[propertyName] = elHasCheckedStates ? element.checked : element.value;
                });
            },
            update: (element, prop, stateValue) => {
                if (stateValue !== undefined) {
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = stateValue;
                    } else if (element.tagName === 'SELECT' && element.multiple) {
                        Array.from(element.options).forEach(option => {
                            option.selected = stateValue.includes(option.value);
                        });
                    } else if (element.value !== String(stateValue)) {
                        element.value = stateValue;
                    }
                }
            },
            updateCollection: (element, field, item) => {
                const itemValue = item[field];
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = itemValue ?? false;
                } else {
                    element.value = itemValue ?? element.value;
                }
            }
        });

        // data-class: conditionally add/remove classes (example: "completed: strike")
        this.#bindingHandlers.set('data-class', {
            setup: (element, bindingString) => {
                this.#parseClassBindings(bindingString).forEach(({prop}) => {
                    this.#trackBinding(prop, element);
                });
            },
            update: (element, prop, stateValue) => {
                // If no state value exists but there's a function on the instance, call it.
                if (stateValue === undefined && typeof this[prop] === 'function') {
                    stateValue = Boolean(this[prop](element));
                } else if (typeof stateValue === 'function') {
                    stateValue = Boolean(stateValue(element));
                }

                const bindingString = element.getAttribute('data-class');
                this.#parseClassBindings(bindingString).forEach(({prop: bindProp, className}) => {
                    if (bindProp === prop) {
                        if (stateValue) {
                            element.classList.add(className);
                        } else {
                            element.classList.remove(className);
                        }
                    }
                });
            },
            updateCollection: (element, bindingString, item) => {
                this.#parseClassBindings(bindingString).forEach(({prop, className}) => {
                    let value = item[prop];
                    if (value === undefined && typeof this[prop] === 'function') {
                        value = Boolean(this[prop](element));
                    } else if (typeof value === 'function') {
                        value = Boolean(value(element));
                    }
                    if (value) {
                        element.classList.add(className);
                    } else {
                        element.classList.remove(className);
                    }
                });
            }
        });

        // data-evt: bind event handlers
        this.#bindingHandlers.set('data-evt', {
            setup: (element, bindingString) => {
                this.#parseEventBindings(bindingString).forEach(({event, method}) => {
                    element.addEventListener(event, (e) => {
                        if (typeof this[method] === 'function') {
                            this[method](e);
                        }
                    });
                });
            },
            // For collections, pass the relevant index as well.
            updateCollection: (element, bindingString, item, index) => {
                this.#parseEventBindings(bindingString).forEach(({event, method}) => {
                    element.addEventListener(event, (e) => {
                        if (typeof this[method] === 'function') {
                            this[method](e, index);
                        }
                    });
                });
            }
        });
    }
}
