import { computed, type ReadableAtom, type MapStore } from "nanostores";
import type SprinculModel from "./SprinculModel";
import type { BoundDefaults } from "./types";

/**
 * `deferCallbacks` holds initial callbacks until beforeInit finishes; `deferToFrame` runs them in the next
 * frame's update pass instead, for wired content that isn't in the model yet.
 */
type ProcessOptions = {
	defaults?: BoundDefaults;
	deferCallbacks: boolean;
	deferToFrame?: boolean;
	wiredBy?: HTMLElement | DocumentFragment;
	wiredOutside?: boolean;
};

/**
 * `wiredBy` is the content wire() was given, unset for the initial scan, so unwire() releases only what wiring added.
 * `wiredOutside` marks content wired before it was appended, which is released once it leaves the model again.
 */
type BindingRecord = {
	prop: string;
	element: HTMLElement;
	callback: string;
	wiredBy?: HTMLElement | DocumentFragment;
	wiredOutside?: boolean;
};

/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and event-listener wiring for a single model instance.
 */
export class SprinculCore {
	#bindings = new Map<string, Set<BindingRecord>>();
	/** element -> its own binding records, so dedupe and subtree release don't scan every binding */
	#bindingsByElement = new Map<HTMLElement, Set<BindingRecord>>();
	/** content passed to wire() -> the bindings it registered, so they're released even after being removed from it */
	#bindingsByWire = new Map<HTMLElement | DocumentFragment, Set<BindingRecord>>();
	#computed = new Map<string, ReadableAtom>();
	/** Event types used by data-on-*, each handled by listeners on the model's root */
	#eventTypes = new Set<string>();
	/** Set once beforeInit finishes, so an event can't reach a model method before its state is seeded */
	#listening = false;
	readonly #onBubble = (event: Event) => event.bubbles && this.#dispatch(event);
	/**
	 * Events that don't bubble (focus, mouseenter, a CustomEvent without `bubbles`) never travel up to the root, but a
	 * capture listener on the root still receives them.
	 */
	readonly #onCapture = (event: Event) => !event.bubbles && this.#dispatch(event);
	/** Missing handler methods already warned about, so a missing one warns once rather than per event */
	#warnedHandlers = new Set<string>();
	#unsubscribers = new Set<() => void>();
	#pendingUpdates = new Set<string>();
	#updateScheduled: boolean = false;
	#pendingInitialCallbacks: Array<BindingRecord> = [];
	/** Initial callbacks for wired content that wasn't in the model yet, run in the next frame's update pass */
	#frameCallbacks: Array<BindingRecord> = [];
	readonly #isBrowser: boolean;

	constructor(
		public instance: SprinculModel,
		private devMode: boolean = false,
	) {
		this.#isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
	}

	static createStateProxy(
		stateStore: MapStore<Record<string, any>>,
		getCoreRef: () => SprinculCore | undefined,
	): Record<string, any> {
		const getStateValue = (prop: PropertyKey): any => {
			if (typeof prop !== "string") return undefined;

			const core = getCoreRef();
			if (core?.hasComputed(prop)) {
				return core.getComputed(prop);
			}

			return stateStore.get()[prop];
		};

		return new Proxy(
			{},
			{
				get: (_, prop: PropertyKey) => {
					return getStateValue(prop);
				},
				set: (_, prop: PropertyKey, value: any) => {
					if (typeof prop !== "string") return false;
					stateStore.setKey(prop, value);
					return true;
				},
				deleteProperty: (_, prop: PropertyKey) => {
					if (typeof prop !== "string") return false;

					const current = stateStore.get();
					if (!(prop in current)) return true;

					const { [prop]: _deleted, ...next } = current;
					stateStore.set(next);

					const core = getCoreRef();
					core?.scheduleUpdate(prop);

					return true;
				},
				ownKeys: () => {
					return Reflect.ownKeys(stateStore.get());
				},
				has: (_, prop: PropertyKey) => {
					if (typeof prop !== "string") return false;

					const core = getCoreRef();
					if (core?.hasComputed(prop)) return true;

					return prop in stateStore.get();
				},
				getOwnPropertyDescriptor: (_, prop: PropertyKey) => {
					if (typeof prop !== "string") return undefined;

					const descriptor = { configurable: true, enumerable: true };

					const state = stateStore.get();
					if (prop in state) {
						return { ...descriptor, writable: true, value: state[prop] };
					}

					const core = getCoreRef();
					if (core?.hasComputed(prop)) {
						return { ...descriptor, writable: false, value: core.getComputed(prop) };
					}

					return undefined;
				},
			},
		);
	}

