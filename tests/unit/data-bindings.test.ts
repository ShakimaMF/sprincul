/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Data Bindings", () => {
	describe("data-bind-* reactive bindings", () => {
		test("supports multiple different bindings on same element", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button data-on-click="update">Update</button>
					<div data-bind-title="updateTitle" data-bind-content="updateContent"></div>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.title = "Title";
					this.state.content = "Content";
				}

				update() {
					this.state.title = "New Title";
					this.state.content = "New Content";
				}

				updateTitle(el: HTMLElement) {
					el.setAttribute("title", this.state.title);
				}

				updateContent(el: HTMLElement) {
					el.textContent = this.state.content;
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const button = container.querySelector("button") as HTMLButtonElement;
			const div = container.querySelector("div[data-bind-title]") as HTMLElement;

			expect(div.getAttribute("title")).toBe("Title");
			expect(div.textContent).toBe("Content");

			button.click();
			await waitForDomUpdate();

			expect(div.getAttribute("title")).toBe("New Title");
			expect(div.textContent).toBe("New Content");
		});

		test("converts dashed names to camelCase state keys like dataset", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button data-on-click="rename">Rename</button>
					<span data-bind-button-text="showLabel"></span>
					<span data-bind-buttontext="showLower"></span>
					<span data-bind-item-2="showItem"></span>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.buttonText = "Save";
					this.state.buttontext = "lower";
					this.state["item-2"] = "second";
				}

				rename() {
					this.state.buttonText = "Saved";
				}

				showLabel(el: HTMLElement) {
					el.textContent = this.state.buttonText;
				}

				showLower(el: HTMLElement) {
					el.textContent = this.state.buttontext;
				}

				showItem(el: HTMLElement) {
					el.textContent = this.state["item-2"];
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const [label, lower, item] = Array.from(container.querySelectorAll("span"));
			expect(label.textContent).toBe("Save");
			expect(lower.textContent).toBe("lower");
			expect(item.textContent).toBe("second");

			(container.querySelector("button") as HTMLButtonElement).click();
			await waitForDomUpdate();

			expect(label.textContent).toBe("Saved");
		});

		test("matches state keys in any case, since HTML lowercases data-bind-buttonText", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button data-on-click="rename">Rename</button>
					<span data-bind-buttonText="showLabel"></span>
					<span data-bind-buttontext="showLabel"></span>
					<span data-bind-itemCount="showCount"></span>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.buttonText = "Save";
					this.state.items = ["a"];
					this.addComputedProp("itemCount", () => this.state.items.length, ["items"]);
				}

				rename() {
					this.state.buttonText = "Saved";
					this.state.items = ["a", "b"];
				}

				showLabel(el: HTMLElement) {
					el.textContent = this.state.buttonText;
				}

				showCount(el: HTMLElement) {
					el.textContent = String(this.state.itemCount);
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const [camel, lower, count] = Array.from(container.querySelectorAll("span"));
			expect(camel.textContent).toBe("Save");
			expect(count.textContent).toBe("1");

			(container.querySelector("button") as HTMLButtonElement).click();
			await waitForDomUpdate();

			expect(camel.textContent).toBe("Saved");
			expect(lower.textContent).toBe("Saved");
			expect(count.textContent).toBe("2");
		});
	});

	describe("Event handlers", () => {
		test("leaves native on* attributes to the browser without binding, removing, or warning about them", async () => {
			container.innerHTML = html`
				<div data-model="NativeModel">
					<button onclick="handleClick" once only online data-keep="yes">Click Me</button>
					<img onerror="handleClick" />
				</div>
			`;

			let clicks = 0;

			class NativeModel extends SprinculModel {
				handleClick() {
					clicks++;
				}
			}

			Sprincul.register("NativeModel", NativeModel);

			const warn = spyOn(console, "warn").mockImplementation(() => {});
			Sprincul.init({ devMode: true });
			expect(warn).not.toHaveBeenCalled();
			warn.mockRestore();

			const button = container.querySelector("button") as HTMLButtonElement;
			expect(button.getAttributeNames().sort()).toEqual(
				["data-keep", "onclick", "once", "online", "only"].sort(),
			);
			expect(container.querySelector("img")!.getAttribute("onerror")).toBe("handleClick");

			button.click();
			await waitForDomUpdate();
			expect(clicks).toBe(0);
		});

		test("handles events via data-on-* attributes and keeps them in the DOM", async () => {
			container.innerHTML = html`
				<div data-model="DataOnModel">
					<button data-on-click="handleClick">Click Me</button>
				</div>
			`;

			let clicks = 0;

			class DataOnModel extends SprinculModel {
				handleClick() {
					clicks++;
				}
			}

			Sprincul.register("DataOnModel", DataOnModel);
			Sprincul.init();

			const button = container.querySelector("button") as HTMLButtonElement;
			expect(button.getAttribute("data-on-click")).toBe("handleClick");

			button.click();
			await waitForDomUpdate();
			expect(clicks).toBe(1);
		});

		test("takes the data-on-* event name from the attribute as written, so hyphenated custom events work", () => {
			container.innerHTML = html`
				<div data-model="CustomEventModel">
					<ul data-on-item-added="handleAdded"></ul>
				</div>
			`;

			let received = null as string | null;

			class CustomEventModel extends SprinculModel {
				handleAdded(_el: HTMLElement, e: Event) {
					received = e.type;
				}
			}

			Sprincul.register("CustomEventModel", CustomEventModel);
			Sprincul.init();

			const target = container.querySelector("ul") as HTMLElement;
			const EventCtor = target.ownerDocument.defaultView!.Event;
			target.dispatchEvent(new EventCtor("item-added"));
			expect(received).toBe("item-added");
		});

		test("wire() on an already-bound element does not bind its data-on-* twice", async () => {
			let clicks = 0;

			class WireModel extends SprinculModel {
				handleClick() {
					clicks++;
				}
			}

			const el = document.createElement("div");
			el.innerHTML = html`<button data-on-click="handleClick">Click Me</button>`;
			container.appendChild(el);

			const instance = Sprincul.mount(el, WireModel);
			const button = el.querySelector("button") as HTMLButtonElement;
			instance.wire(button);
			instance.wire(el);

			button.click();
			await waitForDomUpdate();
			expect(clicks).toBe(1);
		});

		test("comprehensive integration: event changes state, multiple elements react", async () => {
			container.innerHTML = html`
				<div data-model="CounterModel">
					<button data-on-click="increment">+</button>
					<button data-on-click="decrement">-</button>
					<button data-on-click="reset">Reset</button>
					<div data-bind-count="updateCount"></div>
					<div data-bind-doubled="updateDoubled"></div>
					<div data-bind-status="updateStatus"></div>
				</div>
			`;

			class CounterModel extends SprinculModel {
				beforeInit() {
					this.state.count = 0;
					this.addComputedProp("doubled", () => this.state.count * 2, ["count"]);
					this.addComputedProp(
						"status",
						() => {
							if (this.state.count === 0) return "Zero";
							if (this.state.count > 0) return "Positive";
							return "Negative";
						},
						["count"],
					);
				}

				increment() {
					this.state.count++;
				}

				decrement() {
					this.state.count--;
				}

				reset() {
					this.state.count = 0;
				}

				updateCount(el: HTMLElement) {
					el.textContent = `Count: ${this.state.count}`;
				}

				updateDoubled(el: HTMLElement) {
					el.textContent = `Doubled: ${this.state.doubled}`;
				}

				updateStatus(el: HTMLElement) {
					el.textContent = `Status: ${this.state.status}`;
				}
			}

			Sprincul.register("CounterModel", CounterModel);
			Sprincul.init();

			const [incrementBtn, decrementBtn, resetBtn] = container.querySelectorAll("button");
			const [countDiv, doubledDiv, statusDiv] = container.querySelectorAll(
				"div[data-bind-count], div[data-bind-doubled], div[data-bind-status]",
			);

			// Initial state
			expect(countDiv.textContent).toBe("Count: 0");
			expect(doubledDiv.textContent).toBe("Doubled: 0");
			expect(statusDiv.textContent).toBe("Status: Zero");

			// Increment
			incrementBtn.click();
			await waitForDomUpdate();

			expect(countDiv.textContent).toBe("Count: 1");
			expect(doubledDiv.textContent).toBe("Doubled: 2");
			expect(statusDiv.textContent).toBe("Status: Positive");

			// Increment again
			incrementBtn.click();
			await waitForDomUpdate();

			expect(countDiv.textContent).toBe("Count: 2");
			expect(doubledDiv.textContent).toBe("Doubled: 4");
			expect(statusDiv.textContent).toBe("Status: Positive");

			// Decrement multiple times to go negative
			decrementBtn.click();
			await waitForDomUpdate();
			decrementBtn.click();
			await waitForDomUpdate();
			decrementBtn.click();
			await waitForDomUpdate();

			expect(countDiv.textContent).toBe("Count: -1");
			expect(doubledDiv.textContent).toBe("Doubled: -2");
			expect(statusDiv.textContent).toBe("Status: Negative");

			// Reset
			resetBtn.click();
			await waitForDomUpdate();

			expect(countDiv.textContent).toBe("Count: 0");
			expect(doubledDiv.textContent).toBe("Doubled: 0");
			expect(statusDiv.textContent).toBe("Status: Zero");
		});
	});

	describe("Array/List Rendering", () => {
		test("renders a list bound to an array property", () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<ul data-bind-items="renderList"></ul>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.items = [
						{ id: 1, name: "Item 1" },
						{ id: 2, name: "Item 2" },
					];
				}

				renderList(el: HTMLElement) {
					el.innerHTML = this.state.items.map((item: { name: string }) => `<li>${item.name}</li>`).join("");
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const listItems = container.querySelectorAll("li");
			expect(listItems).toHaveLength(2);
			expect(listItems[0].textContent).toBe("Item 1");
			expect(listItems[1].textContent).toBe("Item 2");
		});

		test("re-renders list when array changes", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button data-on-click="addItem">Add Item</button>
					<ul data-bind-items="renderList"></ul>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.items = [{ id: 1, name: "Item 1" }];
				}

				addItem() {
					const newId = this.state.items.length + 1;
					this.state.items = [...this.state.items, { id: newId, name: `Item ${newId}` }];
				}

				renderList(el: HTMLElement) {
					el.innerHTML = this.state.items.map((item: { name: string }) => `<li>${item.name}</li>`).join("");
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const button = container.querySelector("button") as HTMLButtonElement;
			let listItems = container.querySelectorAll("li");

			expect(listItems).toHaveLength(1);
			expect(listItems[0].textContent).toBe("Item 1");

			button.click();
			await waitForDomUpdate();

			listItems = container.querySelectorAll("li");
			expect(listItems).toHaveLength(2);
			expect(listItems[1].textContent).toBe("Item 2");
		});

		// Skipping dynamic-item manual event wiring: happy-dom synthetic click on non-controls is unreliable.
	});

	describe("Error handling", () => {
		test("errors in one binding do not affect other bindings", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button data-on-click="trigger">Trigger</button>
					<span data-bind-count="throwError"></span>
					<div data-bind-count="safeUpdate"></div>
				</div>
			`;

			let safeCallCount = 0;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.count = 0;
				}

				trigger() {
					this.state.count++;
				}

				throwError(el: HTMLElement) {
					throw new Error("Intentional error in binding");
				}

				safeUpdate(el: HTMLElement) {
					safeCallCount++;
					el.textContent = String(this.state.count);
				}
			}

			const errorSpy = spyOn(console, "error").mockImplementation(() => {});

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			// Wait for initial bindings to complete
			await waitForDomUpdate();
			const initialCallCount = safeCallCount;

			const button = container.querySelector("button") as HTMLButtonElement;
			const div = container.querySelector("div[data-bind-count]") as HTMLElement;

			button.click();
			await waitForDomUpdate();

			// Safe binding should still work despite error in other binding
			expect(safeCallCount).toBe(initialCallCount + 1);
			expect(div.textContent).toBe("1");

			// Error should have been logged
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Error in binding callback"),
				expect.any(Error),
			);

			errorSpy.mockRestore();
		});
	});

	test("the devMode warning for a missing callback names the attribute as written", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-button-text="missingFn"></span>`;
		container.appendChild(el);
		Sprincul.mount(el, class extends SprinculModel {}, { devMode: true });

		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] Binding callback "missingFn" not found for data-bind-button-text.',
		);
		warnSpy.mockRestore();
	});
});
