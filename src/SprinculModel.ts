import {map, type MapStore} from 'nanostores';
import { SprinculCore } from './SprinculCore';
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
    #core?: SprinculCore;
    #pendingComputed: Array<{
        key: string;
        fn: (() => any) | ((this: SprinculModel) => any);
        dependencies: string[];
    }> = [];

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

        // Create reactive state proxy
        this.state = SprinculCore.createStateProxy(this.#state, () => this.#core || getCore(this));
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
     * @example this.addComputedProp('total', () => this.state.price * this.state.quantity, ['price', 'quantity'])
     *
     * @param name - The computed property name
     * @param fn - Function that returns the computed value
     * @param dependencies - Array of state keys this computed property depends on.
     *                       Without dependencies, the computed value is still accessible via state
     *                       but bound elements will not re-render when it changes.
     * @returns Unsubscribe function to manually remove this computed property listener (optional - automatic cleanup on destroy)
     */
    addComputedProp(
        name: string,
        fn: (() => any) | ((this: SprinculModel) => any),
        dependencies: Array<string> = []
    ): (() => void) | void {
        if (dependencies.length === 0) {
            console.warn(`[Sprincul] addComputedProp("${name}") called without dependencies. Bound elements will not re-render when the value changes.`);
        }

        const core = this.#core || getCore(this);
        
        // If core doesn't exist yet (called in constructor), buffer for later
        if (!core) {
            this.#pendingComputed.push({ key: name, fn, dependencies });
            return;
        }

        return core.registerComputedFromModel(
            name,
            () => Reflect.apply(fn as Function, this, []),
            dependencies,
            this.#state
        );
    }

    /**
     * Internal method to flush pending computed properties
     */
    [FLUSH_PENDING]() {
        const core = getCore(this);
        if (!core) return;

        this.#core = core;

        this.#pendingComputed.forEach(({ key, fn, dependencies }) => {
            const wrapperFn = () => Reflect.apply(fn as Function, this, [])
            core.registerComputedFromModel(key, wrapperFn, dependencies, this.#state);
        });

        this.#pendingComputed = [];
    }
}