	setupBindings(container: HTMLElement): BoundDefaults {
		const defaults: BoundDefaults = {};

		// Defer callbacks so any seeded state in beforeInit is available to them
		this.#processTree(container, { defaults, deferCallbacks: true });

		return SprinculCore.#matchAnyCase(defaults);
	}

	/** Lets `defaults.buttonText` find what `data-bind-buttonText` captured, which HTML stored as `buttontext`. */
	static #matchAnyCase(defaults: BoundDefaults): BoundDefaults {
		const resolve = (prop: PropertyKey): PropertyKey => {
			if (typeof prop !== "string" || Object.hasOwn(defaults, prop)) return prop;

			const folded = prop.toLowerCase();
			return Object.keys(defaults).find((name) => name.toLowerCase() === folded) ?? prop;
		};

		return new Proxy(defaults, {
			get: (target, prop) => Reflect.get(target, resolve(prop)),
			has: (target, prop) => Reflect.has(target, resolve(prop)),
			getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, resolve(prop)),
		});
	}

	processAddedElement(content: HTMLElement | DocumentFragment) {
		if (this.instance.$el.contains(content)) {
			this.#processTree(content, { deferCallbacks: false, wiredBy: content });
			return;
		}

		// On the page but outside this model: it belongs to whichever model contains it
		if (content.isConnected) {
			this.#warn("wire() was given content on the page outside this model, so nothing was bound.");
			return;
		}

		/*
		 * Not appended yet (a fragment or detached element): bind it to this model now and render it in the
		 * next frame, by which time it's usually been appended. Without a browser frame, render it now.
		 */
		this.#processTree(content, {
			deferCallbacks: false,
			deferToFrame: this.#isBrowser,
			wiredBy: content,
			wiredOutside: true,
		});
	}

	/**
	 * Reverses wire() for `element`: what wiring `element` registered, even if since removed from it, and what was
	 * wired anywhere inside it. Content wired before it was appended has no such element to find it by, so it's
	 * released once it has left the model. Bindings from the model's own markup stay, so a callback can unwire the
	 * container it was handed.
	 */
	unwireElement(element: HTMLElement) {
		const root = this.instance.$el;
		const pending = new Set(this.#frameCallbacks);
		const released = new Set(this.#bindingsByWire.get(element));
		this.#bindingsByElement.forEach((records, node) => {
			const inside = element.contains(node);
			const leftModel = !root.contains(node);
			records.forEach((record) => {
				if (!record.wiredBy) return;
				if (inside || (leftModel && record.wiredOutside && !pending.has(record))) released.add(record);
			});
		});
		if (released.size === 0) return;

		released.forEach((record) => this.#release(record));
		this.#pendingInitialCallbacks = this.#pendingInitialCallbacks.filter((record) => !released.has(record));
		this.#frameCallbacks = this.#frameCallbacks.filter((record) => !released.has(record));
	}

	/** Releases `element`'s wired bindings, then wires what it holds now. */
	rewireElement(element: HTMLElement) {
		this.unwireElement(element);
		this.processAddedElement(element);
	}

	#release(record: BindingRecord) {
		const bindings = this.#bindings.get(record.prop);
		bindings?.delete(record);
		if (bindings?.size === 0) this.#bindings.delete(record.prop);

		const elementBindings = this.#bindingsByElement.get(record.element);
		elementBindings?.delete(record);
		if (elementBindings?.size === 0) this.#bindingsByElement.delete(record.element);

		if (!record.wiredBy) return;
		const wired = this.#bindingsByWire.get(record.wiredBy);
		wired?.delete(record);
		if (wired?.size === 0) this.#bindingsByWire.delete(record.wiredBy);
	}

	/**
	 * Fires the initial data-bind-* callbacks from setupBindings() and starts handling data-on-* events.
	 * Call once beforeInit has genuinely finished, so a user interaction can't reach a model method
	 * before its state is seeded.
	 */
	runQueuedInitialCallbacks() {
		const queuedCallbacks = this.#pendingInitialCallbacks;
		this.#pendingInitialCallbacks = [];

		// Drop what beforeInit's own writes scheduled before rendering, not after: these callbacks
		// render current state, and one of them may schedule an update of its own that must survive
		queuedCallbacks.forEach((binding) => this.#pendingUpdates.delete(binding.prop));

		queuedCallbacks.forEach((binding) => this.#updateElement(binding));

		this.#listening = true;
		this.#eventTypes.forEach((type) => this.#listen(type));
	}

	#processTree(container: HTMLElement | DocumentFragment, options: ProcessOptions) {
		/*
		 * An element is this model's when its nearest [data-model] (itself included) is this model's root.
		 * Content not in the model yet has no such root above it, so there it's the elements with none at all.
		 * Either way, nested model roots and everything inside them belong to their own instance.
		 */
		const owner = this.instance.$el.contains(container) ? this.instance.$el : null;
		const isOwned = (element: Element) => element.closest("[data-model]") === owner;

		if (container instanceof HTMLElement && isOwned(container)) {
			this.#processElementBindings(container, options);
		}

		container.querySelectorAll("*").forEach((el) => {
			if (!isOwned(el)) return;
			this.#processElementBindings(el as HTMLElement, options);
			// Content rendered from a template later is handled by the root, so learn its event types now
			if (el.localName === "template") this.#addTemplateEventTypes((el as HTMLTemplateElement).content);
		});
	}

	#addTemplateEventTypes(content: DocumentFragment) {
		content.querySelectorAll("*").forEach((el) => {
			Array.from(el.attributes).forEach((attr) => {
				if (attr.name.startsWith("data-on-") && attr.name.length > "data-on-".length) {
					this.#addEventType(attr.name.substring("data-on-".length));
				}
			});
			if (el.localName === "template") this.#addTemplateEventTypes((el as HTMLTemplateElement).content);
		});
	}

	registerComputed(key: string, computedStore: ReadableAtom) {
		this.#computed.set(key, computedStore);
	}

	getComputed(key: string): any {
		return this.#computed.get(key)?.get();
	}

	hasComputed(key: string): boolean {
		return this.#computed.has(key);
	}

	registerComputedFromModel(
		key: string,
		fn: () => any,
		dependencies: string[],
		stateStore: MapStore<Record<string, any>>,
	): (() => void) | void {
		// Create a computed store that recalculates when dependencies change
		const computedStore = computed(stateStore, fn);

		// Register with core
		this.registerComputed(key, computedStore);

		// Subscribe only to the specific state keys this computed depends on
		if (dependencies.length > 0) {
			const unsubscribe = stateStore.listen((_, __, changed) => {
				// Only update if one of our dependencies changed
				if (changed && dependencies.includes(changed as string)) {
					this.scheduleUpdate(key);
				}
			});

			// Store unsubscribe function for automatic cleanup
			this.#unsubscribers.add(unsubscribe);

			// Return wrapped unsubscribe function for manual cleanup
			return () => {
				this.#unsubscribers.delete(unsubscribe);
				unsubscribe();
			};
		}
	}

	scheduleUpdate(key: string) {
		if (!this.#isBrowser) return;

		// Bindings are keyed in lowercase, since HTML lowercases the attribute names they come from
		this.#pendingUpdates.add(key.toLowerCase());
		this.#scheduleFrame();
	}

	#scheduleFrame() {
		if (this.#updateScheduled) return;
		this.#updateScheduled = true;

		requestAnimationFrame(() => {
			// One pass per frame: an element bound to both a source prop and a computed derived
			// from it would otherwise run the same callback once per prop
			const updated = new Map<HTMLElement, Set<string>>();

			const frameCallbacks = this.#frameCallbacks;
			this.#frameCallbacks = [];
			frameCallbacks.forEach((binding) => {
				if (this.#markUpdated(updated, binding)) this.#updateElement(binding);
			});

			this.#pendingUpdates.forEach((prop) => this.#updateDependentElements(prop, updated));
			this.#pendingUpdates.clear();
			this.#updateScheduled = false;
		});
	}

	destroy() {
		// Clean up computed property listeners
		this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
		this.#unsubscribers.clear();

		// Remove the root's data-on-* listeners, and keep a later #addEventType() from adding any
		if (this.#listening) {
			const root = this.instance.$el;
			this.#eventTypes.forEach((type) => {
				root.removeEventListener(type, this.#onBubble);
				root.removeEventListener(type, this.#onCapture, true);
			});
		}
		this.#listening = false;
		this.#eventTypes.clear();
		this.#bindings.clear();
		this.#bindingsByElement.clear();
		this.#bindingsByWire.clear();
		this.#computed.clear();
		this.#pendingUpdates.clear();

		// Drop anything setupBindings() queued, in case destroy() ran while beforeInit was pending
		this.#pendingInitialCallbacks = [];
		this.#frameCallbacks = [];
	}

	// Process all data-bind-* attributes and data-on-* event handlers for an element
	#processElementBindings(element: HTMLElement, options: ProcessOptions) {
		Array.from(element.attributes).forEach((attr) => {
			// Refs are looked up when read; the scan only flags names that could never match
			if (attr.name === "data-ref") {
				if (/\s/.test(attr.value.trim())) {
					this.#warn(`data-ref="${attr.value}" contains whitespace; a ref takes a single name.`);
				}
				return;
			}

			// Handle data-bind-* attributes for reactive property bindings (e.g. data-bind-<prop>="callbackFn")
			if (attr.name.startsWith("data-bind-")) {
				// The state property to watch, named by the same rule as dataset (data-bind-button-text -> buttonText)
				const propertyName = attr.name
					.substring("data-bind-".length)
					.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
				// HTML lowercased the attribute, so it's matched to state keys in any case (buttontext -> buttonText)
				const key = propertyName.toLowerCase();
				const callbackName = attr.value; // The callback to call when it changes

				const record = this.#trackBinding(key, element, callbackName, options);

				// Re-invoking the callback here lets a callback that re-wires its own container recurse forever
				if (!record) return;

				// Capture server-rendered content before any callback touches it (first element wins)
				if (options.defaults && !Object.prototype.hasOwnProperty.call(options.defaults, propertyName)) {
					const isCheckable =
						element instanceof HTMLInputElement &&
						(element.type === "checkbox" || element.type === "radio");
					const isMultiSelect = element instanceof HTMLSelectElement && element.multiple;

					options.defaults[propertyName] = {
						input: {
							value: (element as HTMLInputElement).value ?? undefined,
							checked: isCheckable ? element.checked : undefined,
							selectedValues: isMultiSelect
								? Array.from(element.selectedOptions).map((option) => option.value)
								: undefined,
						},
						text: element.textContent ?? "",
						html: element.innerHTML ?? "",
					};
				}

				const bindFn = Reflect.get(this.instance, callbackName);
				if (typeof bindFn !== "function") {
					this.#warn(`Binding callback "${callbackName}" not found for ${attr.name}.`);
					return;
				}

				if (options.deferCallbacks) {
					this.#pendingInitialCallbacks.push(record);
					return;
				}
				if (options.deferToFrame) {
					this.#frameCallbacks.push(record);
					this.#scheduleFrame();
					return;
				}

				// Call the callback initially
				try {
					bindFn.call(this.instance, element);
				} catch (error) {
					console.error(`Error in binding callback "${callbackName}" for property "${propertyName}":`, error);
				}
				return;
			}

			// data-on-* (data-on-click, etc.) is read when the event fires; the scan only learns its event type
			if (attr.name.startsWith("data-on-") && attr.name.length > "data-on-".length) {
				this.#addEventType(attr.name.substring("data-on-".length));
				if (typeof Reflect.get(this.instance, attr.value) !== "function")
					this.#warnMissingHandler(attr.name, attr.value);
			}
		});
	}

	#addEventType(type: string) {
		if (this.#eventTypes.has(type)) return;
		this.#eventTypes.add(type);
		if (this.#listening) this.#listen(type);
	}

	#listen(type: string) {
		this.instance.$el.addEventListener(type, this.#onBubble);
		this.instance.$el.addEventListener(type, this.#onCapture, true);
	}

	/**
	 * The element nearest the event's target with a data-on-<type> for it (the target or its closest such ancestor)
	 * is the boundary: it handles the event, and elements further up in the same model don't. A match inside a
	 * nested model is that model's, so the search carries on above it. Between models the event bubbles natively.
	 */
	#dispatch(event: Event) {
		const root = this.instance.$el;
		const attribute = `data-on-${event.type}`;
		const target = event.target as Node | null;

		for (let el = target?.nodeType === 1 ? (target as Element) : null; el; el = el.parentElement) {
			if (el.hasAttribute(attribute)) {
				const owner = el.closest("[data-model]")!;
				if (owner === root) {
					this.#callHandler(el as HTMLElement, attribute, event);
					return;
				}
				// A nested model's match is its own, so carry on above that model
				el = owner;
			}
			// A non-bubbling event only reaches its own target's handler
			if (el === root || !event.bubbles) return;
		}
	}

	#callHandler(element: HTMLElement, attribute: string, event: Event) {
		const methodName = element.getAttribute(attribute)!;
		const handler = Reflect.get(this.instance, methodName);
		if (typeof handler !== "function") {
			this.#warnMissingHandler(attribute, methodName);
			return;
		}

		try {
			handler.call(this.instance, element, event);
		} catch (error) {
			console.error(`Error in event handler "${methodName}" for event "${event.type}":`, error);
		}
	}

	#warnMissingHandler(attribute: string, methodName: string) {
		const key = `${attribute}=${methodName}`;
		if (this.#warnedHandlers.has(key)) return;
		this.#warnedHandlers.add(key);
		this.#warn(`Event handler method "${methodName}" not found for ${attribute}.`);
	}

	/** Returns the new record, or null if this element/callback pair was already tracked. */
	#trackBinding(
		prop: string,
		element: HTMLElement,
		callback: string,
		{ wiredBy, wiredOutside }: ProcessOptions,
	): BindingRecord | null {
		let elementBindings = this.#bindingsByElement.get(element);
		if (!elementBindings) {
			elementBindings = new Set();
			this.#bindingsByElement.set(element, elementBindings);
		}

		for (const existing of elementBindings) {
			if (existing.prop === prop && existing.callback === callback) return null;
		}

		if (!this.#bindings.has(prop)) {
			this.#bindings.set(prop, new Set());
		}

		const record: BindingRecord = { prop, element, callback, wiredBy, wiredOutside };
		this.#bindings.get(prop)!.add(record);
		elementBindings.add(record);

		if (wiredBy) {
			let wired = this.#bindingsByWire.get(wiredBy);
			if (!wired) {
				wired = new Set();
				this.#bindingsByWire.set(wiredBy, wired);
			}
			wired.add(record);
		}

		return record;
	}

	#updateDependentElements(prop: string, updated?: Map<HTMLElement, Set<string>>) {
		const dependentElements = this.#bindings.get(prop);
		if (!dependentElements) return;

		dependentElements.forEach((binding) => {
			if (updated && !this.#markUpdated(updated, binding)) return;

			this.#updateElement(binding);
		});
	}

	/** Records this frame's work for a binding; false if the same callback already ran on it. */
	#markUpdated(updated: Map<HTMLElement, Set<string>>, binding: BindingRecord): boolean {
		let callbacks = updated.get(binding.element);
		if (!callbacks) {
			callbacks = new Set();
			updated.set(binding.element, callbacks);
		}

		if (callbacks.has(binding.callback)) return false;

		callbacks.add(binding.callback);
		return true;
	}

	#updateElement(binding: { element: HTMLElement; callback: string }) {
		const fn = Reflect.get(this.instance, binding.callback);
		if (typeof fn === "function") {
			try {
				fn.call(this.instance, binding.element);
			} catch (error) {
				console.error(`Error in binding callback "${binding.callback}":`, error);
			}
		}
	}

	/** Dev-mode warning on behalf of the model. */
	warn(message: string) {
		this.#warn(message);
	}

	#warn(message: string) {
		if (!this.devMode) return;
		console.warn(`[Sprincul] ${message}`);
	}
}
