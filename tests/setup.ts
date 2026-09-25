import { afterEach, beforeEach } from "bun:test";
import * as registerDom from "./register-happydom.ts";
import { loadIsolatedApi, setCurrentIsolatedApi, getCurrentIsolatedApi } from "./helpers.ts";

beforeEach(async () => {
	// A fresh window/document per test
	registerDom.register();

	const api = await loadIsolatedApi();
	globalThis.Sprincul = api.Sprincul;
	globalThis.SprinculModel = api.SprinculModel;
	globalThis.container = document.createElement("div");
	document.body.appendChild(globalThis.container);
	setCurrentIsolatedApi(api);
});

afterEach(async () => {
	const api = getCurrentIsolatedApi();
	api.Sprincul.destroyAll();
	globalThis.container?.remove();
	api.cleanup();
	setCurrentIsolatedApi(null);
	// @ts-ignore - explicit cleanup for test globals
	globalThis.container = undefined;
	globalThis.Sprincul = undefined;
	globalThis.SprinculModel = undefined;

	await registerDom.unregister();
});
