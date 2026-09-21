/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Manual Mount API", () => {
	test("mount() wires up a reactive model with state, bindings, and computed properties", async () => {
		const el = document.createElement("div");
		el.innerHTML = html`
			<button onclick="increment">+</button>
			<span data-bind-count="showCount"></span>
			<span data-bind-label="showLabel"></span>
			<span data-bind-doubled="showDoubled"></span>
		`;
		container.appendChild(el);

		class Counter extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
				this.state.label = "Counter";
				this.addComputedProp("doubled", () => this.state.count * 2, ["count"]);
			}

			increment() {
				this.state.count++;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}

			showLabel(el: HTMLElement) {
				el.textContent = this.state.label;
			}

			showDoubled(el: HTMLElement) {
				el.textContent = String(this.state.doubled);
			}
		}

		const instance = Sprincul.mount(el, Counter);

		expect(instance).toBeInstanceOf(Counter);
		expect(instance.$el).toBe(el);
		expect(el.dataset.model).toBe("Counter");

		const [countSpan, labelSpan, doubledSpan] = el.querySelectorAll("span");
		expect(countSpan.textContent).toBe("0");
		expect(labelSpan.textContent).toBe("Counter");
		expect(doubledSpan.textContent).toBe("0");

		const button = el.querySelector("button") as HTMLButtonElement;
		button.click();
		await waitForDomUpdate();

		expect(countSpan.textContent).toBe("1");
		expect(doubledSpan.textContent).toBe("2");
	});

	test("mount() works with a registered model name", async () => {
		class Greeting extends SprinculModel {
			beforeInit() {
				this.state.message = "Hello";
			}

			showMessage(el: HTMLElement) {
				el.textContent = this.state.message;
			}
		}

		Sprincul.register("Greeting", Greeting);

		const el = document.createElement("div");
		el.innerHTML = html`<p data-bind-message="showMessage"></p>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, "Greeting");

		expect(instance).toBeInstanceOf(Greeting);
		expect(el.dataset.model).toBe("Greeting");

		const p = el.querySelector("p");
		expect(p?.textContent).toBe("Hello");
	});

	test("mount() auto-registers a class that is not yet registered", () => {
		class UniqueModel extends SprinculModel {}

		const el = document.createElement("div");
		container.appendChild(el);

		Sprincul.mount(el, UniqueModel);

		// The class should now be registered under its name
		expect(el.dataset.model).toBe("UniqueModel");
	});

	test("mount() reuses existing registration for same class", () => {
		class DuplicateModel extends SprinculModel {}

		const el1 = document.createElement("div");
		const el2 = document.createElement("div");
		container.appendChild(el1);
		container.appendChild(el2);

		const instance1 = Sprincul.mount(el1, DuplicateModel);
		const instance2 = Sprincul.mount(el2, DuplicateModel);

		expect(el1.dataset.model).toBe("DuplicateModel");
		expect(el2.dataset.model).toBe("DuplicateModel");
		expect(instance1).toBeInstanceOf(DuplicateModel);
		expect(instance2).toBeInstanceOf(DuplicateModel);
	});

	test("mount() triggers beforeInit and afterInit hooks", async () => {
		class HookModel extends SprinculModel {
			beforeInit() {
				this.state.value = "before";
			}

			afterInit() {
				this.state.value = "after";
			}

			bindValue(el: HTMLElement) {
				el.textContent = this.state.value;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-value="bindValue"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, HookModel);
		await waitForDomUpdate();

		const span = el.querySelector("span");
		expect(span?.textContent).toBe("after");
	});

	test("mount() does not require Sprincul.init() to be called first", async () => {
		class StandaloneModel extends SprinculModel {
			beforeInit() {
				this.state.text = "standalone";
			}

			bindText(el: HTMLElement) {
				el.textContent = this.state.text;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<p data-bind-text="bindText"></p>`;
		container.appendChild(el);

		Sprincul.mount(el, StandaloneModel);

		const p = el.querySelector("p");
		expect(p?.textContent).toBe("standalone");
	});

	test("mount() throws for unregistered model name", () => {
		const el = document.createElement("div");

		expect(() => Sprincul.mount(el, "NonExistentModel")).toThrow('Model "NonExistentModel" is not registered.');
	});

	test("mount(el, Model, { devMode: true }) enables dev-only warnings for that instance", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		class DevModeMountModel extends SprinculModel {}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="missingFn"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, DevModeMountModel, { devMode: true });

		expect(warnSpy).toHaveBeenCalledWith('[Sprincul] Binding callback "missingFn" not found for data-bind-count.');
		warnSpy.mockRestore();
	});

	test("mount(el, Model, { onReady }) fires synchronously once afterInit has been called; it does not wait for afterInit to resolve", async () => {
		let afterInitResolved = false;

		class AsyncWidget extends SprinculModel {
			async afterInit() {
				await new Promise((resolve) => setTimeout(resolve, 10));
				afterInitResolved = true;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		let readyFired = false;
		let receivedInfo: any;

		Sprincul.mount(el, AsyncWidget, {
			devMode: true,
			onReady: (info: any) => {
				readyFired = true;
				receivedInfo = info;
			},
		});

		// Fires immediately, before afterInit has resolved
		expect(readyFired).toBe(true);
		expect(afterInitResolved).toBe(false);
		expect(receivedInfo.name).toBe("AsyncWidget");
		expect(receivedInfo.element).toBe(el);
		expect(receivedInfo).toHaveProperty("instance");

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(afterInitResolved).toBe(true);
	});

	test("mount()'s onReady omits instance in production mode (non-devMode)", () => {
		class PlainWidget extends SprinculModel {}

		const el = document.createElement("div");
		container.appendChild(el);

		let receivedInfo: any;
		Sprincul.mount(el, PlainWidget, {
			onReady: (info: any) => {
				receivedInfo = info;
			},
		});

		expect(receivedInfo).not.toHaveProperty("instance");
	});
});
