import type { SprinculCore } from "./SprinculCore";
import type SprinculModel from "./SprinculModel";

/**
 * Central registry for managing the relationship between model instances and their core instances.
 */

const cores = new WeakMap<SprinculModel, SprinculCore>();

export function getCore(model: SprinculModel): SprinculCore | undefined {
	return cores.get(model);
}

export function setCore(model: SprinculModel, core: SprinculCore): void {
	cores.set(model, core);
}

export function deleteCore(model: SprinculModel): void {
	cores.delete(model);
}

/** element -> the live model mounted on it; removed as soon as teardown starts. */
const instances = new WeakMap<HTMLElement, SprinculModel>();

export function getInstance(element: HTMLElement): SprinculModel | undefined {
	return instances.get(element);
}

export function setInstance(element: HTMLElement, model: SprinculModel): void {
	instances.set(element, model);
}

export function deleteInstance(model: SprinculModel): void {
	if (instances.get(model.$el) === model) instances.delete(model.$el);
}

/** model -> the controller behind its $signal, created on first read and aborted once teardown finishes. */
const controllers = new WeakMap<SprinculModel, AbortController>();
/** Torn-down models whose $signal was never read; one read later is created already aborted. */
const abortedUnread = new WeakSet<SprinculModel>();

export function getSignal(model: SprinculModel): AbortSignal {
	let controller = controllers.get(model);
	if (!controller) {
		controller = new AbortController();
		controllers.set(model, controller);
		if (abortedUnread.has(model)) controller.abort();
	}
	return controller.signal;
}

export function abortSignal(model: SprinculModel): void {
	const controller = controllers.get(model);
	if (controller) return controller.abort();
	abortedUnread.add(model);
}

/**
 * Matches a model root: an element with `data-model`, or a registered custom element's tag, which is a model root
 * before it has mounted too.
 */
let modelRootSelector = "[data-model]";

export function addModelTag(tag: string): void {
	// Custom element names can hold characters a selector can't take raw, such as "."
	modelRootSelector += `, ${tag.replace(/[^\w\u00A0-\uFFFF-]/g, "\\$&")}`;
}

/** The nearest model root at or above `element`, mounted or not. */
export function closestModelRoot(element: Element | null | undefined): HTMLElement | null {
	return element?.closest<HTMLElement>(modelRootSelector) ?? null;
}

export function isModelRoot(element: Element): boolean {
	return element.matches(modelRootSelector);
}
