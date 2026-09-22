/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - State Management", () => {
	test("updates UI when state changes", async () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<button onclick="increment">Increment</button>
				<span data-bind-count="updateCount"></span>
			</div>
		`;

		class TestModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			increment() {
				this.state.count++;
			}

			updateCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		const button = container.querySelector("button") as HTMLButtonElement;
		const span = container.querySelector("span");

		expect(span?.textContent).toBe("0");

		button.click();
		await waitForDomUpdate();

		expect(span?.textContent).toBe("1");
	});

	test("updates multiple elements bound to same property", async () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<button onclick="updateMessage">Update</button>
				<span data-bind-message="updateText"></span>
				<div data-bind-message="updateText"></div>
			</div>
		`;

		class TestModel extends SprinculModel {
			beforeInit() {
				this.state.message = "Initial";
			}

			updateMessage() {
				this.state.message = "Updated";
			}

			updateText(el: HTMLElement) {
				el.textContent = this.state.message;
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		const button = container.querySelector("button") as HTMLButtonElement;
		const span = container.querySelector("span");
		const div = container.querySelector("div[data-bind-message]");

		expect(span?.textContent).toBe("Initial");
		expect(div?.textContent).toBe("Initial");

		button.click();
		await waitForDomUpdate();

		expect(span?.textContent).toBe("Updated");
		expect(div?.textContent).toBe("Updated");
	});

	test("updates computed properties when dependencies change", async () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<button onclick="increment">Increment</button>
				<span data-bind-doubled="updateDoubled"></span>
			</div>
		`;

		class TestModel extends SprinculModel {
			beforeInit() {
				this.state.count = 5;
				this.addComputedProp("doubled", () => this.state.count * 2, ["count"]);
			}

			increment() {
				this.state.count++;
			}

			updateDoubled(el: HTMLElement) {
				el.textContent = String(this.state.doubled);
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		const button = container.querySelector("button") as HTMLButtonElement;
		const span = container.querySelector("span");

		expect(span?.textContent).toBe("10");

		button.click();
		await waitForDomUpdate();

		expect(span?.textContent).toBe("12");
	});

	test("batches multiple state changes into single render pass", async () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<button onclick="multipleChanges">Update Multiple</button>
				<span data-bind-count="updateCount"></span>
			</div>
		`;

		let callCount = 0;

		class TestModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			multipleChanges() {
				// Make multiple state changes synchronously
				this.state.count = 1;
				this.state.count = 2;
				this.state.count = 3;
			}

			updateCount(el: HTMLElement) {
				callCount++;
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		const button = container.querySelector("button") as HTMLButtonElement;
		const span = container.querySelector("span");

		// Initial render
		expect(span?.textContent).toBe("0");
		const initialCallCount = callCount;

		button.click();
		await waitForDomUpdate();

		// Should show final value
		expect(span?.textContent).toBe("3");
		// Should only call callback once despite three state changes
		expect(callCount).toBe(initialCallCount + 1);
	});

	test("a binding callback runs once per frame, not once per triggering property", async () => {
		let renders = 0;

		class PricingModel extends SprinculModel {
			beforeInit() {
				this.state.price = 1;
				this.addComputedProp("total", () => this.state.price * 2, ["price"]);
			}
			showPricing(el: HTMLElement) {
				renders++;
			}
		}

		const el = document.createElement("div");
		// bound to both the source property and a computed derived from it
		el.innerHTML = html`<span data-bind-price="showPricing" data-bind-total="showPricing"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, PricingModel) as InstanceType<typeof PricingModel>;
		await waitForDomUpdate();

		renders = 0;
		instance.state.price = 7;
		await waitForDomUpdate();

		expect(renders).toBe(1);
	});

	test("the initial binding callback is not repeated by the frame beforeInit's writes scheduled", async () => {
		let renders = 0;

		class SeededModel extends SprinculModel {
			beforeInit() {
				this.state.count = 1;
			}
			showCount(el: HTMLElement) {
				renders++;
				el.textContent = String(this.state.count);
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="showCount"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, SeededModel);
		await waitForDomUpdate();

		expect(renders).toBe(1);
		expect(el.querySelector("span")!.textContent).toBe("1");
	});

	test("deduping one frame does not suppress the updates that follow it", async () => {
		const seen: string[] = [];

		class SequenceModel extends SprinculModel {
			beforeInit() {
				this.state.label = "init";
			}
			showLabel(el: HTMLElement) {
				seen.push(String(this.state.label));
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-label="showLabel"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, SequenceModel) as InstanceType<typeof SequenceModel>;
		await waitForDomUpdate();

		instance.state.label = "second";
		await waitForDomUpdate();
		instance.state.label = "third";
		await waitForDomUpdate();

		expect(seen).toEqual(["init", "second", "third"]);
	});

	test("distinct callbacks on one property all run in the same frame", async () => {
		const hits: string[] = [];

		class MultiModel extends SprinculModel {
			beforeInit() {
				this.state.value = 0;
			}
			first() {
				hits.push("first");
			}
			second() {
				hits.push("second");
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-value="first"></span><span data-bind-value="second"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, MultiModel) as InstanceType<typeof MultiModel>;
		await waitForDomUpdate();

		hits.length = 0;
		instance.state.value = 5;
		await waitForDomUpdate();

		expect(hits.sort()).toEqual(["first", "second"]);
	});
});
