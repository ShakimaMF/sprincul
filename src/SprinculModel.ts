import { map, type MapStore } from "nanostores";
import { SprinculCore } from "./SprinculCore";
import { getCore } from "./registry";
import type { BoundDefaults } from "./types";

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
	wire(element: HTMLElement): void {
		const core = this.#core || getCore(this);
		if (!core) {
			throw new Error(
				`[Sprincul] wire() called before core was available. Call it from beforeInit() or later instead.`,
			);
		}

		core.processAddedElement(element);
	}

	/**
	 * Release the data-bind-* bindings and on* listeners for an element and its descendants.
	 * Call this before discarding content a model rebuilds on every render.
	 *
	 * @param {HTMLElement} element - The element (and its descendants) to release. Call this before detaching it.
	 * @return {void} Does not return a value.
	 * @throws {Error} If the method is called before the core is available.
	 */
	unwire(element: HTMLElement): void {
		const core = this.#core || getCore(this);
		if (!core) {
			throw new Error(
				`[Sprincul] unwire() called before core was available. Call it from beforeInit() or later instead.`,
			);
		}

		core.unwireElement(element);
	}

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
		dependencies: Array<string> = [],
	): () => void {
		if (dependencies.length === 0) {
			console.warn(
				`[Sprincul] addComputedProp("${name}") called without dependencies. Bound elements will not re-render when the value changes.`,
			);
		}

		const core = this.#core || getCore(this);
		if (!core) {
			throw new Error(
				`[Sprincul] addComputedProp("${name}") called before core was available. Call it from beforeInit() or later instead.`,
			);
		}

		const callback = () => Reflect.apply(fn as Function, this, []);
		return core.registerComputedFromModel(name, callback, dependencies, this.#state) ?? (() => {});
	}
}
