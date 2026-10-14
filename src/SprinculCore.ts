import { computed, type ReadableAtom, type MapStore } from "nanostores";
import type SprinculModel from "./SprinculModel";
import type { BoundDefaults, DomListenerRecord } from "./types";

/**
 * `deferCallbacks` holds initial callbacks until beforeInit finishes; `deferToFrame` runs them in the next
 * frame's update pass instead, for wired content that isn't in the model yet.
 */
type ProcessOptions = { defaults?: BoundDefaults; deferCallbacks: boolean; deferToFrame?: boolean; viaWire?: boolean };

/** `viaWire` marks bindings registered by wire() rather than the initial scan, so unwire() releases only what wiring added. */
type BindingRecord = { prop: string; element: HTMLElement; callback: string; viaWire: boolean };
type PendingListener = { element: HTMLElement; attributeName: string; eventName: string; methodName: string };

/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and event-listener wiring for a single model instance.
 */
export class SprinculCore {
	#bindings = new Map<string, Set<BindingRecord>>();
	/** element -> its own binding records, so dedupe and subtree release don't scan every binding */
	#bindingsByElement = new Map<HTMLElement, Set<BindingRecord>>();
	#computed = new Map<string, ReadableAtom>();
	#domListeners = new Set<DomListenerRecord>();
	/** element -> "event:method" keys already attached, so a data-on-* re-read by wire() isn't bound twice */
	#listenerKeys = new WeakMap<HTMLElement, Set<string>>();
	#unsubscribers = new Set<() => void>();
	#pendingUpdates = new Set<string>();
	#updateScheduled: boolean = false;
	#pendingInitialCallbacks: Array<BindingRecord> = [];
	/** Initial callbacks for wired content that wasn't in the model yet, run in the next frame's update pass */
	#frameCallbacks: Array<BindingRecord> = [];
	#pendingListeners: Array<PendingListener> = [];
	readonly #isBrowser: boolean;
	/** The native on* deprecation warns once per page, not once per attribute. */
	static #nativeEventsWarned = false;

	constructor(
		public instance: SprinculModel,
		private devMode: boolean = false,
		private processNativeEvents: boolean = true,
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
			this.#processTree(content, { deferCallbacks: false, viaWire: true });
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
		this.#processTree(content, { deferCallbacks: false, deferToFrame: this.#isBrowser, viaWire: true });
	}

	/**
	 * Reverses wire() for `element` and its descendants. Call before discarding a wired subtree.
	 */
	unwireElement(element: HTMLElement) {
		// contains() is true for the node itself, so this covers the element and its descendants
		const isInScope = (candidate: HTMLElement) => element.contains(candidate);

		// Walk the tracked elements rather than the DOM, so descendants already detached from
		// this subtree are still released
		Array.from(this.#bindingsByElement.keys()).forEach((node) => {
			if (!isInScope(node)) return;

			const elementBindings = this.#bindingsByElement.get(node)!;
			elementBindings.forEach((record) => {
				// Bindings from the initial scan belong to the model's own markup: releasing them
				// would silently stop a callback that unwires the container it was handed
				if (!record.viaWire) return;

				const bindings = this.#bindings.get(record.prop);
				if (bindings) {
					bindings.delete(record);
					if (bindings.size === 0) this.#bindings.delete(record.prop);
				}
				elementBindings.delete(record);
			});

			if (elementBindings.size === 0) this.#bindingsByElement.delete(node);
		});

