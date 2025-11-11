import type { SprinculModelRegistry } from './types';
export declare const Utils: {
    debounce: (callback: Function) => Function;
    parseClassBindings: (bindingString: string) => {
        prop: string;
        className: string;
    }[];
    parseEventBindings: (bindingString: string) => {
        event: string;
        method: string;
    }[];
    processModelElement: (registry: SprinculModelRegistry, element: HTMLElement) => void;
    applyDynamicAttributes: (element: Element, context: Record<string, any>) => void;
};
