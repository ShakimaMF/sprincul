/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html } from "../helpers.ts";

/** Mounts `Model` on a div holding `markup` and returns the root and the instance. */
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

describe("Sprincul - data-on-* events", () => {
	test("handlers get the element with the attribute first, then the event, even when the click lands on a child", () => {
		let received: { el?: Element; currentTarget?: EventTarget | null } = {};
		const { root } = mountWith(
			html`<button data-on-click="pick" data-id="7"><span>Pick</span></button>`,
			class extends SprinculModel {
				pick(el: HTMLElement, e: Event) {
					received = { el, currentTarget: e.currentTarget };
				}
			},
		);

		root.querySelector("span")!.click();

		expect(received.el).toBe(root.querySelector("button")!);
		expect(received.currentTarget).toBe(root.querySelector("button")!);
	});

	test("an element added after mount is bound once it's wired", () => {
		const calls: string[] = [];
		const { root, instance } = mountWith(
			html`<ul></ul>`,
			class extends SprinculModel {
				remove() {
					calls.push("remove");
				}
			},
		);

		const list = root.querySelector("ul")!;
		list.innerHTML = html`<li><button data-on-click="remove">x</button></li>`;
		list.querySelector("button")!.click();
		instance.wire(list);
		list.querySelector("button")!.click();

		expect(calls).toEqual(["remove"]);
	});

	test("handlers bubble like native listeners, and stopPropagation() stops the ones above", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<li data-on-click="select"><button data-on-click="remove">Remove</button></li>`,
			class extends SprinculModel {
				select() {
					calls.push("select");
				}
				remove(_el: HTMLElement, e: Event) {
					calls.push("remove");
					if (calls.length > 2) e.stopPropagation();
				}
			},
		);

		const button = root.querySelector("button")!;
		button.click();
		button.click();

		expect(calls).toEqual(["remove", "select", "remove"]);
	});

	describe("nested models", () => {
		function mountNested(stopInChild: boolean) {
			const calls: string[] = [];

			class Page extends SprinculModel {
				track() {
					calls.push("page:track");
				}
			}
			class Cart extends SprinculModel {
				checkout(_el: HTMLElement, e: Event) {
					calls.push("cart:checkout");
					if (stopInChild) e.stopPropagation();
				}
			}
			Sprincul.registerAll({ Page, Cart });
			container.innerHTML = html`<div data-model="Page">
				<section data-on-click="track">
					<div data-model="Cart"><button data-on-click="checkout"></button></div>
				</section>
			</div>`;
			Sprincul.init({ root: container });

			return { calls, button: container.querySelector("button")! };
		}

		test("the child's handler runs, then the parent's above it", () => {
			const { calls, button } = mountNested(false);
			button.click();
			expect(calls).toEqual(["cart:checkout", "page:track"]);
		});

		test("stopPropagation() in the child keeps the event from the parent", () => {
			const { calls, button } = mountNested(true);
			button.click();
			expect(calls).toEqual(["cart:checkout"]);
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

	test("markup moved out of the root keeps its handlers", () => {
		const calls: string[] = [];
		const { root } = mountWith(
			html`<div class="menu"><button data-on-click="bold">B</button></div>`,
			class extends SprinculModel {
				bold() {
					calls.push("bold");
				}
			},
		);

		const menu = root.querySelector(".menu")!;
		document.body.appendChild(menu);
		menu.querySelector("button")!.click();
		menu.remove();

		expect(calls).toEqual(["bold"]);
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

	test("a missing handler warns in devMode when the element is bound", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const root = document.createElement("div");
			root.innerHTML = html`<button data-on-click="missing"></button>`;
			container.appendChild(root);
			Sprincul.mount(root, class extends SprinculModel {}, { devMode: true });

			expect(warn).toHaveBeenCalledWith('[Sprincul] Event handler method "missing" not found for data-on-click.');
		} finally {
			warn.mockRestore();
		}
	});
});
