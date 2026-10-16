import { computed, type ReadableAtom, type MapStore } from "nanostores";
import type SprinculModel from "./SprinculModel";
import type { BoundDefaults } from "./types";

/**
 * `deferCallbacks` holds initial callbacks and listeners until beforeInit finishes; `deferToFrame` runs the callbacks
 * in the next frame's update pass instead, for wired content that isn't in the model yet.
 */
type ProcessOptions = {
	defaults?: BoundDefaults;
	deferCallbacks: boolean;
	deferToFrame?: boolean;
	wiredBy?: HTMLElement | DocumentFragment;
	wiredOutside?: boolean;
};

/**
 * What a data-bind-* or data-on-* attribute registered.
 *
 * @var {HTMLElement | DocumentFragment} wiredBy - The content wire() was given, or the data-watch element it was added to.
 * Unset for the model's own markup, which wire() and unwire() leave alone.
 * @var {boolean} wiredOutside - Content wired before it was appended, released once it leaves the model again
 */
type Wiring = { wiredBy?: HTMLElement | DocumentFragment; wiredOutside?: boolean };
type BindingRecord = Wiring & { kind: "bind"; prop: string; element: HTMLElement; callback: string };
type ListenerRecord = Wiring & {
	kind: "on";
	element: HTMLElement;
	type: string;
	method: string;
	listener: EventListener;
	attached: boolean;
};
type TrackedRecord = BindingRecord | ListenerRecord;

const wiring = ({ wiredBy, wiredOutside }: ProcessOptions): Wiring => ({ wiredBy, wiredOutside });

/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and event-listener wiring for a single model instance.
 */
export class SprinculCore {
	#bindings = new Map<string, Set<BindingRecord>>();
	/** element -> its own records, so dedupe and subtree release don't scan every record */
	#recordsByElement = new Map<HTMLElement, Set<TrackedRecord>>();
	/** content passed to wire() (or a data-watch element) -> the records it registered, found even once removed */
	#recordsByWire = new Map<HTMLElement | DocumentFragment, Set<TrackedRecord>>();
	#computed = new Map<string, ReadableAtom>();
	#unsubscribers = new Set<() => void>();
	#pendingUpdates = new Set<string>();
	#updateScheduled: boolean = false;
	#pendingInitialCallbacks: Array<BindingRecord> = [];
	/** Listeners held until beforeInit finishes, so an event can't reach a model method before its state is seeded */
	#pendingListeners: Array<ListenerRecord> = [];
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

