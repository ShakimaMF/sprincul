import {computed, map, type MapStore} from 'nanostores';
import type { SprinculCore } from './SprinculCore';
import { getCore, FLUSH_PENDING } from './registry';

/**
 * @class SprinculModel Base class for user models
 *
 * @description Users can extend this class to create their own reactive components
 */
export default class SprinculModel {
    $el: HTMLElement;
    readonly #state: MapStore<Record<string, any>>;
    state!: Record<string, any>;
    
    // Buffer for computed props added before core is ready
    #pendingComputed: Array<{
        key: string;
        fn: () => any;
        dependencies: string[];
    }> = [];
    
    // Cached core reference (set after construction)
    #core?: SprinculCore;

    constructor(element: HTMLElement) {
        this.$el = element;
        this.#state = map<Record<string, any>>({});
        
        // Listen to state changes and notify the core
        this.#state.listen((_, __, changed) => {
            if (!changed) return;
            const core = this.#core || getCore(this);
            if (core) {
                core.scheduleUpdate(changed as string);
            }
        });
        
        this.#setupStateProxy();
    }

    /**
     * Lifecycle hook called after model initialization
     * Override this in your model class to perform setup
     */
    afterInit?(): void | Promise<void>;

    /**
     * Add a computed property that derives its value from state
     * The computed property will re-calculate only when the specified dependencies change
     * 
     * Example: 
     * this.addComputedProp('total', () => this.state.price * this.state.quantity, ['price', 'quantity'])
     *
     * @param key - The computed property name
     * @param fn - Function that returns the computed value
     * @param dependencies - Array of state keys this computed property depends on.
     *                       Without dependencies, the computed value is still accessible via state
     *                       but bound elements will not re-render when it changes.
     */
    addComputedProp(key: string, fn: () => any, dependencies: Array<string> = []) {
        if (dependencies.length === 0) {
            console.warn(`[Sprincul] addComputedProp("${key}") called without dependencies. Bound elements will not re-render when the value changes.`);
        }

        const core = this.#core || getCore(this);
        
        // If core doesn't exist yet (called in constructor), buffer for later
        if (!core) {
            this.#pendingComputed.push({ key, fn, dependencies });
            return;
        }

        this.#registerComputedProp(key, fn, dependencies, core);
    }

    /**
     * Internal method to flush pending computed properties
     * Called by Sprincul after core is created via symbol
     */
    [FLUSH_PENDING]() {
        const core = getCore(this);
        if (!core) return;

        this.#core = core;

        this.#pendingComputed.forEach(({ key, fn, dependencies }) => {
            this.#registerComputedProp(key, fn, dependencies, core);
        });

        this.#pendingComputed = [];
    }
    
    #registerComputedProp(key: string, fn: () => any, dependencies: string[], core: SprinculCore) {
        // Create a computed store that recalculates when dependencies change
        const computedStore = computed(this.#state, fn.bind(this));
        
        // Register with core
        core.registerComputed(key, computedStore);

        // Subscribe only to the specific state keys this computed depends on
        if (dependencies.length > 0) {
            this.#state.listen((_, __, changed) => {
                // Only update if one of our dependencies changed
                if (changed && dependencies.includes(changed as string)) {
                    core.scheduleUpdate(key);
                }
            });
        }
    }

    #setupStateProxy() {
        this.state = new Proxy({}, {
            get: (_, prop: string) => {
                const core = this.#core || getCore(this);
                if (core?.hasComputed(prop)) {
                    return core?.getComputed(prop);
                }
                return this.#state.get()[prop];
            },
            set: (_, prop: string, value: any) => {
                this.#state.setKey(prop, value);
                return true;
            }
        });
    }
}
