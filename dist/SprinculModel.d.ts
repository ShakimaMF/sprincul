import type { BoundDefaults } from "./types";
/**
 * @class SprinculModel Base class for user models
 *
 * @description Users can extend this class to create their own reactive components
 */
export default class SprinculModel {
    #private;
    $el: HTMLElement;
    state: Record<string, any>;
    constructor(element: HTMLElement);
    /**
     * Lifecycle hook called before bindings are set up
     * Override this in your model class to add computed properties
     * Core is guaranteed to be available at this point
     *
     * @param {BoundDefaults} defaults
     */
    beforeInit?(defaults: BoundDefaults): void | Promise<void>;
    /**
     * Lifecycle hook called after model initialization
     * Override this in your model class to perform setup after bindings are active
     */
    afterInit?(): void | Promise<void>;
    /**
     * A lifecycle hook that is invoked just before the component is destroyed.
     * Use this method to perform cleanup tasks such as invalidating timers,
     * unsubscribing from observables, removing event listeners, or freeing other resources.
     *
     * @return {void | Promise<void>}
     */
    beforeDestroy?(): void | Promise<void>;
    /**
     * Bind new data attributes and event listeners to newly added content added within an active model's subtree.
     *
     * @param {HTMLElement} element - The HTML element to be processed by the core system.
     * @return {void} Does not return a value.
     * @throws {Error} If the method is called before the core is available.
     */
    wire(element: HTMLElement): void;
    /**
     * Release what wire() registered within an element and its descendants.
     * Call this before discarding content a model rebuilds on every render.
     *
     * Bindings from the model's own server-rendered markup are left alone, so a binding callback
     * can safely unwire the container it was handed.
     *
     * @param {HTMLElement} element - The element whose wired content to release. Call this before detaching it.
     * @return {void} Does not return a value.
     * @throws {Error} If the method is called before the core is available.
     */
    unwire(element: HTMLElement): void;
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
    addComputedProp(name: string, fn: (() => any) | ((this: SprinculModel) => any), dependencies?: Array<string>): () => void;
}
