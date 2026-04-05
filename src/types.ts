declare class Sprincul {
    $el: HTMLElement;
    state: Record<string, any>;
    constructor(element: HTMLElement);
    static register(name: string, modelClass: typeof Sprincul): void;
    static init(options?: { devMode?: boolean }): void;
    static store: {
        get<T = any>(key: string): T | undefined;
        set<T = any>(key: string, value: T): void;
        subscribe<T = any>(key: string, callback: (value: T | undefined) => void): () => void;
        clear(): void;
    };
    addComputedProp(key: string, fn: () => any, dependencies?: string[]): void;
    afterInit?(): void;
}

export type SprinculModel = Sprincul;

export interface SprinculModelConstructor {
    new (element: HTMLElement): Sprincul;
}

export interface SprinculModelRegistry {
    get(name: string): SprinculModelConstructor | undefined;
    set(name: string, modelClass: SprinculModelConstructor): void;
}
