/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("Sprincul - Custom elements", () => {
	function defineCounter(log: string[] = []) {
		class Counter extends SprinculModel {
			static options = { customElement: "counter-element", devMode: true };

			beforeInit() {
				this.state.count = 0;
			}

			increment() {
				this.state.count++;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}

			beforeDestroy() {
				log.push("destroy");
			}
		}
		Sprincul.register("Counter", Counter);
		return Counter;
	}

	const counterMarkup = html`<counter-element>
		<button data-on-click="increment">+</button>
		<span data-bind-count="showCount"></span>
	</counter-element>`;

	test("registering a model with a customElement option defines the element, which mounts itself", async () => {
		const Counter = defineCounter();
		container.innerHTML = counterMarkup;
		await tick();

		const element = container.querySelector("counter-element") as HTMLElement & { model?: unknown };
		expect(element.model).toBeInstanceOf(Counter);

		element.querySelector("button")!.click();
		await waitForDomUpdate();
		expect(element.querySelector("span")!.textContent).toBe("1");
	});

	test("registerAll() defines custom elements too", async () => {
		class Badge extends SprinculModel {
			static options = { customElement: "badge-element", devMode: true };
		}
		Sprincul.registerAll({ Badge });
		container.innerHTML = html`<badge-element></badge-element>`;
		await tick();

		expect((container.querySelector("badge-element") as any).model).toBeInstanceOf(Badge);
	});

	test("removing the element unmounts its model", async () => {
		const log: string[] = [];
		defineCounter(log);
		container.innerHTML = counterMarkup;
		await tick();

		const element = container.querySelector("counter-element") as any;
		element.remove();
		await tick();

		expect(log).toEqual(["destroy"]);
		expect(element.model).toBeUndefined();
	});

	test("moving the element keeps its model and listeners", async () => {
		const log: string[] = [];
		defineCounter(log);
		container.innerHTML = html`${counterMarkup}
			<section></section>`;
		await tick();

		const element = container.querySelector("counter-element") as any;
		const model = element.model;
		container.querySelector("section")!.appendChild(element);
		await tick();

		expect(log).toEqual([]);
		expect(element.model).toBe(model);

		element.querySelector("button").click();
		await waitForDomUpdate();
		expect(element.querySelector("span").textContent).toBe("1");
	});

	test("adding the element back after removal mounts a fresh model", async () => {
		defineCounter();
		container.innerHTML = counterMarkup;
		await tick();

		const element = container.querySelector("counter-element") as any;
		const first = element.model;
		element.querySelector("button").click();
		element.remove();
		await tick();

		container.appendChild(element);
		await tick();

		expect(element.model).toBeDefined();
		expect(element.model).not.toBe(first);
		await waitForDomUpdate();
		expect(element.querySelector("span").textContent).toBe("0");
	});

	test("reconnecting while an async beforeDestroy is pending mounts once it settles", async () => {
		let release!: () => void;

		class Slow extends SprinculModel {
			static options = { customElement: "slow-element", devMode: true };

			beforeDestroy() {
				return new Promise<void>((resolve) => (release = resolve));
			}
		}
		Sprincul.register("Slow", Slow);
		container.innerHTML = html`<slow-element></slow-element>`;
		await tick();

		const element = container.querySelector("slow-element") as any;
		const first = element.model;
		element.remove();
		await tick();
		container.appendChild(element);
		await tick();
		expect(element.model).toBeUndefined();

		release();
		await waitForDomUpdate();
		expect(element.model).toBeInstanceOf(Slow);
		expect(element.model).not.toBe(first);
	});

	test("nested custom elements mount children first, so a parent's afterInit reaches them", async () => {
		let childFromParent: unknown;

		class Item extends SprinculModel {
			static options = { customElement: "list-item", devMode: true };
		}
		class List extends SprinculModel {
			static options = { customElement: "item-list", devMode: true };

			afterInit() {
				childFromParent = this.$child("item");
			}
		}
		Sprincul.registerAll({ List, Item });
		container.innerHTML = html`<item-list><list-item data-ref="item"></list-item></item-list>`;
		await tick();

		expect(childFromParent).toBe((container.querySelector("list-item") as any).model);
	});

	test("removing a parent tears down its nested custom elements once, parent first", async () => {
		const log: string[] = [];

		class Item extends SprinculModel {
			static options = { customElement: "list-item" };

			beforeDestroy() {
				log.push(`item:${this.$el.dataset.label}`);
			}
		}
		class List extends SprinculModel {
			static options = { customElement: "item-list" };

			beforeDestroy() {
				log.push("list");
			}
		}
		Sprincul.registerAll({ List, Item });
		container.innerHTML = html`<item-list
			><list-item data-label="a"></list-item><list-item data-label="b"></list-item
		></item-list>`;
		await tick();

		container.querySelector("item-list")!.remove();
		await tick();

		expect(log).toEqual(["list", "item:a", "item:b"]);
	});

	test("under init(), a data-model parent's afterInit reaches a nested custom element", () => {
		let childFromParent: unknown;

		class Item extends SprinculModel {
			static options = { customElement: "list-item", devMode: true };
		}
		class Page extends SprinculModel {
			afterInit() {
				childFromParent = this.$child("item");
			}
		}
		Sprincul.registerAll({ Page, Item });
		container.innerHTML = html`<div data-model="Page"><list-item data-ref="item"></list-item></div>`;

		Sprincul.init({ root: container });

		expect(childFromParent).toBe((container.querySelector("list-item") as any).model);
	});

	test("init()'s options don't apply to a custom element it mounts", () => {
		class Widget extends SprinculModel {
			static options = { customElement: "widget-element" };
		}
		Sprincul.register("Widget", Widget);
		container.innerHTML = html`<widget-element></widget-element>`;

		let models: { instance?: unknown }[] = [];
		Sprincul.init({ root: container, devMode: true, onReady: (ready: typeof models) => (models = ready) });

		// Mounted with the defaults, so no instance in the payload
		expect(models).toHaveLength(1);
		expect(models[0]!.instance).toBeUndefined();
	});

	test("element.model only returns the instance with devMode", async () => {
		class Quiet extends SprinculModel {
			static options = { customElement: "quiet-element" };
		}
		Sprincul.register("Quiet", Quiet);
		container.innerHTML = html`<quiet-element></quiet-element>`;
		await tick();

		expect((container.querySelector("quiet-element") as any).model).toBeUndefined();
	});

	test("warns instead of throwing for a name that can't be defined", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		class Invalid extends SprinculModel {
			static options = { customElement: "nohyphen" };
		}
		class First extends SprinculModel {
			static options = { customElement: "taken-element" };
		}
		class Second extends SprinculModel {
			static options = { customElement: "taken-element" };
		}

		expect(() => Sprincul.registerAll({ Invalid, First, Second })).not.toThrow();
		expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
			expect.stringContaining("<nohyphen>"),
			expect.stringContaining("<taken-element> is already defined"),
		]);
		warn.mockRestore();
	});

	test("registering the same model again is a no-op", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		const Counter = defineCounter();
		Sprincul.register("Counter", Counter);

		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
