import {map, type MapStore} from 'nanostores';
import { SprinculCore } from './SprinculCore';
import { getCore } from './registry';

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
     * Lifecycle hook called before bindings are set up
     * Override this in your model class to add computed properties
     * Core is guaranteed to be available at this point
     */
    beforeInit?(): void | Promise<void>;

    /**
     * Lifecycle hook called after model initialization
     * Override this in your model class to perform setup after bindings are active
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
     * @returns Unsubscribe function to manually remove this computed property listener (automatic cleanup on destroy)
     */
    addComputedProp(
        name: string,
        fn: (() => any) | ((this: SprinculModel) => any),
        dependencies: Array<string> = []
    ): () => void {
        if (dependencies.length === 0) {
            console.warn(`[Sprincul] addComputedProp("${name}") called without dependencies. Bound elements will not re-render when the value changes.`);
        }

        const core = this.#core || getCore(this);
        if (!core) {
            throw new Error(`[Sprincul] addComputedProp("${name}") called before core was available. Call this from beforeInit() instead.`);
        }

        const callback = () => Reflect.apply(fn as Function, this, []);
        return core.registerComputedFromModel(name, callback, dependencies, this.#state) ?? (() => {});
    }
}
