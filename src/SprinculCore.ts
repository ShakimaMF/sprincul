import { computed, type ReadableAtom, type MapStore } from "nanostores";
import type SprinculModel from "./SprinculModel";
import type { BoundDefaults, DomListenerRecord } from "./types";

/**
 * @class SprinculCore
 * @description Framework base class. Handles all binding, computed properties, and event-listener wiring for a single model instance.
 */
export class SprinculCore {
	#bindings = new Map<string, Set<{ element: HTMLElement; callback: string }>>();
	#computed = new Map<string, ReadableAtom>();
	#domListeners = new Set<DomListenerRecord>();
	#unsubscribers = new Set<() => void>();
	#pendingUpdates = new Set<string>();
	#updateScheduled: boolean = false;
	#pendingInitialCallbacks: Array<{ element: HTMLElement; callback: string }> = [];
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

		return defaults;
	}

	processAddedElement(element: HTMLElement) {
		this.#processTree(element, { deferCallbacks: false });
	}

	runQueuedInitialCallbacks() {
		const queued = this.#pendingInitialCallbacks;
		this.#pendingInitialCallbacks = [];
		queued.forEach((binding) => this.#updateElement(binding));
	}

	#processTree(container: HTMLElement, options: { defaults?: BoundDefaults; deferCallbacks: boolean }) {
		const isNestedModelRoot = container.hasAttribute("data-model") && container !== this.instance.$el;
		const closestModelElement = container.closest("[data-model]");
		const withinThisModel = container === this.instance.$el || closestModelElement === this.instance.$el;

		if (!isNestedModelRoot && withinThisModel) {
			this.#processElementBindings(container, options);
		}

		container.querySelectorAll("*").forEach((el) => {
			const element = el as HTMLElement;
			const closest = element.closest("[data-model]");

			// Skip nested model elements - they will be processed by their own instance
			if (element.hasAttribute("data-model") && element !== container) return;
			if (closest !== this.instance.$el) return;

			this.#processElementBindings(element, options);
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

		this.#pendingUpdates.add(key);
		if (!this.#updateScheduled) {
			this.#updateScheduled = true;
			requestAnimationFrame(() => {
				this.#pendingUpdates.forEach((prop) => this.#updateDependentElements(prop));
				this.#pendingUpdates.clear();
				this.#updateScheduled = false;
			});
		}
	}

	destroy() {
		// Clean up computed property listeners
		this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
		this.#unsubscribers.clear();

		// Clean up DOM event listeners registered from on* attributes
		this.#domListeners.forEach(({ element, type, listener, options }) => {
			element.removeEventListener(type, listener, options);
		});
		this.#domListeners.clear();
		this.#bindings.clear();
		this.#computed.clear();
		this.#pendingUpdates.clear();
	}

	// Process all data-bind-* attributes and on* event handlers for an element
	#processElementBindings(element: HTMLElement, options: { defaults?: BoundDefaults; deferCallbacks: boolean }) {
		Array.from(element.attributes).forEach((attr) => {
			// Handle data-bind-* attributes for reactive property bindings (e.g. data-bind-<prop>="callbackFn")
			if (attr.name.startsWith("data-bind-")) {
				const propertyName = attr.name.substring("data-bind-".length); // The state property to watch
				const callbackName = attr.value; // The callback to call when it changes

				// Track this binding: when propertyName changes, update this element
				this.#trackBinding(propertyName, element, callbackName);

				// Capture server-rendered content before any callback touches it (first element wins)
				if (options.defaults && !(propertyName in options.defaults)) {
					const isCheckable =
						element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio");
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
					this.#warn(`Binding callback "${callbackName}" not found for data-bind-${propertyName}.`);
					return;
				}

				if (options.deferCallbacks) {
					this.#pendingInitialCallbacks.push({ element, callback: callbackName });
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

			// Handle on* event attributes (onclick, onkeydown, etc.)
			if (attr.name.startsWith("on") && attr.name.length > 2) {
				const eventName = attr.name.substring(2); // Remove 'on' prefix
				const methodName = attr.value;
				element.removeAttribute(attr.name);

				// Bind the event to the model method
				const eventFn = Reflect.get(this.instance, methodName);
				if (typeof eventFn !== "function") {
					this.#warn(`Event handler method "${methodName}" not found for ${attr.name}.`);
					return;
				}

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
		});
	}

	#trackBinding(prop: string, element: HTMLElement, callback: string) {
		if (!this.#bindings.has(prop)) {
			this.#bindings.set(prop, new Set());
		}

		const bindings = this.#bindings.get(prop)!;

		// Guard against double-binding when #processTree walks the same element twice
		const alreadyBound = Array.from(bindings).some(
			(binding) => binding.element === element && binding.callback === callback,
		);
		if (alreadyBound) return;

		bindings.add({ element, callback });
	}

	#updateDependentElements(prop: string) {
		const dependentElements = this.#bindings.get(prop);
		if (!dependentElements) return;

		dependentElements.forEach((binding) => {
			this.#updateElement(binding);
		});
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

	#warn(message: string) {
		if (!this.devMode) return;
		console.warn(`[Sprincul] ${message}`);
	}
}
