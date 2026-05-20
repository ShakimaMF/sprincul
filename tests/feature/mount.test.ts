/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Manual Mount API", () => {
	test("mount() wires up a reactive model with state, bindings, and computed properties", async () => {
		const el = document.createElement("div");
		el.innerHTML = `
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
				this.addComputedProp("doubled", () => this.state.count * 2, [
					"count",
				]);
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
		el.innerHTML = `<p data-bind-message="showMessage"></p>`;
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
		el.innerHTML = `<span data-bind-value="bindValue"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, HookModel);
		await waitForDomUpdate();

		const span = el.querySelector("span");
		expect(span?.textContent).toBe("after");
	});

	test("unmount() cleans up a mounted model", () => {
		class CleanupModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			bindCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		const el = document.createElement("div");
		el.innerHTML = `<span data-bind-count="bindCount"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, CleanupModel);

		const span = el.querySelector("span");
		expect(span?.textContent).toBe("0");

		Sprincul.unmount(el);

		// After unmount, bindings and listeners are cleaned up internally
		// The data-model attribute remains but the element is no longer reactive
		expect(el.dataset.model).toBe("CleanupModel");
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
		el.innerHTML = `<p data-bind-text="bindText"></p>`;
		container.appendChild(el);

		Sprincul.mount(el, StandaloneModel);

		const p = el.querySelector("p");
		expect(p?.textContent).toBe("standalone");
	});

	test("mount() throws for unregistered model name", () => {
		const el = document.createElement("div");

		expect(() => Sprincul.mount(el, "NonExistentModel")).toThrow(
			'Model "NonExistentModel" is not registered.',
		);
	});
});
