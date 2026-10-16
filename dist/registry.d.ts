import type { SprinculCore } from "./SprinculCore";
import type SprinculModel from "./SprinculModel";
export declare function getCore(model: SprinculModel): SprinculCore | undefined;
export declare function setCore(model: SprinculModel, core: SprinculCore): void;
export declare function deleteCore(model: SprinculModel): void;
export declare function getInstance(element: HTMLElement): SprinculModel | undefined;
export declare function setInstance(element: HTMLElement, model: SprinculModel): void;
export declare function deleteInstance(model: SprinculModel): void;
export declare function getSignal(model: SprinculModel): AbortSignal;
export declare function abortSignal(model: SprinculModel): void;
export declare function addModelTag(tag: string): void;
/** The nearest model root at or above `element`, mounted or not. */
export declare function closestModelRoot(element: Element | null | undefined): HTMLElement | null;
export declare function isModelRoot(element: Element): boolean;
