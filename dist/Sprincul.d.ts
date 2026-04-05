import { type MapStore } from 'nanostores';
export default class Sprincul {
    #private;
    $el: HTMLElement;
    $state: MapStore<Record<string, any>>;
    state: Record<string, any>;
    static store: {
        get<T = any>(key: string): T | undefined;
        set<T = any>(key: string, value: T): void;
        subscribe<T = any>(key: string, callback: (value: T | undefined) => void): () => void;
        clear(): void;
    };
    constructor(element: HTMLElement);
    afterInit?(): void;
    static register(name: string, modelClass: typeof Sprincul): void;
    static init(options?: {
        devMode?: boolean;
    }): void;
    static processModelElement(element: HTMLElement): void;
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
    addComputedProp(key: string, fn: () => any, dependencies?: Array<string>): void;
}
