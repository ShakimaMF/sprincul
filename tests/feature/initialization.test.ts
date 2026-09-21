/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers";

describe("Sprincul - Initialization", () => {
	test("init({ onReady }) fires synchronously once every model's afterInit has been called; it does not wait for afterInit to resolve", async () => {
		container.innerHTML = html`
			<div data-model="Model1"></div>
			<div data-model="Model2"></div>
			<div data-model="Model3"></div>
		`;

		let slowAfterInitCalled = false;
		let slowAfterInitResolved = false;

		class Model1 extends SprinculModel {
			async afterInit() {
				slowAfterInitCalled = true;
				await new Promise((resolve) => setTimeout(resolve, 20));
				slowAfterInitResolved = true;
			}
		}
		class Model2 extends SprinculModel {}
		class Model3 extends SprinculModel {}

		Sprincul.register("Model1", Model1);
		Sprincul.register("Model2", Model2);
		Sprincul.register("Model3", Model3);

		let callbackFired = false;
		let receivedModels: any[] | undefined;

		Sprincul.init({
			devMode: true,
			onReady: (models: any[]) => {
				callbackFired = true;
				receivedModels = models;
			},
		});

		// Fires immediately, once afterInit has been called for every model, but before Model1's slow
		// afterInit has resolved.
		expect(callbackFired).toBe(true);
		expect(slowAfterInitCalled).toBe(true);
		expect(slowAfterInitResolved).toBe(false);
		expect(receivedModels).toHaveLength(3);
		expect(receivedModels![0]).toHaveProperty("instance");

		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(slowAfterInitResolved).toBe(true);
	});

	test("onReady omits instance in production mode (non-devMode)", () => {
		container.innerHTML = html`<div data-model="TestModel"></div>`;

		class TestModel extends SprinculModel {}
		Sprincul.register("TestModel", TestModel);

		let receivedModels: any[] | undefined;
		Sprincul.init({
			onReady: (models: any[]) => {
				receivedModels = models;
			},
		});

		expect(receivedModels).toHaveLength(1);
		expect(receivedModels![0]).not.toHaveProperty("instance");
	});

	test("registers and initializes a model", async () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<span data-bind-message="updateText"></span>
			</div>
		`;

		class TestModel extends SprinculModel {
			beforeInit() {
				this.state.message = "Hello";
			}

			updateText(el: HTMLElement) {
				el.textContent = this.state.message;
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		const span = container.querySelector("span");
		expect(span?.textContent).toBe("Hello");
	});

	test("registerAll registers multiple models at once", async () => {
		container.innerHTML = html`
			<div data-model="UserModel">
				<span data-bind-name="showName"></span>
			</div>
			<div data-model="ProductModel">
				<span data-bind-title="showTitle"></span>
			</div>
			<div data-model="CartModel">
				<span data-bind-count="showCount"></span>
			</div>
		`;

		class UserModel extends SprinculModel {
			beforeInit() {
				this.state.name = "John Doe";
			}

			showName(el: HTMLElement) {
				el.textContent = this.state.name;
			}
		}

		class ProductModel extends SprinculModel {
			beforeInit() {
				this.state.title = "Laptop";
			}

			showTitle(el: HTMLElement) {
				el.textContent = this.state.title;
			}
		}

		class CartModel extends SprinculModel {
			beforeInit() {
				this.state.count = 3;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.registerAll({ UserModel, ProductModel, CartModel });
		Sprincul.init();

		const userName = container.querySelector("[data-bind-name]");
		const productTitle = container.querySelector("[data-bind-title]");
		const cartCount = container.querySelector("[data-bind-count]");

		expect(userName?.textContent).toBe("John Doe");
		expect(productTitle?.textContent).toBe("Laptop");
		expect(cartCount?.textContent).toBe("3");
	});

	test("removes data-cloaked attribute after initialization", async () => {
		container.innerHTML = html`
			<div data-model="TestModel" data-cloaked>
				<span>Content</span>
			</div>
		`;

		class TestModel extends SprinculModel {}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		// Wait for the init promise to resolve and remove cloaks
		await waitForDomUpdate();

		const model = container.querySelector('[data-model="TestModel"]');
		expect(model?.hasAttribute("data-cloaked")).toBe(false);
	});

	test("logs an error when afterInit throws", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		container.innerHTML = html`<div data-model="AfterInitErrorModel"></div>`;

		class AfterInitErrorModel extends SprinculModel {
			afterInit() {
				throw new Error("hook failed");
			}
		}

		Sprincul.register("AfterInitErrorModel", AfterInitErrorModel);

		Sprincul.init();
		// Wait for the afterInit hook to complete and error to be logged
		await waitForDomUpdate();

		expect(errorSpy).toHaveBeenCalledWith('Error in "afterInit" hook call:', expect.any(Error));
		errorSpy.mockRestore();
	});

	test("warns in devMode when a binding callback is not found", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		container.innerHTML = html`
			<div data-model="DevModeModel">
				<span data-bind-count="nonExistentFn"></span>
			</div>
		`;

		class DevModeModel extends SprinculModel {}

		Sprincul.register("DevModeModel", DevModeModel);

		Sprincul.init({ devMode: true });

		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] Binding callback "nonExistentFn" not found for data-bind-count.',
		);
		warnSpy.mockRestore();
	});

	test("warns in devMode when an on* event handler method is not found", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		container.innerHTML = html`
			<div data-model="DevModeModel">
				<button onclick="nonExistentHandler">Click</button>
			</div>
		`;

		class DevModeModel extends SprinculModel {}

		Sprincul.register("DevModeModel", DevModeModel);

		Sprincul.init({ devMode: true });

		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] Event handler method "nonExistentHandler" not found for onclick.',
		);
		warnSpy.mockRestore();
	});

	test("processes nested models", async () => {
		container.innerHTML = html`
			<div data-model="OuterModel">
				<span data-bind-outer="updateOuter"></span>
				<div data-model="InnerModel">
					<span data-bind-inner="updateInner"></span>
				</div>
			</div>
		`;

		class OuterModel extends SprinculModel {
			beforeInit() {
				this.state.outer = "Outer";
			}

			updateOuter(el: HTMLElement) {
				el.textContent = this.state.outer;
			}
		}

		class InnerModel extends SprinculModel {
			beforeInit() {
				this.state.inner = "Inner";
			}

			updateInner(el: HTMLElement) {
				el.textContent = this.state.inner;
			}
		}

		Sprincul.register("OuterModel", OuterModel);
		Sprincul.register("InnerModel", InnerModel);
		Sprincul.init();

		const outerSpan = container.querySelector("[data-bind-outer]");
		const innerSpan = container.querySelector("[data-bind-inner]");

		expect(outerSpan?.textContent).toBe("Outer");
		expect(innerSpan?.textContent).toBe("Inner");
	});

	test("init({ root }) scopes the scan to that element's subtree", async () => {
		const scopedRoot = document.createElement("div");
		container.appendChild(scopedRoot);

		scopedRoot.innerHTML = html`<div data-model="InsideModel"></div>`;
		container.insertAdjacentHTML("beforeend", html`<div data-model="OutsideModel"></div>`);

		let insideInitialized = false;
		let outsideInitialized = false;

		class InsideModel extends SprinculModel {
			beforeInit() {
				insideInitialized = true;
			}
		}
		class OutsideModel extends SprinculModel {
			beforeInit() {
				outsideInitialized = true;
			}
		}

		Sprincul.register("InsideModel", InsideModel);
		Sprincul.register("OutsideModel", OutsideModel);

		Sprincul.init({ root: scopedRoot });

		expect(insideInitialized).toBe(true);
		expect(outsideInitialized).toBe(false);
	});

	test("init({ root }) also processes root itself when root carries data-model", () => {
		const scopedRoot = document.createElement("div");
		scopedRoot.setAttribute("data-model", "RootModel");
		scopedRoot.innerHTML = html`<div data-model="ChildModel"></div>`;
		container.appendChild(scopedRoot);

		let rootInitialized = false;
		let childInitialized = false;

		class RootModel extends SprinculModel {
			beforeInit() {
				rootInitialized = true;
			}
		}
		class ChildModel extends SprinculModel {
			beforeInit() {
				childInitialized = true;
			}
		}

		Sprincul.register("RootModel", RootModel);
		Sprincul.register("ChildModel", ChildModel);

		Sprincul.init({ root: scopedRoot });

		expect(rootInitialized).toBe(true);
		expect(childInitialized).toBe(true);
	});

	test("each init() call takes its own root; one call's root doesn't affect the next", async () => {
		const firstRoot = document.createElement("div");
		const secondRoot = document.createElement("div");
		container.appendChild(firstRoot);
		container.appendChild(secondRoot);

		firstRoot.innerHTML = html`<div data-model="FirstModel"></div>`;
		secondRoot.innerHTML = html`<div data-model="SecondModel"></div>`;

		let firstInitialized = false;
		let secondInitialized = false;

		class FirstModel extends SprinculModel {
			beforeInit() {
				firstInitialized = true;
			}
		}
		class SecondModel extends SprinculModel {
			beforeInit() {
				secondInitialized = true;
			}
		}
		Sprincul.register("FirstModel", FirstModel);
		Sprincul.register("SecondModel", SecondModel);

		Sprincul.init({ root: firstRoot });
		expect(firstInitialized).toBe(true);
		expect(secondInitialized).toBe(false);

		Sprincul.init({ root: secondRoot });
		expect(secondInitialized).toBe(true);
	});

	test("initial callbacks wait for an async beforeInit to fully resolve before firing", async () => {
		container.innerHTML = html`
			<div data-model="AsyncBeforeInit">
				<span data-bind-message="updateMessage"></span>
			</div>
		`;

		class AsyncBeforeInit extends SprinculModel {
			async beforeInit() {
				await Promise.resolve();
				// Set after the await: this only reaches the binding if init genuinely waits
				// for the whole hook to resolve, not just the synchronous part of the call.
				this.state.message = "Hello from async beforeInit!";
			}

			updateMessage(el: HTMLElement) {
				el.textContent = this.state.message;
			}
		}

		Sprincul.register("AsyncBeforeInit", AsyncBeforeInit);
		Sprincul.init();

		const span = container.querySelector("span");

		// Not yet: the hook hasn't resolved, so the initial callback hasn't fired.
		expect(span?.textContent).toBe("");

		await waitForDomUpdate();

		expect(span?.textContent).toBe("Hello from async beforeInit!");
	});

	test("on* event listeners are not live until beforeInit has genuinely finished", () => {
		container.innerHTML = html`
			<div data-model="SlowInitModel">
				<button onclick="increment">+</button>
			</div>
		`;

		let stateWhenClicked: number | "unset" | undefined;

		class SlowInitModel extends SprinculModel {
			async beforeInit() {
				await Promise.resolve();
				this.state.count = 0;
			}

			increment() {
				stateWhenClicked = this.state.count ?? "unset";
			}
		}

		Sprincul.register("SlowInitModel", SlowInitModel);
		Sprincul.init();

		// Click synchronously, right after init() returns: beforeInit is suspended at its await,
		// so the listener must not be attached yet.
		const button = container.querySelector("button") as HTMLButtonElement;
		button.click();

		expect(stateWhenClicked).toBeUndefined();
	});
});
