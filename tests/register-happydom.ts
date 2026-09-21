import { Window } from "happy-dom";

/**
 * Minimal per-test global DOM registrator, playing the same role
 * @happy-dom/global-registrator's register()/unregister() did, but without
 * pulling in that package. Only copies the specific globals Sprincul and the
 * test suite reference, not the whole window, so it never shadows realm
 * built-ins like Object/Array/Promise with happy-dom's copies.
 */

const GLOBAL_KEYS = [
	"window",
	"document",
	"HTMLElement",
	"HTMLButtonElement",
	"HTMLInputElement",
	"HTMLSelectElement",
	"Node",
	"CustomEvent",
	"requestAnimationFrame",
] as const;

let window: Window | null = null;

export function register(): void {
	if (window) {
		throw new Error("Failed to register. happy-dom has already been globally registered.");
	}

	window = new Window();
	window.document.write('<!DOCTYPE html><html lang="en"><body></body></html>');

	for (const key of GLOBAL_KEYS) {
		(globalThis as any)[key] = (window as any)[key];
	}
}

export async function unregister(): Promise<void> {
	if (!window) {
		throw new Error("Failed to unregister. happy-dom has not previously been globally registered.");
	}

	for (const key of GLOBAL_KEYS) {
		delete (globalThis as any)[key];
	}

	await window.happyDOM.close();
	window = null;
}
