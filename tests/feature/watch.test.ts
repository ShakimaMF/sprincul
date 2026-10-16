/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html, waitForDomUpdate } from "../helpers.ts";

/** Lets the watcher's MutationObserver run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountList(markup = html`<ul data-watch></ul>`) {
	const calls: string[] = [];

	class List extends SprinculModel {
		showQty(el: HTMLElement) {
			calls.push(`render:${el.dataset.label}`);
			el.textContent = String(this.state.qty ?? 1);
		}
		remove(el: HTMLElement) {
			calls.push(`remove:${el.closest("li")!.dataset.label}`);
		}
	}

	const root = document.createElement("div");
	root.innerHTML = markup;
	container.appendChild(root);
	const instance = Sprincul.mount(root, List) as InstanceType<typeof List>;
	return { root, instance, calls, list: root.querySelector<HTMLElement>("[data-watch]")! };
}

function row(label: string) {
	const li = document.createElement("li");
	li.dataset.label = label;
	li.innerHTML = html`<span data-label="${label}" data-bind-qty="showQty"></span
		><button data-on-click="remove">x</button>`;
	return li;
}

describe("Sprincul - data-watch", () => {
	test("content added to a watched element is bound without calling wire()", async () => {
		const { list, calls } = mountList();

		list.append(row("a"), row("b"));
		await settle();
		list.querySelector("button")!.click();

		expect(calls).toEqual(["render:a", "render:b", "remove:a"]);
		expect(list.querySelector("span")!.textContent).toBe("1");
	});

	test("content removed from a watched element is released", async () => {
		const { list, calls, instance } = mountList();
		const gone = row("a");
		list.append(gone);
		await settle();

		gone.remove();
		await settle();
		calls.length = 0;

		instance.state.qty = 2;
		await waitForDomUpdate();
		gone.querySelector("button")!.click();

		expect(calls).toEqual([]);
	});

	test("server-rendered content in a watched element is released once it's replaced", async () => {
		const { list, calls, instance } = mountList(
			html`<ul data-watch>
				<li data-label="server">
					<span data-label="server" data-bind-qty="showQty"></span><button data-on-click="remove">x</button>
				</li>
			</ul>`,
		);
		const server = list.querySelector("li")!;

		list.replaceChildren(row("client"));
		await settle();
		calls.length = 0;

		instance.state.qty = 2;
		await waitForDomUpdate();
		server.querySelector("button")!.click();

		expect(calls).toEqual(["render:client"]);
	});

	test("rows added anywhere inside the watched element are bound", async () => {
		const { root, calls } = mountList(
			html`<table data-watch>
				<tbody></tbody>
			</table>`,
		);

		const tr = document.createElement("tr");
		tr.dataset.label = "deep";
		tr.setAttribute("data-bind-qty", "showQty");
		root.querySelector("tbody")!.append(tr);
		await settle();

		expect(calls).toEqual(["render:deep"]);
	});

	test("only the watched element is watched", async () => {
		const { root, calls } = mountList(
			html`<ul data-watch></ul>
				<ol></ol>`,
		);

		root.querySelector("ol")!.append(row("elsewhere"));
		await settle();

		expect(calls).toEqual([]);
	});

	test("removing data-watch stops watching", async () => {
		const { list, calls } = mountList();
		list.removeAttribute("data-watch");

		list.append(row("a"));
		await settle();

		expect(calls).toEqual([]);
	});

	test("a data-watch container created later is watched without wiring it", async () => {
		const { root, calls } = mountList(html`<section></section>`);
		const list = document.createElement("ul");
		list.setAttribute("data-watch", "");
		root.querySelector("section")!.append(list);

		list.append(row("later"));
		await settle();

		expect(calls).toEqual(["render:later"]);
	});

	test("a row moved within the watched element keeps its binding and listener without re-rendering", async () => {
		const { list, calls } = mountList();
		list.append(row("a"), row("b"));
		await settle();
		calls.length = 0;

		list.append(list.firstElementChild!);
		await settle();
		list.lastElementChild!.querySelector("button")!.click();

		expect(calls).toEqual(["remove:a"]);
	});

	test("content added and removed again before the watcher runs is skipped", async () => {
		const { list, calls } = mountList();

		const brief = row("brief");
		list.append(brief);
		brief.remove();
		await settle();

		expect(calls).toEqual([]);
	});

	test("changes inside a nested model are left to that model", async () => {
		const { root, calls } = mountList(
			html`<ul data-watch>
				<li data-model="Inner"><p></p></li>
			</ul>`,
		);
		class Inner extends SprinculModel {}
		Sprincul.mount(root.querySelector<HTMLElement>('[data-model="Inner"]')!, Inner);

		const p = root.querySelector("p")!;
		p.innerHTML = html`<span data-label="inner" data-bind-qty="showQty"></span>`;
		await settle();

		expect(calls).toEqual([]);
	});

	test("rows added to a watched element inside another are handled once", async () => {
		const { root, calls } = mountList(html`<div data-watch><ul data-watch></ul></div>`);

		root.querySelector("ul")!.append(row("inner"));
		await settle();

		expect(calls).toEqual(["render:inner"]);
	});

	test("attribute changes aren't watched", async () => {
		const { list, calls } = mountList(
			html`<ul data-watch>
				<li data-label="a"><button>x</button></li>
			</ul>`,
		);

		list.querySelector("button")!.setAttribute("data-on-click", "remove");
		await settle();
		list.querySelector("button")!.click();

		expect(calls).toEqual([]);
	});

	test("a data-watch element outside any model does nothing", async () => {
		mountList();
		const stray = document.createElement("ul");
		stray.setAttribute("data-watch", "");
		document.body.appendChild(stray);

		stray.append(row("stray"));
		await settle();
		stray.remove();
	});

	test("data-watch on a model root warns in devMode", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const root = document.createElement("div");
			root.setAttribute("data-watch", "");
			container.appendChild(root);
			Sprincul.mount(root, class extends SprinculModel {}, { devMode: true });

			expect(warn).toHaveBeenCalledWith(
				"[Sprincul] data-watch on a model root watches the whole model; put it on the element whose contents change.",
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("unmounting stops watching", async () => {
		const { root, list, calls } = mountList();
		await Sprincul.unmount(root);

		list.append(row("a"));
		await settle();

		expect(calls).toEqual([]);
	});

	test("a nested model added to a watched element is left to its own model", async () => {
		const { list, calls } = mountList();

		const nested = document.createElement("li");
		nested.setAttribute("data-model", "Unregistered");
		nested.dataset.label = "nested";
		nested.setAttribute("data-bind-qty", "showQty");
		list.append(nested);
		await settle();

		expect(calls).toEqual([]);
	});
});
