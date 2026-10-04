/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html } from "../helpers.ts";

/** Forces garbage collection until `ref` is released, or gives up. */
async function isCollected(ref: WeakRef<object>): Promise<boolean> {
	for (let attempt = 0; attempt < 10; attempt++) {
		Bun.gc(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (ref.deref() === undefined) return true;
	}
	return false;
}

describe("Sprincul - Memory", () => {
	/*
	 * Mounts a parent and child using every API that holds references (listeners on document/window,
	 * store subscriptions, computed props, refs, events), and returns weak handles to both.
	 * References are created inside this function and cleared, so only Sprincul could keep them alive.
	 */
	function mountEverything(asyncTeardown: boolean) {
		class Child extends SprinculModel {}
		class Busy extends SprinculModel {
			afterInit() {
				this.addComputedProp("double", () => 2, ["count"]);
				this.$listen(document, "shortcut", () => {});
				this.$listen(document, "once", () => {}, { once: true });
				this.$listen("pick", () => {});
				this.$listen(window, "resize", () => {})();
				Sprincul.store.subscribe("theme", () => {}, { signal: this.$signal });
				Sprincul.store.subscribe("other", () => {}, { signal: this.$signal })();
				this.$refs("child");
				this.$child("child");
				this.$data("max", 0);
				this.$emit("ping");
			}

			beforeDestroy() {
				return asyncTeardown ? Promise.resolve() : undefined;
			}

			show() {}
		}
		Sprincul.registerAll({ Busy, Child });

		const el = document.createElement("div");
		el.setAttribute("data-model", "Busy");
		el.innerHTML = html`<button onclick="show"></button><div data-model="Child" data-ref="child"></div>`;
		container.appendChild(el);

		let models: any[] = [];
		Sprincul.init({ root: el, devMode: true, onReady: (infos: any[]) => (models = infos.map((info) => info.instance)) });
		const refs = models.map((model) => new WeakRef(model));
		models = [];

		return { el, refs };
	}

	test("unmounted models are garbage collected", async () => {
		const { el, refs } = mountEverything(false);

		Sprincul.unmount(el);
		el.remove();

		for (const ref of refs) expect(await isCollected(ref)).toBe(true);
	});

	test("unmounted models are garbage collected after an async teardown", async () => {
		const { el, refs } = mountEverything(true);

		await Sprincul.unmount(el);
		el.remove();

		for (const ref of refs) expect(await isCollected(ref)).toBe(true);
	});

	test("a model never unmounted stays alive, so the checks above can fail", async () => {
		const { el, refs } = mountEverything(false);

		el.remove();

		expect(await isCollected(refs[1])).toBe(false);
	});
});
