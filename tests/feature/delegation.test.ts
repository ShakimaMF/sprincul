/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html } from "../helpers.ts";

/** Mounts `Model` on a div holding `markup` and returns the root, the instance, and what its handlers logged. */
function mountWith(markup: string, Model: new (el: HTMLElement) => any) {
	const root = document.createElement("div");
	root.innerHTML = markup;
	container.appendChild(root);
	const instance = Sprincul.mount(root, Model);
	return { root, instance };
}

function event(target: Element, type: string, init: EventInit = {}) {
	const EventCtor = target.ownerDocument.defaultView!.Event;
	return new EventCtor(type, init);
}

describe("Sprincul - Delegated events", () => {
	test("an element added after mount reaches its handler without wire()", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<button data-on-click="add">Add</button>
				<ul></ul>`,
			class extends SprinculModel {
				add() {
					calls.push("add");
				}
				remove() {
					calls.push("remove");
				}
			},
		);

		root.querySelector("ul")!.innerHTML = html`<li><button data-on-click="remove">x</button></li>`;
		root.querySelector<HTMLElement>("li button")!.click();

		expect(calls).toEqual(["remove"]);
	});

	test("an event type used only inside a template is handled once its content is appended", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<ul></ul>
				<template><li data-on-dblclick="open"></li></template>`,
			class extends SprinculModel {
				open() {
					calls.push("open");
				}
			},
		);

		const item = root.querySelector("template")!.content.cloneNode(true);
		root.querySelector("ul")!.append(item);
		root.querySelector("li")!.dispatchEvent(event(root, "dblclick", { bubbles: true }));

		expect(calls).toEqual(["open"]);
	});

	test("a type the model hasn't used is handled once its content is wired", () => {
		const calls: string[] = [];
		const { root, instance } = mountWith(
			html`<div class="slot"></div>`,
			class extends SprinculModel {
				expand() {
					calls.push("expand");
				}
			},
		);

		const slot = root.querySelector<HTMLElement>(".slot")!;
		slot.innerHTML = html`<section data-on-toggle-panel="expand"></section>`;
		const section = slot.querySelector("section")!;

		section.dispatchEvent(event(root, "toggle-panel", { bubbles: true }));
		expect(calls).toEqual([]);

		instance.wire(slot);
		section.dispatchEvent(event(root, "toggle-panel", { bubbles: true }));
		expect(calls).toEqual(["expand"]);
	});

	test("handlers get the element with the attribute, even when the click lands on a child", () => {
		let received: { el?: Element; currentTarget?: EventTarget | null } = {};
		const { root } = mountWith(
			html`<button data-on-click="pick" data-id="7"><span>Pick</span></button>`,
			class extends SprinculModel {
				pick(e: Event, el: HTMLElement) {
					received = { el, currentTarget: e.currentTarget };
				}
			},
		);

		root.querySelector("span")!.click();

		expect(received.el).toBe(root.querySelector("button")!);
		expect(received.currentTarget).toBe(root);
	});

	test("the attribute is read when the event fires, so changing or removing it takes effect", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<button data-on-click="first"></button>`,
			class extends SprinculModel {
				first() {
					calls.push("first");
				}
				second() {
					calls.push("second");
				}
			},
		);
		const button = root.querySelector("button")!;

		button.setAttribute("data-on-click", "second");
		button.click();
		button.removeAttribute("data-on-click");
		button.click();

		expect(calls).toEqual(["second"]);
	});

	test("handlers on the path run deepest first, like native bubbling", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<section data-on-click="outer"><button data-on-click="inner"></button></section>`,
			class extends SprinculModel {
				outer() {
					calls.push("outer");
				}
				inner() {
					calls.push("inner");
				}
			},
		);

		root.querySelector("button")!.click();

		expect(calls).toEqual(["inner", "outer"]);
	});

	test("stopPropagation() stops the handlers above it", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<section data-on-click="outer"><button data-on-click="inner"></button></section>`,
			class extends SprinculModel {
				outer() {
					calls.push("outer");
				}
				inner(e: Event) {
					calls.push("inner");
					e.stopPropagation();
				}
			},
		);

		root.querySelector("button")!.click();

		expect(calls).toEqual(["inner"]);
	});

	describe("nested models", () => {
		function mountNested(stopInChild: boolean) {
			const calls: string[] = [];

			class Page extends SprinculModel {
				track() {
					calls.push("page:track");
				}
				save() {
					calls.push("page:save");
				}
			}
			class Cart extends SprinculModel {
				save(e: Event) {
					calls.push("cart:save");
					if (stopInChild) e.stopPropagation();
				}
			}
			Sprincul.registerAll({ Page, Cart });
			container.innerHTML = html`<div data-model="Page">
				<section data-on-click="track">
					<div data-model="Cart"><button data-on-click="save"></button></div>
				</section>
			</div>`;
			Sprincul.init({ root: container });

			return { calls, button: container.querySelector("button")! };
		}

		test("the child's handler runs, then the parent's above it, and the parent never runs the child's", () => {
			const { calls, button } = mountNested(false);

			button.click();

			expect(calls).toEqual(["cart:save", "page:track"]);
		});

		test("stopPropagation() in the child keeps the event from the parent", () => {
			const { calls, button } = mountNested(true);

			button.click();

			expect(calls).toEqual(["cart:save"]);
		});
	});

	test("a non-bubbling event reaches only its target's handler", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<label data-on-focus="wrapper"><input data-on-focus="field" /></label>`,
			class extends SprinculModel {
				wrapper() {
					calls.push("wrapper");
				}
				field() {
					calls.push("field");
				}
			},
		);

		root.querySelector("input")!.dispatchEvent(event(root, "focus"));

		expect(calls).toEqual(["field"]);
	});

	test("an event on the root itself is handled once, bubbling or not", () => {
		const calls: string[] = [];
		const root = document.createElement("div");
		root.setAttribute("data-on-ping", "ping");
		container.appendChild(root);
		Sprincul.mount(
			root,
			class extends SprinculModel {
				ping(e: Event) {
					calls.push(e.bubbles ? "bubbles" : "flat");
				}
			},
		);

		root.dispatchEvent(event(root, "ping", { bubbles: true }));
		root.dispatchEvent(event(root, "ping"));

		expect(calls).toEqual(["bubbles", "flat"]);
	});

	test("events wait for an async beforeInit to finish", async () => {
		const calls: string[] = [];
		let seeded!: () => void;
		const { root } = mountWith(
			html`<button data-on-click="save"></button>`,
			class extends SprinculModel {
				beforeInit() {
					return new Promise<void>((resolve) => (seeded = resolve));
				}
				save() {
					calls.push("save");
				}
			},
		);
		const button = root.querySelector("button")!;

		button.click();
		seeded();
		await Promise.resolve();
		await Promise.resolve();
		button.click();

		expect(calls).toEqual(["save"]);
	});

	test("unmounting stops the model's events", async () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<button data-on-click="save"></button>`,
			class extends SprinculModel {
				save() {
					calls.push("save");
				}
			},
		);

		await Sprincul.unmount(root);
		root.querySelector("button")!.click();

		expect(calls).toEqual([]);
	});

	test("a missing handler on added content warns once in devMode", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		const root = document.createElement("div");
		root.innerHTML = html`<button data-on-click="save"></button>`;
		container.appendChild(root);
		Sprincul.mount(
			root,
			class extends SprinculModel {
				save() {}
			},
			{ devMode: true },
		);

		root.insertAdjacentHTML("beforeend", html`<button id="added" data-on-click="missing"></button>`);
		const added = root.querySelector<HTMLElement>("#added")!;
		added.click();
		added.click();

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('[Sprincul] Event handler method "missing" not found for data-on-click.');
		warn.mockRestore();
	});
});
