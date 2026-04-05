import SprinculModel from './SprinculModel';
export type {SprinculModel};
export type SprinculModelConstructor = new (element: HTMLElement) => SprinculModel;
export type SprinculModelRegistry = Map<string, SprinculModelConstructor>;

export interface SprinculModelInfo {
    name: string;
    element: HTMLElement;
    instance?: SprinculModel;
}
