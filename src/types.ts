import SprinculModel from "./SprinculModel";

export type { SprinculModel };
export type SprinculModelConstructor = new (element: HTMLElement) => SprinculModel;
export type SprinculModelRegistry = Map<string, SprinculModelConstructor>;

export type DomListenerRecord = {
	element: HTMLElement;
	type: string;
	listener: EventListener;
	options?: boolean | AddEventListenerOptions;
};

export interface SprinculModelInfo {
	name: string;
	element: HTMLElement;
	instance?: SprinculModel;
}

/**
 * Form-input-specific state, only populated for elements where it applies:
 * - `checked` for checkbox/radio inputs
 * - `selectedValues` for a `<select multiple>`.
 * - `value` is set for any form control (input/select/textarea);
 * - use `selectedValues` instead of `value` for multi-select elements, since `value` only reflects the first selection.
 */
export type BoundElementInput = {
	value: string | undefined;
	checked: boolean | undefined;
	selectedValues: string[] | undefined;
};

export type BoundElementDefault = {
	input: BoundElementInput;
	text: string;
	html: string;
};

/**
 * Server-rendered input/text/html per bound state property (data-bind-<prop>).
 * This can be used to initialize the model's state with server-rendered data.
 */
export type BoundDefaults = Record<string, BoundElementDefault>;
