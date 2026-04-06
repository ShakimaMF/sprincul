import type { SprinculCore } from './SprinculCore';
import type SprinculModel from './SprinculModel';

/**
 * Central registry for managing the relationship between model instances and their core instances.
 */

// Internal symbol for flushing pending computed props
export const FLUSH_PENDING = Symbol('flushPending');

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
