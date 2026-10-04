import { map, type MapStore } from "nanostores";
import { SprinculCore } from "./SprinculCore";
import { getCore, getInstance, getSignal } from "./registry";
import type { BoundDefaults, DataValue } from "./types";

/** Returned by #parseData for a value that can't be read as the fallback's type. */
const MALFORMED = Symbol("malformed");

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
	 * Get the first element marked `data-ref="<name>"` within this model.
	 *
	 * @example this.$ref<HTMLInputElement>('email')?.focus()
	 *
	 * @param {string} name - The ref name
	 * @return {T | null} The first matching element, or null if there is none.
	 */
	$ref<T extends HTMLElement = HTMLElement>(name: string): T | null {
		return (this.$refs<T>(name)[0] as T | undefined) ?? null;
	}

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
	$refs<T extends HTMLElement = HTMLElement>(name: string): T[] {
		const matches = Array.from(this.$el.querySelectorAll<T>("[data-ref]")).filter(
			(element) =>
				element.getAttribute("data-ref")!.trim() === name && SprinculModel.#ownerOf(element) === this.$el,
		);

		if (matches.length === 0 && this.$el.getAttribute("data-ref")?.trim() === name) {
			(this.#core || getCore(this))?.warn(
				`$ref("${name}") matches this model's own root, which is its parent model's ref, not its own.`,
			);
		}

		return matches;
	}

	/**
	 * Get the nested model mounted on the element marked `data-ref="<name>"` (a ref on a child model's root).
	 * It's returned from its construction on: with an async `beforeInit()`, it may not have finished initializing.
	 *
	 * @example this.$child<ZoneStack>('stack')?.isDirty
	 *
	 * @param {string} name - The ref name on the child model's root
	 * @return {T | null} The child's instance, or null if no model is mounted there.
	 */
	$child<T extends SprinculModel = SprinculModel>(name: string): T | null {
		const element = this.$ref(name);
		return element ? ((getInstance(element) as T | undefined) ?? null) : null;
	}

	/**
	 * Get the model containing this one: the nearest `[data-model]` ancestor of this model's root.
	 * Nested models mount first, so it is null during this model's own `beforeInit()`/`afterInit()` on the
	 * first `init()`; reach it from event handlers and methods called later.
	 *
	 * @example this.$parent<ZoneEditor>()?.markDirty()
	 *
	 * @return {T | null} The parent's instance, or null if this model isn't nested in a mounted model.
	 */
	$parent<T extends SprinculModel = SprinculModel>(): T | null {
		const element = this.$el.parentElement?.closest<HTMLElement>("[data-model]");
		return element ? ((getInstance(element) as T | undefined) ?? null) : null;
	}

	/**
	 * Get every nested model mounted on an element marked `data-ref="<name>"`, in document order.
	 *
	 * @param {string} name - The ref name on the child models' roots
	 * @return {T[]} The children's instances; refs with no model mounted are skipped.
	 */
	$children<T extends SprinculModel = SprinculModel>(name: string): T[] {
		return this.$refs(name)
			.map((element) => getInstance(element) as T | undefined)
			.filter((instance): instance is T => instance !== undefined);
	}

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
	$data<T>(name: string, fallback: T): DataValue<T> {
		const raw = this.$el.dataset[name];
		if (raw === undefined) return fallback as DataValue<T>;

		const value = SprinculModel.#parseData(raw, fallback);
		if (value !== MALFORMED) return value as DataValue<T>;

		const attribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
		(this.#core || getCore(this))?.warn(
			`${attribute}="${raw}" on model "${this.$el.dataset.model}" can't be read like its fallback; using the fallback.`,
		);
		return fallback as DataValue<T>;
	}

	static #parseData(raw: string, fallback: unknown): unknown {
		switch (typeof fallback) {
			case "number": {
				const value = Number(raw);
				return raw.trim() === "" || Number.isNaN(value) ? MALFORMED : value;
			}
			case "boolean":
				if (raw === "" || raw === "true") return true;
				return raw === "false" ? false : MALFORMED;
			case "object": {
				let value: unknown;
				try {
					value = JSON.parse(raw);
				} catch {
					return MALFORMED;
				}

				// null accepts any JSON; an array or object fallback needs the same shape back
				if (fallback === null) return value;
				if (Array.isArray(fallback)) return Array.isArray(value) ? value : MALFORMED;
				return value !== null && typeof value === "object" && !Array.isArray(value) ? value : MALFORMED;
			}
			default:
				return raw;
		}
	}

	/** The model a ref belongs to: a ref on a nested model's root is its parent's handle on that child. */
	static #ownerOf(element: HTMLElement): Element | null {
		const scope = element.hasAttribute("data-model") ? element.parentElement : element;
		return scope?.closest("[data-model]") ?? null;
	}

	/**
	 * An `AbortSignal` aborted when this model is destroyed (after `beforeDestroy()` settles).
	 * Pass it to anything that should stop with the model: `fetch`, `addEventListener`, `Sprincul.store.subscribe`.
	 *
	 * @example fetch(url, { signal: this.$signal })
	 */
	get $signal(): AbortSignal {
		return getSignal(this);
	}

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
	$emit<D = unknown>(type: string, detail?: D, options?: Omit<CustomEventInit<D>, "detail">): CustomEvent<D> {
		if (`on${type}` in this.$el) {
			(this.#core || getCore(this))?.warn(
				`$emit("${type}") uses a native event name, so it mixes with the native events bubbling through the same elements.`,
			);
		}

		const event = new CustomEvent<D>(type, { bubbles: true, ...options, detail });
		this.$el.dispatchEvent(event);
		return event;
	}

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
	$listen<E extends Event = Event>(
		target: EventTarget,
		type: string,
		handler: (event: E) => void,
		options?: AddEventListenerOptions,
	): () => void;
	$listen(...args: any[]): () => void {
		const [target, type, handler, options]: [
			EventTarget,
			string,
			(event: Event) => void,
			AddEventListenerOptions?,
		] = typeof args[0] === "string" ? [this.$el, args[0], args[1]] : [args[0], args[1], args[2], args[3]];

		// Each listener gets its own controller following $signal, so removing it early also detaches it from $signal
		const signal = this.$signal;
		const controller = new AbortController();
		const stop = () => {
			signal.removeEventListener("abort", stop);
			controller.abort();
		};

		if (signal.aborted) {
			controller.abort();
		} else {
			signal.addEventListener("abort", stop, { once: true });
		}

		target.addEventListener(
			type,
			(event: Event) => {
				// A once listener is gone after it fires, so release its hold on $signal too
				if (options?.once) stop();
				handler.call(this, event);
			},
			{ ...options, signal: controller.signal },
		);
		return stop;
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