		this.#domListeners.forEach((record) => {
			if (!isInScope(record.element)) return;
			record.element.removeEventListener(record.type, record.listener, record.options);
			this.#domListeners.delete(record);
			this.#listenerKeys.delete(record.element);
		});

		this.#pendingInitialCallbacks = this.#pendingInitialCallbacks.filter((binding) => !isInScope(binding.element));
		this.#pendingListeners = this.#pendingListeners.filter((listener) => !isInScope(listener.element));
		this.#frameCallbacks = this.#frameCallbacks.filter((binding) => !isInScope(binding.element));
	}

	/**
	 * Fires the initial data-bind-* callbacks and attaches the queued data-on-* and on* listeners from
	 * setupBindings(). Call once beforeInit has genuinely finished, so a user interaction
	 * can't reach a model method before its state is seeded.
	 */
	runQueuedInitialCallbacks() {
		const queuedCallbacks = this.#pendingInitialCallbacks;
		this.#pendingInitialCallbacks = [];

		// Drop what beforeInit's own writes scheduled before rendering, not after: these callbacks
		// render current state, and one of them may schedule an update of its own that must survive
		queuedCallbacks.forEach((binding) => this.#pendingUpdates.delete(binding.prop));

		queuedCallbacks.forEach((binding) => this.#updateElement(binding));

		const queuedListeners = this.#pendingListeners;
		this.#pendingListeners = [];
		queuedListeners.forEach(({ element, attributeName, eventName, methodName }) =>
			this.#attachListener(element, attributeName, eventName, methodName),
		);
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
			if (isOwned(el)) this.#processElementBindings(el as HTMLElement, options);
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

		// Clean up DOM event listeners registered from data-on-*/on* attributes
		this.#domListeners.forEach(({ element, type, listener, options }) => {
			element.removeEventListener(type, listener, options);
		});
		this.#domListeners.clear();
		this.#listenerKeys = new WeakMap();
		this.#bindings.clear();
		this.#bindingsByElement.clear();
		this.#computed.clear();
		this.#pendingUpdates.clear();

		// Drop anything setupBindings() queued, in case destroy() ran while beforeInit was pending
		this.#pendingInitialCallbacks = [];
		this.#pendingListeners = [];
		this.#frameCallbacks = [];
	}

	// Process all data-bind-* attributes and data-on-*/on* event handlers for an element
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

				const alreadyBound = this.#trackBinding(key, element, callbackName, options.viaWire === true);

				// Re-invoking the callback here lets a callback that re-wires its own container recurse forever
				if (alreadyBound) return;

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

				const record = {
					prop: key,
					element,
					callback: callbackName,
					viaWire: options.viaWire === true,
				};
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

			// Handle data-on-* event attributes (data-on-click, etc.), the CSP-safe form of on*
			if (attr.name.startsWith("data-on-") && attr.name.length > "data-on-".length) {
				// Kept in the DOM (unlike on*): the browser never runs it, and remounting can bind it again
				this.#queueListener(element, attr.name, attr.name.substring("data-on-".length), attr.value, options);
				return;
			}

			// Handle on* event attributes (onclick, onkeydown, etc.). With processNativeEvents off they're plain DOM.
			if (this.processNativeEvents && this.#isEventAttribute(element, attr.name)) {
				const eventName = attr.name.substring(2); // Remove 'on' prefix
				element.removeAttribute(attr.name);

				// data-on-<event> was added deliberately, so it wins and the listener is only registered once
				if (element.hasAttribute(`data-on-${eventName}`)) {
					this.#warn(`Element has both ${attr.name} and data-on-${eventName}; using data-on-${eventName}.`);
					return;
				}

				if (typeof Reflect.get(this.instance, attr.value) === "function") {
					this.#warnNativeEvent(attr.name, eventName, attr.value);
				}
				this.#queueListener(element, attr.name, eventName, attr.value, options);
			}
		});
	}

	#warnNativeEvent(attributeName: string, eventName: string, methodName: string) {
		if (SprinculCore.#nativeEventsWarned) return;
		SprinculCore.#nativeEventsWarned = true;
		console.warn(
			`[Sprincul] Binding native event attributes such as ${attributeName}="${methodName}" is deprecated and will stop in a future release; use data-on-${eventName}="${methodName}" instead. To opt in early, call Sprincul.setOption("processNativeEvents", false).`,
		);
	}

	#queueListener(
		element: HTMLElement,
		attributeName: string,
		eventName: string,
		methodName: string,
		options: ProcessOptions,
	) {
		if (options.deferCallbacks) {
			// Queue until beforeInit finishes, so it can't fire against unseeded state
			this.#pendingListeners.push({ element, attributeName, eventName, methodName });
			return;
		}

		this.#attachListener(element, attributeName, eventName, methodName);
	}

	/**
	 * Only treat `on*` as an event handler when the DOM exposes a matching handler property,
	 * so ordinary attributes that happen to start with "on" (once, only, online) are left alone.
	 */
	#isEventAttribute(element: HTMLElement, attributeName: string): boolean {
		if (!attributeName.startsWith("on") || attributeName.length <= 2) return false;

		return attributeName in element || (this.#isBrowser && attributeName in window);
	}

	#attachListener(element: HTMLElement, attributeName: string, eventName: string, methodName: string) {
		const eventFn = Reflect.get(this.instance, methodName);
		if (typeof eventFn !== "function") {
			this.#warn(`Event handler method "${methodName}" not found for ${attributeName}.`);
			return;
		}

		const key = `${eventName}:${methodName}`;
		let keys = this.#listenerKeys.get(element);
		if (!keys) {
			keys = new Set();
			this.#listenerKeys.set(element, keys);
		}
		if (keys.has(key)) return;
		keys.add(key);

		const listener: EventListener = (e: Event) => {
			try {
				eventFn.call(this.instance, e);
			} catch (error) {
				console.error(`Error in event handler "${methodName}" for event "${eventName}":`, error);
			}
		};

		element.addEventListener(eventName, listener);
		this.#domListeners.add({ element, type: eventName, listener });
	}

	/** Returns true if this element/callback pair was already tracked. */
	#trackBinding(prop: string, element: HTMLElement, callback: string, viaWire: boolean): boolean {
		let elementBindings = this.#bindingsByElement.get(element);
		if (!elementBindings) {
			elementBindings = new Set();
			this.#bindingsByElement.set(element, elementBindings);
		}

		for (const existing of elementBindings) {
			if (existing.prop === prop && existing.callback === callback) return true;
		}

		if (!this.#bindings.has(prop)) {
			this.#bindings.set(prop, new Set());
		}

		const record = { prop, element, callback, viaWire };
		this.#bindings.get(prop)!.add(record);
		elementBindings.add(record);

		return false;
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