	/**
	 * Wires `content` to this model. Content already in the model is brought in line with what it holds now: what
	 * was wired through it and has since gone is released, and what's new is bound.
	 */
	processAddedElement(content: HTMLElement | DocumentFragment) {
		if (this.instance.$el.contains(content)) {
			this.#releaseRecords(this.#goneFrom(content));
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

	/** What wiring `content` registered that it no longer holds, and content wired before appending that has left the model. */
	#goneFrom(content: HTMLElement | DocumentFragment): Set<TrackedRecord> {
		const gone = new Set<TrackedRecord>();
		this.#recordsByWire.get(content)?.forEach((record) => {
			if (!content.contains(record.element)) gone.add(record);
		});
		this.#leftModel().forEach((record) => gone.add(record));
		return gone;
	}

	/** Content wired before it was appended has no container to find it by, so it's released once it has left the model. */
	#leftModel(): TrackedRecord[] {
		const pending = new Set<TrackedRecord>(this.#frameCallbacks);
		const left: TrackedRecord[] = [];
		this.#recordsByElement.forEach((records, node) => {
			if (this.instance.$el.contains(node)) return;
			records.forEach((record) => {
				if (record.wiredOutside && !pending.has(record)) left.push(record);
			});
		});
		return left;
	}

	/**
	 * Releases what wiring `element` registered, even if since removed from it, and what was wired anywhere inside it.
	 * The model's own markup stays bound, so a callback can unwire the container it was handed.
	 */
	unwireElement(element: HTMLElement) {
		const released = new Set(this.#recordsByWire.get(element));
		this.#recordsByElement.forEach((records, node) => {
			if (!element.contains(node)) return;
			records.forEach((record) => {
				if (record.wiredBy) released.add(record);
			});
		});
		this.#leftModel().forEach((record) => released.add(record));
		this.#releaseRecords(released);
	}

	/**
	 * Applies a change to one of this model's data-watch elements: everything bound inside the elements removed from
	 * it is released, and the elements added to it are bound. An element moved within it stays bound.
	 */
	applyWatchedChanges(watched: HTMLElement, added: Set<Element>, removed: Set<Element>) {
		if (removed.size > 0) {
			const released = new Set<TrackedRecord>();
			this.#recordsByElement.forEach((records, element) => {
				if (watched.contains(element)) return;
				for (let node: Element | null = element; node; node = node.parentElement) {
					if (!removed.has(node)) continue;
					records.forEach((record) => released.add(record));
					return;
				}
			});
			this.#releaseRecords(released);
		}

		added.forEach((element) => {
			// Inside another added element (bound with it), or already gone again
			if (element.parentElement && added.has(element.parentElement)) return;
			if (!watched.contains(element)) return;
			this.#processTree(element as HTMLElement, { deferCallbacks: false, wiredBy: watched });
		});
	}

	#releaseRecords(records: Set<TrackedRecord>) {
		if (records.size === 0) return;
		records.forEach((record) => this.#release(record));
		this.#pendingInitialCallbacks = this.#pendingInitialCallbacks.filter((record) => !records.has(record));
		this.#pendingListeners = this.#pendingListeners.filter((record) => !records.has(record));
		this.#frameCallbacks = this.#frameCallbacks.filter((record) => !records.has(record));
	}

	#release(record: TrackedRecord) {
		if (record.kind === "bind") {
			const bindings = this.#bindings.get(record.prop);
			bindings?.delete(record);
			if (bindings?.size === 0) this.#bindings.delete(record.prop);
		} else if (record.attached) {
			record.element.removeEventListener(record.type, record.listener);
		}

		const elementRecords = this.#recordsByElement.get(record.element);
		elementRecords?.delete(record);
		if (elementRecords?.size === 0) this.#recordsByElement.delete(record.element);

		if (!record.wiredBy) return;
		const wired = this.#recordsByWire.get(record.wiredBy);
		wired?.delete(record);
		if (wired?.size === 0) this.#recordsByWire.delete(record.wiredBy);
	}

	/**
	 * Fires the initial data-bind-* callbacks and attaches the queued data-on-* listeners from setupBindings().
	 * Call once beforeInit has genuinely finished, so a user interaction can't reach a model method before its
	 * state is seeded.
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
		queuedListeners.forEach((record) => this.#attach(record));
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
			if (container === this.instance.$el && container.hasAttribute("data-watch")) {
				this.#warn(
					"data-watch on a model root watches the whole model; put it on the element whose contents change.",
				);
			}
		}

		container.querySelectorAll<HTMLElement>("*").forEach((el) => {
			if (isOwned(el)) this.#processElementBindings(el, options);
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

		// Remove the data-on-* listeners
		this.#recordsByElement.forEach((records) =>
			records.forEach((record) => {
				if (record.kind === "on" && record.attached) {
					record.element.removeEventListener(record.type, record.listener);
				}
			}),
		);
		this.#bindings.clear();
		this.#recordsByElement.clear();
		this.#recordsByWire.clear();
		this.#computed.clear();
		this.#pendingUpdates.clear();

		// Drop anything setupBindings() queued, in case destroy() ran while beforeInit was pending
		this.#pendingInitialCallbacks = [];
		this.#pendingListeners = [];
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

				const record = this.#track({
					kind: "bind",
					prop: key,
					element,
					callback: callbackName,
					...wiring(options),
				});

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

			// Handle data-on-* event attributes (data-on-click, etc.). Kept in the DOM so remounting can bind them again.
			if (attr.name.startsWith("data-on-") && attr.name.length > "data-on-".length) {
				this.#bindListener(element, attr.name.substring("data-on-".length), attr.value, options);
			}
		});
	}

	#bindListener(element: HTMLElement, type: string, method: string, options: ProcessOptions) {
		if (typeof Reflect.get(this.instance, method) !== "function") {
			this.#warn(`Event handler method "${method}" not found for data-on-${type}.`);
			return;
		}

		const listener: EventListener = (event) => {
			try {
				Reflect.get(this.instance, method).call(this.instance, element, event);
			} catch (error) {
				console.error(`Error in event handler "${method}" for event "${type}":`, error);
			}
		};
		const record = this.#track({
			kind: "on",
			element,
			type,
			method,
			listener,
			attached: false,
			...wiring(options),
		});
		if (!record) return;

		// Queue until beforeInit finishes, so it can't fire against unseeded state
		if (options.deferCallbacks) this.#pendingListeners.push(record);
		else this.#attach(record);
	}

	#attach(record: ListenerRecord) {
		record.element.addEventListener(record.type, record.listener);
		record.attached = true;
	}

	/** Tracks `record` and returns it, or returns null if its element already has the same binding or listener. */
	#track<T extends TrackedRecord>(record: T): T | null {
		let elementRecords = this.#recordsByElement.get(record.element);
		if (!elementRecords) {
			elementRecords = new Set();
			this.#recordsByElement.set(record.element, elementRecords);
		}

		for (const existing of elementRecords) {
			if (SprinculCore.#sameRecord(existing, record)) return null;
		}
		elementRecords.add(record);

		if (record.kind === "bind") {
			if (!this.#bindings.has(record.prop)) this.#bindings.set(record.prop, new Set());
			this.#bindings.get(record.prop)!.add(record);
		}

		if (record.wiredBy) {
			let wired = this.#recordsByWire.get(record.wiredBy);
			if (!wired) {
				wired = new Set();
				this.#recordsByWire.set(record.wiredBy, wired);
			}
			wired.add(record);
		}

		return record;
	}

	static #sameRecord(a: TrackedRecord, b: TrackedRecord): boolean {
		if (a.kind === "bind" && b.kind === "bind") return a.prop === b.prop && a.callback === b.callback;
		if (a.kind === "on" && b.kind === "on") return a.type === b.type && a.method === b.method;
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
