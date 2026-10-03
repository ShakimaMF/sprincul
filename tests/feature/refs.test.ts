/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Refs", () => {
	test("a ref resolves in beforeInit, binding callbacks, and afterInit", async () => {
		const seen: Record<string, HTMLElement | null> = {};

		class FormModel extends SprinculModel {
			beforeInit() {
				seen.beforeInit = this.$ref("email");
				this.state.value = "";
			}

			render() {
				seen.callback = this.$ref("email");
			}

			afterInit() {
				seen.afterInit = this.$ref("email");
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<input data-ref="email" /><span data-bind-value="render"></span>`;
		container.appendChild(el);

		Sprincul.mount(el, FormModel);
		await waitForDomUpdate();

		const input = el.querySelector("input");
		expect(seen.beforeInit).toBe(input);
		expect(seen.callback).toBe(input);
		expect(seen.afterInit).toBe(input);
	});

	test("$refs returns every match in document order; $ref returns the first", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<ul>
			<li data-ref="item">A</li>
			<li data-ref="item">B</li>
			<li data-ref="item">C</li>
		</ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});

		expect(instance.$refs("item").map((li: HTMLElement) => li.textContent)).toEqual(["A", "B", "C"]);
		expect(instance.$ref("item")!.textContent).toBe("A");
	});

	test("$refs follows document order after a prepend is wired and an element is moved", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<ul>
			<li data-ref="color">red</li>
			<li data-ref="color">blue</li>
			<li data-ref="color">black</li>
		</ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});
		const list = el.querySelector("ul")!;
		const colors = () => instance.$refs("color").map((li: HTMLElement) => li.textContent);

		const green = document.createElement("li");
		green.setAttribute("data-ref", "color");
		green.textContent = "green";
		list.prepend(green);
		instance.wire(green);

		expect(colors()).toEqual(["green", "red", "blue", "black"]);

		list.prepend(list.lastElementChild!);

		expect(colors()).toEqual(["black", "green", "red", "blue"]);
		expect(instance.$ref("color")!.textContent).toBe("black");
	});

	test("a missing ref gives null and an empty array", () => {
		const el = document.createElement("div");
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});

		expect(instance.$ref("missing")).toBeNull();
		expect(instance.$refs("missing")).toEqual([]);
	});

	test("a child model's descendants are not the parent's refs, but the child's root ref is", () => {
		class Parent extends SprinculModel {}
		class Child extends SprinculModel {}
		Sprincul.registerAll({ Parent, Child });

		container.innerHTML = html`<div data-model="Parent">
			<span data-ref="label">parent</span>
			<div data-model="Child" data-ref="child">
				<span data-ref="label">child</span>
			</div>
		</div>`;

		const models: any[] = [];
		Sprincul.init({ root: container, devMode: true, onReady: (infos) => models.push(...infos) });

		const parent = models.find((m) => m.name === "Parent").instance;
		const child = models.find((m) => m.name === "Child").instance;

		expect(parent.$refs("label").map((s: HTMLElement) => s.textContent)).toEqual(["parent"]);
		expect(child.$refs("label").map((s: HTMLElement) => s.textContent)).toEqual(["child"]);
		expect(parent.$ref("child")).toBe(child.$el);
		expect(child.$ref("child")).toBeNull();
	});

	test("wire() adds refs and unwire() releases only the wired ones", () => {
		class ListModel extends SprinculModel {}

		const el = document.createElement("div");
		el.innerHTML = html`<ul data-ref="list"><li data-ref="item">A</li></ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel);
		const list = el.querySelector("ul")!;

		const li = document.createElement("li");
		li.setAttribute("data-ref", "item");
		li.textContent = "B";
		list.appendChild(li);
		instance.wire(list);

		expect(instance.$refs("item").map((node: HTMLElement) => node.textContent)).toEqual(["A", "B"]);

		instance.unwire(list);

		expect(instance.$refs("item").map((node: HTMLElement) => node.textContent)).toEqual(["A"]);
		expect(instance.$ref("list")).toBe(list);
	});

	test("an element removed without unwire() is no longer returned", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<span data-ref="note">hi</span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});
		el.querySelector("span")!.remove();

		expect(instance.$ref("note")).toBeNull();
	});

	test("reading a ref after destroy throws", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<span data-ref="note"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});
		Sprincul.unmount(el);

		expect(() => instance.$ref("note")).toThrow(/before core was available/);
	});
});
