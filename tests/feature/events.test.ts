/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html } from "../helpers.ts";

describe("Sprincul - Model events", () => {
	function mountPair() {
		const picks: unknown[] = [];

		class Picker extends SprinculModel {
			pick(module: string) {
				return this.$emit("pick", { module }, { cancelable: true });
			}
		}
		class Editor extends SprinculModel {
			afterInit() {
				this.$listen("pick", function (this: Editor, e: CustomEvent) {
					picks.push({ detail: e.detail, self: this });
					if (e.detail.module === "blocked") e.preventDefault();
				});
			}
		}
		Sprincul.registerAll({ Editor, Picker });

		container.innerHTML = html`<div data-model="Editor"><div data-model="Picker" data-ref="picker"></div></div>`;
		Sprincul.init({ root: container });

		const editor = Sprincul.instanceFor(container.querySelector('[data-model="Editor"]'));
		return { editor, picker: editor.$child("picker"), picks };
	}

	test("$emit from a nested model reaches the parent's $listen, with the parent as this", () => {
		const { editor, picker, picks } = mountPair();

		picker.pick("hero");

		expect(picks).toEqual([{ detail: { module: "hero" }, self: editor }]);
	});

	test("$emit returns the event, so a cancelable one can be vetoed", () => {
		const { picker } = mountPair();

		expect(picker.pick("hero").defaultPrevented).toBe(false);
		expect(picker.pick("blocked").defaultPrevented).toBe(true);
	});

	test("listeners from $listen are removed on destroy, including ones on document", () => {
		const keys: string[] = [];

		class Dialog extends SprinculModel {
			afterInit() {
				this.$listen(document, "shortcut", (e: CustomEvent) => keys.push(e.detail));
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);
		Sprincul.mount(el, Dialog);

		document.dispatchEvent(new CustomEvent("shortcut", { detail: "a" }));
		Sprincul.unmount(el);
		document.dispatchEvent(new CustomEvent("shortcut", { detail: "b" }));

		expect(keys).toEqual(["a"]);
	});

	test("the function $listen returns removes the listener early", () => {
		const { editor, picker, picks } = mountPair();
		const seen: string[] = [];

		const stop = editor.$listen("pick", (e: CustomEvent) => seen.push(e.detail.module));
		picker.pick("one");
		stop();
		picker.pick("two");

		expect(seen).toEqual(["one"]);
		expect(picks).toHaveLength(2);
	});

	test("$signal is aborted after beforeDestroy, and releases store subscriptions", () => {
		let abortedDuringBeforeDestroy: boolean | undefined;
		const values: unknown[] = [];

		class Watcher extends SprinculModel {
			afterInit() {
				Sprincul.store.subscribe("theme", (value) => values.push(value), { signal: this.$signal });
			}

			beforeDestroy() {
				abortedDuringBeforeDestroy = this.$signal.aborted;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);
		const instance = Sprincul.mount(el, Watcher);

		Sprincul.store.set("theme", "dark");
		Sprincul.unmount(el);
		Sprincul.store.set("theme", "light");

		expect(abortedDuringBeforeDestroy).toBe(false);
		expect(instance.$signal.aborted).toBe(true);
		expect(values).toEqual(["dark"]);
	});

	test("$emit with a native event name warns in devMode", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const el = document.createElement("div");
		container.appendChild(el);
		const instance = Sprincul.mount(el, class extends SprinculModel {}, { devMode: true });

		instance.$emit("change");

		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] $emit("change") uses a native event name, so it mixes with the native events bubbling through the same elements.',
		);

		warnSpy.mockRestore();
	});
});
