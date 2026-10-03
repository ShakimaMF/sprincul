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

/** model -> the controller behind its $signal, aborted once teardown finishes. */
const controllers = new WeakMap<SprinculModel, AbortController>();

export function getSignal(model: SprinculModel): AbortSignal {
	let controller = controllers.get(model);
	if (!controller) {
		controller = new AbortController();
		controllers.set(model, controller);
	}
	return controller.signal;
}

export function abortSignal(model: SprinculModel): void {
	// Create it aborted if it was never read, so a $signal read after teardown is already aborted
	getSignal(model);
	controllers.get(model)!.abort();
}
