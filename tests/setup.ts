import { afterEach, beforeEach } from "bun:test";
import { loadIsolatedApi, setCurrentIsolatedApi, getCurrentIsolatedApi } from "./helpers.ts";

beforeEach(async () => {
  const api = await loadIsolatedApi();
  globalThis.Sprincul = api.Sprincul;
  globalThis.SprinculModel = api.SprinculModel;
  globalThis.container = document.createElement('div');
  document.body.appendChild(globalThis.container);
  setCurrentIsolatedApi(api);
});

afterEach(() => {
  const api = getCurrentIsolatedApi();
  globalThis.container?.remove();
  api.cleanup();
  setCurrentIsolatedApi(null);
  // @ts-ignore - explicit cleanup for test globals
  globalThis.container = undefined;
  globalThis.Sprincul = undefined;
  globalThis.SprinculModel = undefined;
});
