import { atom } from "nanostores";
import { SprinculCore } from "./SprinculCore";
import SprinculModel from "./SprinculModel";
import type {
	SprinculInitOptions,
	SprinculModelConstructor,
	SprinculModelInfo,
	SprinculModelRegistry,
	SprinculMountOptions,
} from "./types";
import { deleteCore, getCore, setCore } from "./registry";

/**
 * @class Sprincul
 * @description Static registry and factory. Manages model registration, initialization, and lifecycle.
 */
export default class Sprincul {
	static #registry: SprinculModelRegistry = new Map();
	static #isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
	static #globalStores = new Map<string, ReturnType<typeof atom>>();
	static #processedElements = new WeakSet<HTMLElement>();
	static #instancesByName = new Map<string, Set<SprinculModel>>();
	static #modelNames = new WeakMap<SprinculModel, string>();
	/** Instances mid-teardown: guards against a re-entrant destroy() invoking beforeDestroy twice. */
	static #destroying = new WeakSet<SprinculModel>();
	/** Instances with a still-pending async beforeInit. */
	static #pendingBeforeInit = new WeakSet<SprinculModel>();

	static store = {
		get<T = any>(key: string): T | undefined {
			const store = Sprincul.#globalStores.get(key);
			return store ? (store.get() as T) : undefined;
		},
		set<T = any>(key: string, value: T): void {
			if (!Sprincul.#globalStores.has(key)) {
				Sprincul.#globalStores.set(key, atom<T>(value));
			}
			Sprincul.#globalStores.get(key)!.set(value);
		},
		subscribe<T = any>(key: string, callback: (value: T | undefined) => void): () => void {
			if (!Sprincul.#globalStores.has(key)) {
				// Initialize an atom that can hold undefined until a value is set
				Sprincul.#globalStores.set(key, atom<T | undefined>());
			}
			return Sprincul.#globalStores.get(key)!.listen(callback as (value: any) => void);
		},
		clear(): void {
			Sprincul.#globalStores.clear();
		},
	};

	/**
	 * Register a single model class
	 */
	static register(name: string, modelClass: SprinculModelConstructor) {
		Sprincul.#registry.set(name, modelClass);
	}

	/**
	 * Register multiple model classes at once
	 */
	static registerAll(models: Record<string, SprinculModelConstructor>) {
		for (const [name, cls] of Object.entries(models)) {
			Sprincul.#registry.set(name, cls);
		}
	}

	/**
	 * Initiate a one-time scan of every `[data-model]` element within `options.root` (default `document.body`).
	 *
	 * @param {SprinculInitOptions} options
	 *
	 * @return {void}
	 */
	static init(options?: SprinculInitOptions): void {
		if (!Sprincul.#isBrowser) {
			console.warn("[Sprincul] init() called in non-browser environment. Skipping initialization.");
			return;
		}

		const devMode = options?.devMode ?? false;
		const root = options?.root ?? document.body;

		const modelElements = Array.from(root.querySelectorAll("[data-model]"));
		if (root.hasAttribute("data-model")) modelElements.unshift(root);

		const modelInfos: SprinculModelInfo[] = [];

		modelElements.forEach((element) => {
			try {
				const info = Sprincul.processModelElement(element as HTMLElement, devMode);
				if (info) modelInfos.push(info);
			} catch (e) {
				console.error(`[Sprincul] Failed to process model element:`, e);
			}
		});

		// Remove page-level cloaks once every model's hooks have been called (not necessarily completed)
		root.querySelectorAll("[data-cloaked]:not([data-model])").forEach((element) => {
			element.removeAttribute("data-cloaked");
		});

		if (options?.onReady) {
			const publicModels = devMode ? modelInfos : modelInfos.map(({ name, element }) => ({ name, element }));

			try {
				options.onReady(publicModels);
			} catch (error) {
				console.error("Error in onReady callback:", error);
			}
		}
	}

