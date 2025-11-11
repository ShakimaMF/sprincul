declare class Sprincul {
    $el: HTMLElement;
    state: Record<string, any>;
    constructor(element: HTMLElement);
    static register(name: string, modelClass: typeof Sprincul): void;
    static init(): void;
    addComputedProp(key: string, fn: Function, dependencies: string[]): void;
    get setupBindings(): (container?: HTMLElement) => void;
    destroy(): void;
}

export declare class SprinculModel extends Sprincul {
    connectedCallback?(): void;
}

interface SprinculModelConstructor {
    new (element: HTMLElement): SprinculModel;
}

export interface SprinculModelRegistry {
    get(name: string): SprinculModelConstructor | undefined;
    set(name: string, modelClass: SprinculModelConstructor): void;
}

export interface KeyedHTMLElement extends HTMLElement {
    key: string | number;
}