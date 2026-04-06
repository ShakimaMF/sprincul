import { FLUSH_PENDING } from './registry';
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
    addComputedProp(name: string, fn: (() => any) | ((this: SprinculModel) => any), dependencies?: Array<string>): (() => void) | void;
    /**
     * Internal method to flush pending computed properties
     */
    [FLUSH_PENDING](): void;
}
