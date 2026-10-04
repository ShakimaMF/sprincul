/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, initInstances } from "../helpers.ts";

describe("Sprincul - Subtree mounting", () => {
	function registerLogging(log: string[]) {
		class Logged extends SprinculModel {
			get label() {
				return this.$el.dataset.label;
			}

			afterInit() {
				log.push(`init:${this.label}`);
			}

			beforeDestroy() {
				log.push(`destroy:${this.label}`);
			}
		}
		Sprincul.register("Logged", Logged);
	}

	const tree = html`<div data-model="Logged" data-label="parent">
		<div data-model="Logged" data-label="first">
			<div data-model="Logged" data-label="grandchild"></div>
		</div>
		<div data-model="Logged" data-label="second"></div>
	</div>`;

	test("init() mounts nested models before the models containing them, keeping sibling order", () => {
		const log: string[] = [];
		registerLogging(log);
		container.innerHTML = tree;

		Sprincul.init({ root: container });

		expect(log).toEqual(["init:grandchild", "init:first", "init:second", "init:parent"]);
	});

	test("a parent's afterInit can reach its children", () => {
		let childFromParent: unknown;

		class Child extends SprinculModel {}
		class Parent extends SprinculModel {
			afterInit() {
				childFromParent = this.$child("child");
			}
		}
		Sprincul.registerAll({ Parent, Child });
		container.innerHTML = html`<div data-model="Parent"><div data-model="Child" data-ref="child"></div></div>`;

		const instances = initInstances(container);

		expect(childFromParent).toBe(instances.get(container.querySelector('[data-model="Child"]')!));
	});

	test("init({ root }) again mounts only what is new", () => {
		const log: string[] = [];
		registerLogging(log);
		container.innerHTML = html`<div data-model="Logged" data-label="existing"></div>`;
		Sprincul.init({ root: container });

		container.insertAdjacentHTML("beforeend", html`<div data-model="Logged" data-label="added"></div>`);
		let reported: string[] = [];
		Sprincul.init({
			root: container,
			onReady: (models) => (reported = models.map((m) => m.element.dataset.label!)),
		});

		expect(log).toEqual(["init:existing", "init:added"]);
		expect(reported).toEqual(["added"]);
	});

	test("unmountAll(root) tears down the subtree only, parents first", () => {
		const log: string[] = [];
		registerLogging(log);
		container.innerHTML = tree + html`<div data-model="Logged" data-label="outside"></div>`;
		Sprincul.init({ root: container });
		log.length = 0;

		const first = container.querySelector('[data-label="first"]') as HTMLElement;
		Sprincul.unmountAll(first);

		expect(log).toEqual(["destroy:first", "destroy:grandchild"]);
	});

	test("a parent's async beforeDestroy settles before its children are torn down", async () => {
		const log: string[] = [];
		let release!: () => void;

		class Child extends SprinculModel {
			flush() {
				log.push("flush");
			}

			beforeDestroy() {
				log.push("destroy:child");
			}
		}
		class Parent extends SprinculModel {
			async beforeDestroy() {
				await new Promise<void>((resolve) => (release = resolve));
				this.$child<Child>("child")?.flush();
				log.push("destroy:parent");
			}
		}
		Sprincul.registerAll({ Parent, Child });
		container.innerHTML = html`<div data-model="Parent"><div data-model="Child" data-ref="child"></div></div>`;
		Sprincul.init({ root: container });

		const done = Sprincul.unmountAll(container);
		expect(log).toEqual([]);

		release();
		await done;

		expect(log).toEqual(["flush", "destroy:parent", "destroy:child"]);
	});

	test("remounting an element still tearing down is skipped with a devMode warning, and works once awaited", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		let mounts = 0;
		let release!: () => void;

		class Slow extends SprinculModel {
			afterInit() {
				mounts++;
			}

			beforeDestroy() {
				return new Promise<void>((resolve) => (release = resolve));
			}
		}
		Sprincul.register("Slow", Slow);
		container.innerHTML = html`<div data-model="Slow"></div>`;
		Sprincul.init({ root: container });

		const done = Sprincul.unmountAll(container);
		Sprincul.init({ root: container, devMode: true });

		expect(mounts).toBe(1);
		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] Skipped "Slow": the model on this element is still running an async beforeDestroy(). Await unmount() or unmountAll() before mounting it again.',
		);

		release();
		await done;
		Sprincul.init({ root: container });

		expect(mounts).toBe(2);
		warnSpy.mockRestore();
	});

	describe("a model whose teardown throws", () => {
		function mountWithBrokenTeardown(asyncParent: boolean) {
			const errorSpy = spyOn(console, "error").mockImplementation(() => {});
			const log: string[] = [];
			let mounts = 0;

			class Broken extends SprinculModel {
				afterInit() {
					mounts++;
				}

				noop() {}

				beforeDestroy() {
					return asyncParent ? Promise.resolve() : undefined;
				}
			}
			class Logged extends SprinculModel {
				beforeDestroy() {
					log.push(`destroy:${this.$el.dataset.label}`);
				}
			}
			Sprincul.registerAll({ Broken, Logged });
			container.innerHTML = html`<div data-model="Broken">
					<button onclick="noop"></button>
					<div data-model="Logged" data-label="child"></div>
				</div>
				<div data-model="Logged" data-label="sibling"></div>`;
			Sprincul.init({ root: container });

			// Make the core's own cleanup throw when it releases this listener
			container.querySelector("button")!.removeEventListener = () => {
				throw new Error("boom");
			};

			return { errorSpy, log, mounts: () => mounts };
		}

		test("sync: the rest of the subtree is still torn down and the element can be mounted again", async () => {
			const { errorSpy, log, mounts } = mountWithBrokenTeardown(false);

			await Sprincul.unmountAll(container);

			expect(log).toEqual(["destroy:child", "destroy:sibling"]);
			expect(errorSpy).toHaveBeenCalled();
			Sprincul.init({ root: container });
			expect(mounts()).toBe(2);
			errorSpy.mockRestore();
		});

		test("async: its children are still torn down and the returned promise resolves", async () => {
			const { errorSpy, log, mounts } = mountWithBrokenTeardown(true);

			await Sprincul.unmountAll(container);

			expect(log).toEqual(["destroy:sibling", "destroy:child"]);
			expect(errorSpy).toHaveBeenCalled();
			Sprincul.init({ root: container });
			expect(mounts()).toBe(2);
			errorSpy.mockRestore();
		});
	});

	test("destroyAll() tears down parents before children", () => {
		const log: string[] = [];
		registerLogging(log);
		container.innerHTML = tree;
		Sprincul.init({ root: container });
		log.length = 0;

		Sprincul.destroyAll();

		expect(log).toEqual(["destroy:parent", "destroy:first", "destroy:grandchild", "destroy:second"]);
	});

	test("unmount() resolves after an async beforeDestroy, and a repeat call waits for the same teardown", async () => {
		let release!: () => void;
		let destroyed = false;

		class Slow extends SprinculModel {
			async beforeDestroy() {
				await new Promise<void>((resolve) => (release = resolve));
				destroyed = true;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);
		Sprincul.mount(el, Slow);

		const first = Sprincul.unmount(el);
		const second = Sprincul.unmount(el);
		let settled = false;
		second.then(() => (settled = true));

		await Promise.resolve();
		expect(settled).toBe(false);

		release();
		await Promise.all([first, second]);

		expect(destroyed).toBe(true);
		expect(settled).toBe(true);
		// Torn down, so the element can be mounted again
		expect(() => Sprincul.mount(el, Slow)).not.toThrow();
	});

	test("destroyAll() waits for a parent's async beforeDestroy before its children", async () => {
		const log: string[] = [];
		let release!: () => void;

		class Child extends SprinculModel {
			beforeDestroy() {
				log.push("destroy:child");
			}
		}
		class Parent extends SprinculModel {
			async beforeDestroy() {
				await new Promise<void>((resolve) => (release = resolve));
				log.push("destroy:parent");
			}
		}
		Sprincul.registerAll({ Parent, Child });
		container.innerHTML = html`<div data-model="Parent"><div data-model="Child"></div></div>`;
		Sprincul.init({ root: container });

		const done = Sprincul.destroyAll();
		expect(log).toEqual([]);

		release();
		await done;

		expect(log).toEqual(["destroy:parent", "destroy:child"]);
	});

	test("mount() on an element still tearing down throws, and works once the teardown is awaited", async () => {
		let release!: () => void;

		class Slow extends SprinculModel {
			beforeDestroy() {
				return new Promise<void>((resolve) => (release = resolve));
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);
		Sprincul.mount(el, Slow);

		const done = Sprincul.unmount(el);
		expect(() => Sprincul.mount(el, Slow)).toThrow(/already be processed/);

		release();
		await done;

		expect(() => Sprincul.mount(el, Slow)).not.toThrow();
	});
});
