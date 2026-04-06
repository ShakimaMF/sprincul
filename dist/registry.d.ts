import type { SprinculCore } from './SprinculCore';
import type SprinculModel from './SprinculModel';
/**
 * Central registry for managing the relationship between model instances and their core instances.
 */
export declare const FLUSH_PENDING: unique symbol;
export declare function getCore(model: SprinculModel): SprinculCore | undefined;
export declare function setCore(model: SprinculModel, core: SprinculCore): void;
export declare function deleteCore(model: SprinculModel): void;