	/**
	 * Process a single model element
	 * Creates both the user model instance and internal core instance
	 *
	 * @param {HTMLElement} element
	 * @param {Boolean} devMode
	 *
	 * @returns The model info, or `null` if the element couldn't be processed
	 */
	static processModelElement(element: HTMLElement, devMode: boolean = false): SprinculModelInfo | null {
		const modelName = element.dataset.model;
		if (!modelName) {
			console.warn('[Sprincul] Element is missing a "data-model" attribute. Skipping.');
			return null;
		}

		const ModelClass = this.#registry.get(modelName);
		if (!ModelClass) {
			console.warn(`[Sprincul] The model "${modelName}" is not registered. Skipping.`);
			return null;
		}

		if (Sprincul.#processedElements.has(element)) return null;
		Sprincul.#processedElements.add(element);

		// Create user's model instance, then link internal core instance
		const model = new ModelClass(element);
		const core = new SprinculCore(model, devMode);
		setCore(model, core);
		Sprincul.#trackModelInstance(modelName, model);

		const defaults = core.setupBindings(element);

		// beforeInit is called synchronously; if it returns a Promise, everything below (initial
		// callbacks, listeners, afterInit) waits for it to resolve instead of running immediately.
		let beforeInitResult: unknown;
		try {
			beforeInitResult = Sprincul.#runHook(model, "beforeInit", true, [defaults]);
		} catch (e) {
			console.error('Error in "beforeInit" hook call:', e);
		}

		if (beforeInitResult instanceof Promise) {
			Sprincul.#pendingBeforeInit.add(model);
			beforeInitResult
				.catch((e) => console.error('Error in "beforeInit" hook call:', e))
				.finally(() => {
					Sprincul.#pendingBeforeInit.delete(model);
					// May have been destroyed while pending; don't resurrect a torn-down core.
					if (Sprincul.#destroying.has(model)) return;

					core.runQueuedInitialCallbacks();
					Sprincul.#runAfterInit(model, element);
				});
		} else {
			// beforeInit may have synchronously destroyed this very instance (e.g. called unmount()
			// on itself); don't run afterInit or report it as ready if so.
			if (Sprincul.#destroying.has(model)) return null;

			core.runQueuedInitialCallbacks();
			Sprincul.#runAfterInit(model, element);
		}

		return { name: modelName, element, instance: model };
	}

	/** Calls afterInit and removes the element's cloak once it settles. */
	static #runAfterInit(model: SprinculModel, element: HTMLElement): void {
		let afterHook: unknown;
		try {
			afterHook = Sprincul.#runHook(model, "afterInit", true);
		} catch (e) {
			console.error('Error in "afterInit" hook call:', e);
		}
		Promise.resolve(afterHook)
			.catch((e) => console.error('Error in "afterInit" hook call:', e))
			.finally(() => {
				if (element.hasAttribute("data-cloaked")) {
					element.removeAttribute("data-cloaked");
				}
			});
	}

	/**
	 * Manually mount a model instance on a specific element
	 *
	 * @param element - The HTML element to bind to
	 * @param modelClassOrName - Either a registered model class or the name of a registered model
	 * @param options
	 *
	 * @returns The created model instance
	 */
	static mount<T extends SprinculModel = SprinculModel>(
		element: HTMLElement,
		modelClassOrName: SprinculModelConstructor | string,
		options?: SprinculMountOptions,
	): T {
		let modelName: string;

		if (typeof modelClassOrName === "string") {
			const resolved = Sprincul.#registry.get(modelClassOrName);
			if (!resolved) {
				throw new Error(`Model "${modelClassOrName}" is not registered.`);
			}
			modelName = modelClassOrName;
		} else {
			const existing = Array.from(Sprincul.#registry.entries()).find(([, cls]) => cls === modelClassOrName);

			if (existing) {
				modelName = existing[0];
			} else {
				modelName = modelClassOrName.name || "AnonymousModel";
				let uniqueName = modelName;
				let counter = 1;
				while (Sprincul.#registry.has(uniqueName)) {
					uniqueName = `${modelName}_${counter++}`;
				}
				modelName = uniqueName;
				Sprincul.register(modelName, modelClassOrName);
			}
		}

		element.dataset.model = modelName;

		const devMode = options?.devMode ?? false;
		const info = Sprincul.processModelElement(element, devMode);
		if (!info || !info.instance) {
			throw new Error(`Failed to mount model on element. It may already be processed. Call unmount() first.`);
		}

		if (options?.onReady) {
			const publicInfo = devMode ? info : { name: info.name, element: info.element };

			try {
				options.onReady(publicInfo);
			} catch (error) {
				console.error("Error in onReady callback:", error);
			}
		}

		return info.instance as T;
	}

	/**
	 * Unmount a model instance from a specific element
	 * @param element - The HTML element to unmount from
	 * @param modelName - Optional model name to target specific instance
	 */
	static unmount(element: HTMLElement, modelName?: string): void {
		const name = modelName || element.dataset.model;
		if (!name) {
			console.warn("[Sprincul] unmount() called on element without a model.");
			return;
		}
		Sprincul.destroy(name, element);
	}

	/**
	 * Destroy a model instance by name. If `element` is provided, destroy only that instance.
	 * Otherwise, destroy all instances of the model.
	 *
	 * @param modelName
	 * @param element
	 */
	static destroy(modelName: string, element?: HTMLElement): void {
		const instances = Sprincul.#instancesByName.get(modelName);
		if (!instances || instances.size === 0) return;

		if (element) {
			const target = Array.from(instances).find((instance) => instance.$el === element);
			if (target) {
				Sprincul.#destroyInstance(target);
			}
			return;
		}

		Array.from(instances).forEach((instance) => {
			Sprincul.#destroyInstance(instance);
		});
	}

	static destroyAll(): void {
		Array.from(Sprincul.#instancesByName.keys()).forEach((modelName) => {
			Sprincul.destroy(modelName);
		});
	}

	static #destroyInstance(model: SprinculModel): void {
		if (Sprincul.#destroying.has(model)) return;
		Sprincul.#destroying.add(model);

		// beforeDestroy is called synchronously; if it returns a Promise, the core stays attached and
		// tracked until it resolves (a remount attempt in the meantime is treated as already processed).
		let beforeDestroyResult: unknown;
		try {
			beforeDestroyResult = Sprincul.#runHook(model, "beforeDestroy", true);
		} catch (e) {
			console.error('Error in "beforeDestroy" hook call:', e);
		}

		if (beforeDestroyResult instanceof Promise) {
			beforeDestroyResult
				.catch((e) => console.error('Error in "beforeDestroy" hook call:', e))
				.finally(() => Sprincul.#finishDestroy(model));
		} else {
			Sprincul.#finishDestroy(model);
		}
	}

	static #finishDestroy(model: SprinculModel): void {
		const core = getCore(model);
		if (core) {
			try {
				core.destroy();
			} finally {
				deleteCore(model);
			}
		}
		Sprincul.#processedElements.delete(model.$el);
		Sprincul.#untrackModelInstance(model);
	}

	static #trackModelInstance(modelName: string, model: SprinculModel): void {
		if (!Sprincul.#instancesByName.has(modelName)) {
			Sprincul.#instancesByName.set(modelName, new Set());
		}

		Sprincul.#instancesByName.get(modelName)!.add(model);
		Sprincul.#modelNames.set(model, modelName);
	}

	static #untrackModelInstance(model: SprinculModel): void {
		const modelName = Sprincul.#modelNames.get(model);
		if (!modelName) return;

		const instances = Sprincul.#instancesByName.get(modelName);
		if (!instances) return;

		instances.delete(model);
		if (instances.size === 0) {
			Sprincul.#instancesByName.delete(modelName);
		}
	}

	static #runHook(
		instance: SprinculModel,
		methodName: string,
		sync: boolean = false,
		args: unknown[] = [],
	): unknown | Promise<unknown> | undefined {
		const hook = Reflect.get(instance, methodName);
		if (typeof hook !== "function") return undefined;
		if (sync) return hook.call(instance, ...args);

		return Promise.resolve().then(() => hook.call(instance, ...args));
	}
}
