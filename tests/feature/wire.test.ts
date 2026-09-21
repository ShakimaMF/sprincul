/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

describe("Sprincul - Wiring Dynamic Content", () => {
	test("wire() binds data-bind-*/on* attributes on new content added inside a live model's subtree", async () => {
		class ListModel extends SprinculModel {
			beforeInit() {
				this.state.lastclicked = "";
			}

			addItem(text: string) {
				const li = document.createElement("li");
				li.setAttribute("data-bind-lastclicked", "showClicked");
				li.setAttribute("onclick", "handleClick");
				li.dataset.label = text;
				this.$el.querySelector("ul")!.appendChild(li);
				this.wire(li);
			}

			handleClick(e: Event) {
				this.state.lastclicked = (e.currentTarget as HTMLElement).dataset.label;
			}

			showClicked(el: HTMLElement) {
				el.textContent = this.state.lastclicked;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<ul></ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel) as InstanceType<typeof ListModel>;
		instance.addItem("Apple");

		const li = el.querySelector("li") as HTMLLIElement;
		li.click();
		await waitForDomUpdate();

		expect(li.textContent).toBe("Apple");
		// on* attribute is stripped once bound, same as any other event wiring
		expect(li.hasAttribute("onclick")).toBe(false);
	});

	test("wire() binds every new child in one call: wiring a shared container after adding several items at once", async () => {
		class ListModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}

			renderItems(labels: string[]) {
				const list = this.$el.querySelector("ul")!;
				labels.forEach((label) => {
					const li = document.createElement("li");
					li.setAttribute("onclick", "bump");
					li.textContent = label;
					list.appendChild(li);
				});
				this.wire(list);
			}

			bump() {
				this.state.count++;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<ul></ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel) as InstanceType<typeof ListModel>;
		instance.renderItems(["Apple", "Banana", "Cherry"]);

		const items = el.querySelectorAll("li");
		expect(items).toHaveLength(3);

		items.forEach((li) => (li as HTMLLIElement).click());
		await waitForDomUpdate();

		expect(instance.state.count).toBe(3);
		items.forEach((li) => expect(li.hasAttribute("onclick")).toBe(false));
	});

	test("wire() does not auto-mount a nested [data-model] element found inside the wired content", async () => {
		class ContainerModel extends SprinculModel {}
		class NestedModel extends SprinculModel {
			beforeInit() {
				this.state.mounted = true;
			}
		}
		Sprincul.register("NestedModel", NestedModel);

		const el = document.createElement("div");
		container.appendChild(el);

		const instance = Sprincul.mount(el, ContainerModel) as InstanceType<typeof ContainerModel>;

		const nested = document.createElement("div");
		nested.setAttribute("data-model", "NestedModel");
		el.appendChild(nested);
		instance.wire(nested);

		// wire() is bind-only: the nested model root is untouched until mount()'d explicitly
		expect(nested.dataset.model).toBe("NestedModel");
		const nestedInstance = Sprincul.mount(nested, NestedModel) as InstanceType<typeof NestedModel>;
		expect(nestedInstance.state.mounted).toBe(true);
	});

	test("wire() skips content nested INSIDE a [data-model] root, not just the root element itself", async () => {
		let outerBindCalls = 0;
		let innerBindCalls = 0;

		class Outer extends SprinculModel {
			showOuter() {
				outerBindCalls++;
			}
		}
		class Inner extends SprinculModel {
			showInner() {
				innerBindCalls++;
			}
		}
		Sprincul.register("Inner", Inner);

		const el = document.createElement("div");
		el.innerHTML = html`<ul></ul>`;
		container.appendChild(el);

		const outer = Sprincul.mount(el, Outer) as InstanceType<typeof Outer>;
		const list = el.querySelector("ul")!;

		const plainLi = document.createElement("li");
		plainLi.setAttribute("data-bind-outer", "showOuter");
		list.appendChild(plainLi);

		const nestedLi = document.createElement("li");
		nestedLi.setAttribute("data-model", "Inner");
		nestedLi.innerHTML = html`<span data-bind-inner="showInner"></span>`;
		list.appendChild(nestedLi);

		outer.wire(list);

		// The plain item was bound by the outer model's wire() call
		expect(outerBindCalls).toBe(1);
		// Content appearing INSIDE the nested model root was not touched by the outer wire() call
		expect(innerBindCalls).toBe(0);

		// Only mounting the nested root separately binds its own content
		Sprincul.mount(nestedLi, Inner);
		expect(innerBindCalls).toBe(1);
	});

	test("calling wire() twice on the same content does not double-register its bindings", async () => {
		class ListModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			bump() {
				this.state.count++;
			}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<ul></ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel) as InstanceType<typeof ListModel>;
		const list = el.querySelector("ul")!;

		const li = document.createElement("li");
		li.setAttribute("onclick", "bump");
		list.appendChild(li);

		instance.wire(list);
		instance.wire(list); // re-wiring the same, already-bound content is a no-op

		li.click();
		await waitForDomUpdate();

		expect(instance.state.count).toBe(1);
	});

	test("wire() throws if called before the model's core is available", () => {
		const model = new SprinculModel(document.createElement("div"));
		expect(() => model.wire(document.createElement("span"))).toThrow(
			"[Sprincul] wire() called before core was available. Call it from beforeInit() or later instead.",
		);
	});
});
