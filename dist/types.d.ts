declare class Sprincul {
    $el: HTMLElement;
    state: Object;
    constructor(element: HTMLElement);
    static register(name: string, modelClass: typeof Sprincul): void;
    static init(): void;
    addComputedProp(key: string, fn: Function, dependencies: string[]): void;
    get setupBindings(): (container?: HTMLElement) => void;
}
export declare class SprinculModel extends Sprincul {
    connectedCallback?(): void;
}
interface SprinculModelConstructor {
    new (element: HTMLElement): SprinculModel;
}
export interface SprinculModelRegistry {
    get(name: string): SprinculModelConstructor;
    set(name: string, modelClass: SprinculModel): void;
}
export {};
