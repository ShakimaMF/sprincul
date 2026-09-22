/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Data Bindings", () => {
	describe("data-bind-* reactive bindings", () => {
		test("supports multiple different bindings on same element", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button onclick="update">Update</button>
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
	});

	describe("Event handlers", () => {
		test("handles click events via onclick attribute", async () => {
			container.innerHTML = html`
				<div data-model="TestModel">
					<button onclick="handleClick">Click Me</button>
					<span data-bind-clicked="updateClicked"></span>
				</div>
			`;

			class TestModel extends SprinculModel {
				beforeInit() {
					this.state.clicked = false;
				}

				handleClick() {
					this.state.clicked = true;
				}

				updateClicked(el: HTMLElement) {
					el.textContent = this.state.clicked ? "Clicked!" : "Not clicked";
				}
			}

			Sprincul.register("TestModel", TestModel);
			Sprincul.init();

			const button = container.querySelector("button") as HTMLButtonElement;
			const span = container.querySelector("span");

			expect(span?.textContent).toBe("Not clicked");

			button.click();
			await waitForDomUpdate();

			expect(span?.textContent).toBe("Clicked!");
		});

		// Note: keyboard/input synthetic events in happy-dom are unreliable; click is covered above.

		test("leaves non-event attributes that start with \"on\" alone", async () => {
			container.innerHTML = html`
				<div data-model="FlagModel">
					<button onclick="handleClick" once one only online data-keep="yes">Click Me</button>
				</div>
			`;

			let clicks = 0;

			class FlagModel extends SprinculModel {
				handleClick() {
					clicks++;
				}
			}

			Sprincul.register("FlagModel", FlagModel);
			Sprincul.init();

			const button = container.querySelector("button") as HTMLButtonElement;

			// The real handler is consumed from the DOM and actually bound
			expect(button.hasAttribute("onclick")).toBe(false);
			button.click();
			await waitForDomUpdate();
			expect(clicks).toBe(1);

			// Attributes that merely start with "on" are not event handlers and must survive
			expect(button.getAttributeNames().sort()).toEqual(["data-keep", "once", "one", "online", "only"].sort());
		});

		test("still strips a genuine inline handler like onerror so the browser cannot run it", () => {
			container.innerHTML = html`
				<div data-model="ImageModel">
					<img onerror="handleError" />
				</div>
			`;

			class ImageModel extends SprinculModel {
				handleError() {}
			}

			Sprincul.register("ImageModel", ImageModel);
			Sprincul.init();

			expect(container.querySelector("img")!.hasAttribute("onerror")).toBe(false);
		});

		test("does not warn about non-event attributes in devMode", () => {
			container.innerHTML = html`
				<div data-model="QuietModel">
					<div once one only></div>
				</div>
			`;

			class QuietModel extends SprinculModel {}
			Sprincul.register("QuietModel", QuietModel);

			const warnings: string[] = [];
			const originalWarn = console.warn;
			console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
			try {
				Sprincul.init({ devMode: true });
			} finally {
				console.warn = originalWarn;
			}

			expect(warnings).toHaveLength(0);
		});

		test("comprehensive integration: event changes state, multiple elements react", async () => {
			container.innerHTML = html`
				<div data-model="CounterModel">
					<button onclick="increment">+</button>
					<button onclick="decrement">-</button>
					<button onclick="reset">Reset</button>
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
					el.innerHTML = this.state.items.map((item) => `<li>${item.name}</li>`).join("");
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
					<button onclick="addItem">Add Item</button>
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
					el.innerHTML = this.state.items.map((item) => `<li>${item.name}</li>`).join("");
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
					<button onclick="trigger">Trigger</button>
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
});
