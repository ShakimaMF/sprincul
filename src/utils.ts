import type { SprinculModelRegistry, SprinculModel } from './types';

export const Utils = {
    devWarn: (devMode: boolean, message: string) => {
        if (!devMode) return;
        console.warn(message);
    },
    sanitizeHtml: (html: string, devMode: boolean): string => {
        const temp = document.createElement('div');
        temp.innerHTML = html;

        let hasStrippedAttr = false;

        // Remove event handler attributes (on*)
        temp.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    hasStrippedAttr = true;
                }
            });
        });

        if (hasStrippedAttr) {
            Utils.devWarn(devMode, `[Sprincul] Stripped event handler attributes from HTML. Use data-evt for event handlers.`);
        }

        return temp.innerHTML;
    },
    debounce: (callback: Function): Function => {
        let animationFrameId: number | null = null;

        return function (this: SprinculModel, ...args: any[]) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }

            animationFrameId = requestAnimationFrame(() => {
                callback.apply(this, args);
                animationFrameId = null;
            });
        };
    },
    parseClassBindings: (bindingString: string) => {
        return bindingString
            .split(';')
            .map(binding => binding.trim())
            .filter(binding => binding.length > 0)
            .map(binding => {
                const match = binding.match(/^([^\[\]]+)\[([^\[\]]+)\]$/);
                if (match) {
                    const prop = match[1].trim();
                    const classes = match[2]
                        .split(',')
                        .map(cls => cls.trim())
                        .filter(cls => cls.length > 0);
                    return { prop, classes };
                } else {
                    return { prop: binding, classes: null };
                }
            })
            .filter(({ prop }) => prop);
    },
    parseEventBindings: (bindingString: string) => {
        return bindingString.split(';').map(binding => {
            const [event, method] = binding.split(':').map(s => s.trim());
            return {event, method};
        }).filter(({event, method}) => event && method);
    },
    processModelElement: (registry: SprinculModelRegistry, element: HTMLElement) => {
        const modelName = element.dataset.model ?? element.getAttribute('data-model');
        if (!modelName) {
            throw new Error('Element is missing a "data-model" attribute');
        }
        const ModelClass = registry.get(modelName);
        if (ModelClass) {
            const model = new ModelClass(element);
            // Store model instance on element for testing/debugging
            (element as any).__sprincul_model = model;
            model.setupBindings(element);
            Utils.applyDynamicAttributes(element, model.state);
            if (model.connectedCallback && typeof model.connectedCallback === 'function') {
                model.connectedCallback();
            }
        } else {
            console.warn(`Model "${modelName}" not found in registry`);
        }
    },
    applyDynamicAttributes: (element: Element, context: Record<string, any>) => {
        const processElement = (el: Element) => {
            if (el.hasAttribute('id')) {
                const key = el.getAttribute('id');
                if (key && key in context) {
                    el.setAttribute('id', context[key]);
                }
            }
            if (el.tagName === 'LABEL' && el.hasAttribute('for')) {
                const key = el.getAttribute('for');
                if (key && key in context) {
                    el.setAttribute('for', context[key]);
                }
            }
        };

        // Process root element
        processElement(element);

        // Process all descendants (querySelectorAll already returns flat list, no recursion needed)
        element.querySelectorAll('*').forEach(processElement);
    },
    applyDynamicClasses: (element: HTMLElement, computedValue: any, classes: string[]|null) => {
        if (classes) {
            classes.forEach(name => {
                if (Boolean(computedValue)) {
                    element.classList.add(name);
                } else {
                    element.classList.remove(name);
                }
            });
        } else if (computedValue && typeof computedValue === 'string') {
            element.classList.toggle(computedValue);
        }
    }
}
