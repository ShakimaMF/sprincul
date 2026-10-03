/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html } from "../helpers.ts";

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

		Sprincul.init({ root: container });

		expect(childFromParent).toBe(Sprincul.instanceFor(container.querySelector('[data-model="Child"]')));
	});

	test("init({ root }) again mounts only what is new", () => {
		const log: string[] = [];
		registerLogging(log);
		container.innerHTML = html`<div data-model="Logged" data-label="existing"></div>`;
		Sprincul.init({ root: container });

		container.insertAdjacentHTML("beforeend", html`<div data-model="Logged" data-label="added"></div>`);
		let reported: string[] = [];
		Sprincul.init({ root: container, onReady: (models) => (reported = models.map((m) => m.element.dataset.label!)) });

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
		expect(Sprincul.instanceFor(first)).toBeNull();
		expect(Sprincul.instanceFor(container.querySelector('[data-label="outside"]'))).not.toBeNull();
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
});
