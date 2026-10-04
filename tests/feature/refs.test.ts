/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, initInstances, waitForDomUpdate } from "../helpers.ts";

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
		Sprincul.init({ root: container, devMode: true, onReady: (infos: unknown[]) => models.push(...infos) });

		const parent = models.find((m) => m.name === "Parent").instance;
		const child = models.find((m) => m.name === "Child").instance;

		expect(parent.$refs("label").map((s: HTMLElement) => s.textContent)).toEqual(["parent"]);
		expect(child.$refs("label").map((s: HTMLElement) => s.textContent)).toEqual(["child"]);
		expect(parent.$ref("child")).toBe(child.$el);
		expect(child.$ref("child")).toBeNull();
	});

	test("markup inserted without wire() is found", () => {
		class ResultsModel extends SprinculModel {}

		const el = document.createElement("div");
		el.innerHTML = html`<ul></ul>
			<template><li data-ref="item">cloned</li></template>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ResultsModel);
		const list = el.querySelector("ul")!;

		list.innerHTML = html`<li data-ref="item">fetched</li>`;
		list.appendChild(el.querySelector("template")!.content.cloneNode(true));

		expect(instance.$refs("item").map((li: HTMLElement) => li.textContent)).toEqual(["fetched", "cloned"]);
	});

	test("an element removed from the model is no longer returned", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<span data-ref="note">hi</span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});
		el.querySelector("span")!.remove();

		expect(instance.$ref("note")).toBeNull();
	});

	test("a ref name with whitespace never matches and warns in devMode", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const el = document.createElement("div");
		el.innerHTML = html`<button data-ref="tab primary"></button>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {}, { devMode: true });

		expect(instance.$ref("tab")).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] data-ref="tab primary" contains whitespace; a ref takes a single name.',
		);

		warnSpy.mockRestore();
	});

	test("reading a model's own root ref from inside it warns in devMode", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const el = document.createElement("div");
		el.setAttribute("data-ref", "stack");
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {}, { devMode: true });

		expect(instance.$ref("stack")).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			"[Sprincul] $ref(\"stack\") matches this model's own root, which is its parent model's ref, not its own.",
		);

		warnSpy.mockRestore();
	});

	test("a ref on a grandchild model's root belongs to the model directly containing it", () => {
		class Outer extends SprinculModel {}
		class Middle extends SprinculModel {}
		class Inner extends SprinculModel {}
		Sprincul.registerAll({ Outer, Middle, Inner });
		container.innerHTML = html`<div data-model="Outer">
			<div data-model="Middle" data-ref="middle">
				<div data-model="Inner" data-ref="inner"></div>
			</div>
		</div>`;

		const instances = initInstances(container);
		const outer = instances.get(container.querySelector('[data-model="Outer"]')!);
		const middle = instances.get(container.querySelector('[data-model="Middle"]')!);

		expect(outer.$ref("middle")).toBe(middle.$el);
		expect(outer.$ref("inner")).toBeNull();
		expect(middle.$ref("inner")).toBe(container.querySelector('[data-model="Inner"]'));
	});

	test("an empty ref name matches nothing", () => {
		const el = document.createElement("div");
		el.innerHTML = html`<span data-ref=""></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, class extends SprinculModel {});

		expect(instance.$refs("")).toEqual([]);
	});

	test("refs can be read from the constructor, before the model is mounted", () => {
		let fromConstructor = null as HTMLElement | null;

		class Early extends SprinculModel {
			constructor(element: HTMLElement) {
				super(element);
				fromConstructor = this.$ref("note");
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<span data-ref="note"></span>`;
		container.appendChild(el);
		Sprincul.mount(el, Early);

		expect(fromConstructor).toBe(el.querySelector("span"));
	});
});
