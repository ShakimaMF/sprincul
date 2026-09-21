/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Teardown", () => {
	test("destroy(modelName) tears down all instances for that model", async () => {
		container.innerHTML = html`
			<div data-model="DestroyByNameModel" id="one">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
			<div data-model="DestroyByNameModel" id="two">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
		`;

		class DestroyByNameModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			increment() {
				this.state.count++;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("DestroyByNameModel", DestroyByNameModel);
		Sprincul.init();

		const one = container.querySelector("#one") as HTMLElement;
		const two = container.querySelector("#two") as HTMLElement;
		const oneButton = one.querySelector("button") as HTMLButtonElement;
		const twoButton = two.querySelector("button") as HTMLButtonElement;
		const oneCount = one.querySelector("[data-bind-count]") as HTMLElement;
		const twoCount = two.querySelector("[data-bind-count]") as HTMLElement;

		oneButton.click();
		twoButton.click();
		await waitForDomUpdate();

		expect(oneCount.textContent).toBe("1");
		expect(twoCount.textContent).toBe("1");

		Sprincul.destroy("DestroyByNameModel");

		oneButton.click();
		twoButton.click();
		await waitForDomUpdate();

		expect(oneCount.textContent).toBe("1");
		expect(twoCount.textContent).toBe("1");
	});

	test("destroy(modelName, element) tears down only the matching instance", async () => {
		container.innerHTML = html`
			<div data-model="ScopedDestroyModel" id="first">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
			<div data-model="ScopedDestroyModel" id="second">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
		`;

		class ScopedDestroyModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			increment() {
				this.state.count++;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("ScopedDestroyModel", ScopedDestroyModel);
		Sprincul.init();

		const firstRoot = container.querySelector("#first") as HTMLElement;
		const secondRoot = container.querySelector("#second") as HTMLElement;
		const firstButton = firstRoot.querySelector("button") as HTMLButtonElement;
		const secondButton = secondRoot.querySelector("button") as HTMLButtonElement;
		const firstCount = firstRoot.querySelector("[data-bind-count]") as HTMLElement;
		const secondCount = secondRoot.querySelector("[data-bind-count]") as HTMLElement;

		firstButton.click();
		secondButton.click();
		await waitForDomUpdate();

		expect(firstCount.textContent).toBe("1");
		expect(secondCount.textContent).toBe("1");

		Sprincul.destroy("ScopedDestroyModel", firstRoot);

		firstButton.click();
		secondButton.click();
		await waitForDomUpdate();

		expect(firstCount.textContent).toBe("1");
		expect(secondCount.textContent).toBe("2");
	});

	test("unmount() tears down a detached element; re-mounting fresh markup starts a new instance", async () => {
		container.innerHTML = html`
			<div data-model="RemovedParentModel" id="parent-root">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
		`;

		class RemovedParentModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			increment() {
				this.state.count++;
			}

			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("RemovedParentModel", RemovedParentModel);
		Sprincul.init();

		const root = container.querySelector("#parent-root") as HTMLElement;
		const originalButton = root.querySelector("button") as HTMLButtonElement;

		originalButton.click();
		await waitForDomUpdate();
		expect(root.querySelector("[data-bind-count]")?.textContent).toBe("1");

		Sprincul.unmount(root);
		root.remove();

		// The destroyed instance stays dead even though its (detached) button still exists.
		originalButton.click();
		await waitForDomUpdate();
		expect(root.querySelector("[data-bind-count]")?.textContent).toBe("1");

		// Fresh markup with the same data-model is a brand new instance once init() runs again.
		container.innerHTML = html`
			<div data-model="RemovedParentModel" id="parent-root">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
		`;
		Sprincul.init();

		const newRoot = container.querySelector("#parent-root") as HTMLElement;
		const newButton = newRoot.querySelector("button") as HTMLButtonElement;
		const newCount = newRoot.querySelector("[data-bind-count]") as HTMLElement;

		newButton.click();
		await waitForDomUpdate();
		expect(newCount.textContent).toBe("1");
	});

	test("destroyAll() tears down every live instance regardless of model name", async () => {
		container.innerHTML = html`
			<div data-model="Alpha" id="alpha">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
			<div data-model="Beta" id="beta">
				<button onclick="increment">+</button>
				<span data-bind-count="showCount"></span>
			</div>
		`;

		class Alpha extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			increment() {
				this.state.count++;
			}
			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		class Beta extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			increment() {
				this.state.count++;
			}
			showCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
		}

		Sprincul.register("Alpha", Alpha);
		Sprincul.register("Beta", Beta);
		Sprincul.init();

		const alphaButton = container.querySelector("#alpha button") as HTMLButtonElement;
		const betaButton = container.querySelector("#beta button") as HTMLButtonElement;
		const alphaCount = container.querySelector("#alpha [data-bind-count]") as HTMLElement;
		const betaCount = container.querySelector("#beta [data-bind-count]") as HTMLElement;

		alphaButton.click();
		betaButton.click();
		await waitForDomUpdate();

		expect(alphaCount.textContent).toBe("1");
		expect(betaCount.textContent).toBe("1");

		Sprincul.destroyAll();

		alphaButton.click();
		betaButton.click();
		await waitForDomUpdate();

		// Neither instance responds anymore. Both were torn down without needing to know their model names up front.
		expect(alphaCount.textContent).toBe("1");
		expect(betaCount.textContent).toBe("1");
	});

	test("beforeDestroy fires before teardown, with $el and state still intact", async () => {
		let elAtDestroy: HTMLElement | undefined;
		let countAtDestroy: number | undefined;

		class BeforeDestroyModel extends SprinculModel {
			beforeInit() {
				this.state.count = 5;
			}
			beforeDestroy() {
				elAtDestroy = this.$el;
				countAtDestroy = this.state.count;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);
		const instance = Sprincul.mount(el, BeforeDestroyModel);

		Sprincul.unmount(el);

		expect(elAtDestroy).toBe(instance.$el);
		expect(countAtDestroy).toBe(5);
	});

	test("destroyAll() calls beforeDestroy for every instance across multiple distinct model classes", () => {
		const destroyed: string[] = [];

		class Alpha extends SprinculModel {
			beforeDestroy() {
				destroyed.push(`Alpha:${this.$el.id}`);
			}
		}

		class Beta extends SprinculModel {
			beforeDestroy() {
				destroyed.push(`Beta:${this.$el.id}`);
			}
		}

		const alphaOne = document.createElement("div");
		alphaOne.id = "alpha-one";
		const alphaTwo = document.createElement("div");
		alphaTwo.id = "alpha-two";
		const beta = document.createElement("div");
		beta.id = "beta";
		container.append(alphaOne, alphaTwo, beta);

		Sprincul.mount(alphaOne, Alpha);
		Sprincul.mount(alphaTwo, Alpha);
		Sprincul.mount(beta, Beta);

		Sprincul.destroyAll();

		expect(destroyed).toHaveLength(3);
		expect(destroyed).toEqual(expect.arrayContaining(["Alpha:alpha-one", "Alpha:alpha-two", "Beta:beta"]));
	});

	test("beforeDestroy sees intact $el and state when torn down via destroy(name, element) and destroyAll()", () => {
		let elViaDestroy: HTMLElement | undefined;
		let countViaDestroy: number | undefined;
		let elViaDestroyAll: HTMLElement | undefined;
		let countViaDestroyAll: number | undefined;

		class DestroyModel extends SprinculModel {
			beforeInit() {
				this.state.count = 7;
			}
			beforeDestroy() {
				elViaDestroy = this.$el;
				countViaDestroy = this.state.count;
			}
		}

		class DestroyAllModel extends SprinculModel {
			beforeInit() {
				this.state.count = 9;
			}
			beforeDestroy() {
				elViaDestroyAll = this.$el;
				countViaDestroyAll = this.state.count;
			}
		}
		Sprincul.register("DestroyModel", DestroyModel);

		const viaDestroy = document.createElement("div");
		const viaDestroyAll = document.createElement("div");
		container.append(viaDestroy, viaDestroyAll);

		const destroyInstance = Sprincul.mount(viaDestroy, "DestroyModel");
		const destroyAllInstance = Sprincul.mount(viaDestroyAll, DestroyAllModel);

		Sprincul.destroy("DestroyModel", viaDestroy);
		Sprincul.destroyAll();

		expect(elViaDestroy).toBe(destroyInstance.$el);
		expect(countViaDestroy).toBe(7);
		expect(elViaDestroyAll).toBe(destroyAllInstance.$el);
		expect(countViaDestroyAll).toBe(9);
	});

	test("beforeDestroy fires on destroy(), destroyAll(), and unmount()", () => {
		const calls: string[] = [];

		class TrackedModel extends SprinculModel {
			beforeDestroy() {
				calls.push(this.$el.id);
			}
		}
		Sprincul.register("TrackedModel", TrackedModel);

		const viaUnmount = document.createElement("div");
		viaUnmount.id = "via-unmount";
		const viaDestroy = document.createElement("div");
		viaDestroy.id = "via-destroy";
		const viaDestroyAll = document.createElement("div");
		viaDestroyAll.id = "via-destroy-all";
		container.append(viaUnmount, viaDestroy, viaDestroyAll);

		Sprincul.mount(viaUnmount, TrackedModel);
		Sprincul.mount(viaDestroy, "TrackedModel");
		Sprincul.mount(viaDestroyAll, "TrackedModel");

		Sprincul.unmount(viaUnmount);
		Sprincul.destroy("TrackedModel", viaDestroy);
		Sprincul.destroyAll();

		expect(calls).toEqual(["via-unmount", "via-destroy", "via-destroy-all"]);
	});

	test("a throwing beforeDestroy does not block the rest of teardown", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		class ThrowingDestroyModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			bindCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
			beforeDestroy() {
				throw new Error("cleanup failed");
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="bindCount"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ThrowingDestroyModel);
		const span = el.querySelector("span") as HTMLElement;

		Sprincul.unmount(el);

		expect(errorSpy).toHaveBeenCalledWith('Error in "beforeDestroy" hook call:', expect.any(Error));

		// Teardown still ran despite the throw: further state changes don't reach the (still bound) span
		instance.state.count = 99;
		await waitForDomUpdate();
		expect(span.textContent).toBe("0");

		errorSpy.mockRestore();
	});

	test("destroying and remounting a model on the same element within one synchronous tick does not double-register bindings", async () => {
		let bindCallCount = 0;

		class ReusableModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			bindCount(el: HTMLElement) {
				bindCallCount++;
				el.textContent = String(this.state.count);
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="bindCount"></span>`;
		container.appendChild(el);

		const first = Sprincul.mount(el, ReusableModel);

		// Same tick: tear down and remount on the very same element/markup
		Sprincul.unmount(el);
		const second = Sprincul.mount(el, ReusableModel);

		bindCallCount = 0;
		second.state.count = 1;
		await waitForDomUpdate();

		const span = el.querySelector("span") as HTMLElement;
		expect(bindCallCount).toBe(1);
		expect(span.textContent).toBe("1");

		// The destroyed first instance is fully detached: it no longer drives the DOM
		first.state.count = 42;
		await waitForDomUpdate();
		expect(span.textContent).toBe("1");
	});

	test("teardown waits for an async beforeDestroy to fully resolve before tearing down the core", async () => {
		let cleanedUp = false;

		class AsyncDestroyModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			bindCount(el: HTMLElement) {
				el.textContent = String(this.state.count);
			}
			async beforeDestroy() {
				await Promise.resolve();
				cleanedUp = true; // set post-await, so this only passes if teardown truly waited
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="bindCount"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, AsyncDestroyModel);
		const span = el.querySelector("span") as HTMLElement;

		Sprincul.unmount(el);

		// Not yet: the hook hasn't resolved, so the core hasn't torn down and the model is still tracked.
		expect(cleanedUp).toBe(false);

		await waitForDomUpdate();

		expect(cleanedUp).toBe(true);

		// Teardown genuinely ran once the hook resolved: further state changes don't reach the span
		instance.state.count = 99;
		await waitForDomUpdate();
		expect(span.textContent).toBe("0");
	});

	test("remounting on an element mid-async-beforeDestroy is a no-op until teardown finishes", async () => {
		let resolveDestroy: () => void;
		const destroySignal = new Promise<void>((resolve) => {
			resolveDestroy = resolve;
		});

		class SlowDestroyModel extends SprinculModel {
			async beforeDestroy() {
				await destroySignal;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		const first = Sprincul.mount(el, SlowDestroyModel);
		Sprincul.unmount(el);

		// The element is still mid-teardown: mounting on it again is treated as already processed.
		expect(() => Sprincul.mount(el, SlowDestroyModel)).toThrow();

		resolveDestroy!();
		await waitForDomUpdate();

		// Now that the first instance's teardown has actually finished, the element is free again.
		const second = Sprincul.mount(el, SlowDestroyModel);
		expect(second).not.toBe(first);
	});

	test("unmounting while beforeInit is still pending prevents its queued callbacks/listeners from ever firing", async () => {
		let resolveInit: () => void;
		const initSignal = new Promise<void>((resolve) => {
			resolveInit = resolve;
		});

		let bindCallCount = 0;
		let clickCallCount = 0;

		class SlowInitModel extends SprinculModel {
			async beforeInit() {
				await initSignal;
				this.state.count = 0;
			}
			bindCount() {
				bindCallCount++;
			}
			increment() {
				clickCallCount++;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-bind-count="bindCount"></span><button onclick="increment">+</button>`;
		container.appendChild(el);

		Sprincul.mount(el, SlowInitModel);

		// Destroy the instance while beforeInit is still suspended at its await.
		Sprincul.unmount(el);

		resolveInit!();
		await waitForDomUpdate();

		// beforeInit's continuation ran (it isn't cancelled), but its queue must not fire on a torn-down core
		expect(bindCallCount).toBe(0);

		const button = el.querySelector("button") as HTMLButtonElement;
		button.click();
		expect(clickCallCount).toBe(0);
	});

	test("afterInit does not run until an async beforeInit has genuinely resolved", async () => {
		let resolveInit: () => void;
		const initSignal = new Promise<void>((resolve) => {
			resolveInit = resolve;
		});

		let afterInitCalled = false;
		let stateWhenAfterInitCalled: number | undefined;

		class SlowInitModel extends SprinculModel {
			async beforeInit() {
				await initSignal;
				this.state.count = 42;
			}
			afterInit() {
				afterInitCalled = true;
				stateWhenAfterInitCalled = this.state.count;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		Sprincul.mount(el, SlowInitModel);

		// beforeInit hasn't resolved yet: afterInit must not have run.
		expect(afterInitCalled).toBe(false);

		resolveInit!();
		await waitForDomUpdate();

		expect(afterInitCalled).toBe(true);
		expect(stateWhenAfterInitCalled).toBe(42);
	});

	test("a second destroy() call while beforeDestroy is still pending does not invoke it twice", async () => {
		let resolveDestroy: () => void;
		const destroySignal = new Promise<void>((resolve) => {
			resolveDestroy = resolve;
		});

		let beforeDestroyCallCount = 0;

		class SlowDestroyModel extends SprinculModel {
			async beforeDestroy() {
				beforeDestroyCallCount++;
				await destroySignal;
			}
		}

		Sprincul.register("SlowDestroyModel", SlowDestroyModel);

		const el = document.createElement("div");
		container.appendChild(el);

		Sprincul.mount(el, SlowDestroyModel);

		// Call destroy on this model twice in the same tick, before beforeDestroy resolves either time.
		Sprincul.destroy("SlowDestroyModel");
		Sprincul.destroy("SlowDestroyModel");
		Sprincul.destroyAll();

		resolveDestroy!();
		await waitForDomUpdate();

		expect(beforeDestroyCallCount).toBe(1);
	});
});
