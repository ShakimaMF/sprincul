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

	test("re-wiring an already-bound data-bind-* element does not re-invoke its callback or recurse", async () => {
		class ListModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			renderCount = 0;
			showCount(el: HTMLElement) {
				this.renderCount++;
				el.textContent = String(this.state.count);
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel) as InstanceType<typeof ListModel>;

		const span = document.createElement("span");
		span.setAttribute("data-bind-count", "showCount");
		el.appendChild(span);

		instance.wire(span);
		expect(instance.renderCount).toBe(1);

		// Re-wiring an already-bound element must not re-invoke the callback (it could recurse)
		instance.wire(span);
		expect(instance.renderCount).toBe(1);
	});

	test("unwire() detaches on* listeners so removed content stops receiving events and doesn't leak", async () => {
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
		instance.wire(li);

		instance.unwire(li);
		li.remove();

		li.click();
		await waitForDomUpdate();

		expect(instance.state.count).toBe(0);
	});

	test("unwire() releases data-bind-* callbacks for a subtree, and re-wiring a replacement is unaffected", async () => {
		class RepeaterModel extends SprinculModel {
			beforeInit() {
				this.state.value = "first";
			}
			renderCalls: HTMLElement[] = [];
			showValue(el: HTMLElement) {
				this.renderCalls.push(el);
				el.textContent = this.state.value;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		const instance = Sprincul.mount(el, RepeaterModel) as InstanceType<typeof RepeaterModel>;

		// The documented repeater pattern: release the old row, discard it, wire the replacement
		const rowV1 = document.createElement("span");
		rowV1.setAttribute("data-bind-value", "showValue");
		el.appendChild(rowV1);
		instance.wire(rowV1);

		instance.unwire(rowV1);
		rowV1.remove();

		const rowV2 = document.createElement("span");
		rowV2.setAttribute("data-bind-value", "showValue");
		el.appendChild(rowV2);
		instance.wire(rowV2);

		instance.state.value = "second";
		await waitForDomUpdate();

		// The released row keeps its last render; only the live replacement updates
		expect(rowV1.textContent).toBe("first");
		expect(rowV2.textContent).toBe("second");
		// rowV1 was rendered once on wire(); rowV2 was rendered on wire() and again on the state change
		expect(instance.renderCalls).toHaveLength(3);
		expect(instance.renderCalls[0]).toBe(rowV1);
		expect(instance.renderCalls[1]).toBe(rowV2);
		expect(instance.renderCalls[2]).toBe(rowV2);
	});

	test("unwire() also releases descendants of the released element, not just the element itself", async () => {
		class ListModel extends SprinculModel {
			beforeInit() {
				this.state.count = 0;
			}
			bump() {
				this.state.count++;
			}
		}

		const el = document.createElement("div");
		container.appendChild(el);

		const instance = Sprincul.mount(el, ListModel) as InstanceType<typeof ListModel>;

		const wrapper = document.createElement("div");
		const child = document.createElement("button");
		child.setAttribute("onclick", "bump");
		wrapper.appendChild(child);
		el.appendChild(wrapper);
		instance.wire(wrapper);

		instance.unwire(wrapper);
		wrapper.remove();

		child.click();
		await waitForDomUpdate();

		expect(instance.state.count).toBe(0);
	});

	test("a bound container can unwire and re-wire itself from inside its own callback", async () => {
		let renders = 0;

		class RepeaterModel extends SprinculModel {
			beforeInit() {
				this.state.rows = "first";
			}
			renderRows(listEl: HTMLElement) {
				renders++;
				// The container handed to the callback is itself bound, and gets rebuilt in place
				this.unwire(listEl);
				listEl.innerHTML = "";

				const row = document.createElement("li");
				row.setAttribute("onclick", "pickRow");
				row.textContent = String(this.state.rows);
				listEl.appendChild(row);

				this.wire(listEl);
			}
			pickRow() {}
		}

		const el = document.createElement("div");
		el.innerHTML = html`<ul data-bind-rows="renderRows"></ul>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, RepeaterModel) as InstanceType<typeof RepeaterModel>;
		await waitForDomUpdate();
		expect(renders).toBe(1);

		// The container's own binding survived its own unwire(), so it still re-renders
		instance.state.rows = "second";
		await waitForDomUpdate();
		expect(renders).toBe(2);
		expect(el.querySelector("li")!.textContent).toBe("second");
	});

	test("unwire() releases what wire() registered but leaves server-rendered bindings alone", async () => {
		let scanned = 0;
		let wired = 0;

		class MixedModel extends SprinculModel {
			beforeInit() {
				this.state.value = 0;
			}
			showScanned() {
				scanned++;
			}
			showWired() {
				wired++;
			}
		}

		const el = document.createElement("div");
		// present at mount, so this binding comes from the initial scan
		el.innerHTML = html`<span data-bind-value="showScanned"></span>`;
		container.appendChild(el);

		const instance = Sprincul.mount(el, MixedModel) as InstanceType<typeof MixedModel>;
		const scannedEl = el.querySelector("span") as HTMLElement;

		// added afterwards, so this binding comes from wire()
		const wiredEl = document.createElement("span");
		wiredEl.setAttribute("data-bind-value", "showWired");
		el.appendChild(wiredEl);
		instance.wire(wiredEl);
		await waitForDomUpdate();

		instance.unwire(el);

		scanned = 0;
		wired = 0;
		instance.state.value = 1;
		await waitForDomUpdate();

		expect(scanned).toBe(1);
		expect(wired).toBe(0);
		// the scan-registered element is untouched and still in the DOM
		expect(scannedEl.isConnected).toBe(true);
	});

	test("unwire() throws if called before the model's core is available", () => {
		const model = new SprinculModel(document.createElement("div"));
		expect(() => model.unwire(document.createElement("span"))).toThrow(
			"[Sprincul] unwire() called before core was available. Call it from beforeInit() or later instead.",
		);
	});

	test("wire() dedupe cost stays linear in the number of bindings", () => {
		class TableModel extends SprinculModel {
			beforeInit() {
				this.state.qty = 0;
			}
			showQty(el: HTMLElement) {}
		}

		// Count how many records the dedupe scan iterates. A per-property scan walks every binding
		// sharing that property, so wiring N of them costs ~N^2 steps; an element-keyed index only
		// walks the bindings already on that one element.
		let steps = 0;
		const originalIterator = Set.prototype[Symbol.iterator];
		Set.prototype[Symbol.iterator] = function <T>(this: Set<T>) {
			const inner = originalIterator.call(this) as IterableIterator<T>;
			return {
				[Symbol.iterator]() {
					return this;
				},
				next() {
					const result = inner.next();
					if (!result.done) steps++;
					return result;
				},
			} as IterableIterator<T>;
		};

		const wireRows = (rows: number) => {
			const el = document.createElement("div");
			el.innerHTML = html`<table>
				<tbody></tbody>
			</table>`;
			container.appendChild(el);

			const instance = Sprincul.mount(el, TableModel) as InstanceType<typeof TableModel>;
			const body = el.querySelector("tbody")!;

			for (let row = 0; row < rows; row++) {
				const tr = document.createElement("tr");
				for (let field = 0; field < 3; field++) {
					const td = document.createElement("td");
					// every cell binds the SAME prop: the worst case for a per-prop dedupe scan
					td.setAttribute("data-bind-qty", "showQty");
					tr.appendChild(td);
				}
				body.appendChild(tr);
			}

			steps = 0;
			instance.wire(body);
			const walked = steps;

			Sprincul.unmount(el);
			el.remove();
			return walked;
		};

		try {
			const small = wireRows(100);
			const large = wireRows(400);

			// 4x the bindings should cost ~4x the steps; a quadratic scan costs ~16x.
			expect(large).toBeLessThan(Math.max(small, 1) * 8);
		} finally {
			Set.prototype[Symbol.iterator] = originalIterator;
		}
	});

	test("wire() throws if called before the model's core is available", () => {
		const model = new SprinculModel(document.createElement("div"));
		expect(() => model.wire(document.createElement("span"))).toThrow(
			"[Sprincul] wire() called before core was available. Call it from beforeInit() or later instead.",
		);
	});
});
