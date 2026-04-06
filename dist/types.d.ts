import SprinculModel from './SprinculModel';
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
