import type { BoundDefaults, DataValue } from "./types";
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
     * Bind the data-bind-* attributes and on* handlers in content added to this model.
     *
     * Content not appended yet (a `DocumentFragment` or detached element) can be wired first and appended after:
     * its listeners attach now and its binding callbacks run in the next frame, once it's usually on the page.
     *
     * @param {HTMLElement | DocumentFragment} element - The content to bind, and its descendants.
     * @return {void} Does not return a value.
     * @throws {Error} If the method is called before the core is available.
     */
    wire(element: HTMLElement | DocumentFragment): void;
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
     * Get the first element marked `data-ref="<name>"` within this model.
     *
     * @example this.$ref<HTMLInputElement>('email')?.focus()
     *
     * @param {string} name - The ref name
     * @return {T | null} The first matching element, or null if there is none.
     */
    $ref<T extends HTMLElement = HTMLElement>(name: string): T | null;
    /**
     * Get every element marked `data-ref="<name>"` within this model, in document order.
     * Refs are looked up when read, so markup inserted by any means is found without wire().
     * Names are attribute values, so they match case-sensitively.
     *
     * @example this.$refs<HTMLLIElement>('item').forEach((li) => li.classList.remove('active'))
     *
     * @param {string} name - The ref name
     * @return {T[]} The matching elements, or an empty array if there are none.
     */
    $refs<T extends HTMLElement = HTMLElement>(name: string): T[];
    /**
     * Get the nested model mounted on the element marked `data-ref="<name>"` (a ref on a child model's root).
     * It's returned from its construction on: with an async `beforeInit()`, it may not have finished initializing.
     *
     * @example this.$child<ZoneStack>('stack')?.isDirty
     *
     * @param {string} name - The ref name on the child model's root
     * @return {T | null} The child's instance, or null if no model is mounted there.
     */
    $child<T extends SprinculModel = SprinculModel>(name: string): T | null;
    /**
     * Get the model containing this one: the nearest `[data-model]` ancestor of this model's root.
     * Nested models mount first, so it is null during this model's own `beforeInit()`/`afterInit()` on the
     * first `init()`; reach it from event handlers and methods called later.
     *
     * @example this.$parent<ZoneEditor>()?.markDirty()
     *
     * @return {T | null} The parent's instance, or null if this model isn't nested in a mounted model.
     */
    $parent<T extends SprinculModel = SprinculModel>(): T | null;
    /**
     * Get every nested model mounted on an element marked `data-ref="<name>"`, in document order.
     *
     * @param {string} name - The ref name on the child models' roots
     * @return {T[]} The children's instances; refs with no model mounted are skipped.
     */
    $children<T extends SprinculModel = SprinculModel>(name: string): T[];
    /**
     * Read a `data-*` attribute on this model's root, converted by the fallback's type:
     * - array, object or `null`: JSON
     * - number: `Number()`
     * - boolean: `"true"` or present without a value is true, `"false"` is false
     * - string: as it is
     *
     * A missing attribute gives the fallback. So does a malformed one, with a dev-mode warning; it never throws.
     *
     * @example this.fields = this.$data<string[]>('fields', [])
     *
     * @param {string} name - The `dataset` name (camelCase: `maxSize` for `data-max-size`)
     * @param fallback - The value to use when the attribute is missing or malformed
     */
    $data<T>(name: string, fallback: T): DataValue<T>;
    /**
     * An `AbortSignal` aborted when this model is destroyed (after `beforeDestroy()` settles).
     * Pass it to anything that should stop with the model: `fetch`, `addEventListener`, `Sprincul.store.subscribe`.
     *
     * @example fetch(url, { signal: this.$signal })
     */
    get $signal(): AbortSignal;
    /**
     * Dispatch a bubbling `CustomEvent` from this model's root, for a parent model (or any code) to listen for.
     *
     * @example this.$emit('pick', { zone, module })
     *
     * @param {string} type - The event type; prefer names that don't collide with native events
     * @param detail - The event's `detail`
     * @param options - Other `CustomEvent` options, such as `cancelable` or `composed`
     * @return {CustomEvent<D>} The dispatched event, so a cancelable one can be checked with `defaultPrevented`.
     */
    $emit<D = unknown>(type: string, detail?: D, options?: Omit<CustomEventInit<D>, "detail">): CustomEvent<D>;
    /**
     * Add an event listener that is removed when this model is destroyed. With no target, it listens on this
     * model's root, where events from nested models bubble to. The handler is called with the model as `this`.
     *
     * @example this.$listen('pick', (e) => this.addModule(e.detail))
     * @example this.$listen(document, 'keydown', (e) => this.close())
     *
     * @return {() => void} A function that removes the listener early.
     */
    $listen<E extends Event = CustomEvent>(type: string, handler: (event: E) => void): () => void;
    $listen<E extends Event = Event>(target: EventTarget, type: string, handler: (event: E) => void, options?: AddEventListenerOptions): () => void;
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
