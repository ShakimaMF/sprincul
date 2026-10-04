/// <reference lib="dom" />
import { Sprincul, SprinculModel } from "../src/index.ts";

/** Runs in the browser page served by run.ts. */

/** Times are Sprincul's own work; `withLayout` is the median including the browser's layout of what it changed. */
export type Result = {
	name: string;
	samples: number;
	median: number;
	p95: number;
	min: number;
	withLayout: number;
	error?: string;
};
export type MemoryResult = {
	models: number;
	cycles: number;
	bytesPerModel: number;
	retainedAfterUnmount: number;
	growthPerCycle: number;
	error?: string;
};

type Scenario<C> = {
	name: string;
	samples: number;
	setup?: () => C | Promise<C>;
	/** Measures one sample with the timed helpers; anything outside them is untimed. */
	sample: (context: C) => Timing | Promise<Timing>;
	teardown?: (context: C) => void | Promise<void>;
};

declare global {
	interface Window {
		__report(result: Result): Promise<void>;
		__heapUsed(): Promise<number>;
		runBenchmarks(filter?: string): Promise<{ results: Result[]; memory?: MemoryResult }>;
	}
}

/** Bench models record themselves, since Sprincul hands out instances only with devMode, which adds dev-only checks. */
const instances = new WeakMap<Element, SprinculModel>();

class Tracked extends SprinculModel {
	constructor(element: HTMLElement) {
		super(element);
		instances.set(element, this);
	}
}

class Row extends Tracked {
	beforeInit() {
		this.state.count = 0;
		this.state.label = "row";
	}

	showCount(el: HTMLElement) {
		el.textContent = String(this.state.count);
	}

	showLabel(el: HTMLElement) {
		el.textContent = this.state.label;
	}

	increment() {
		this.state.count++;
	}
}

class Cart extends Tracked {
	beforeInit() {
		this.state.price = 1;
		this.state.qty = 1;
		this.addComputedProp("subtotal", () => this.state.price * this.state.qty, ["price", "qty"]);
		this.addComputedProp("total", () => this.state.price * this.state.qty * 2, ["price", "qty"]);
	}

	showSubtotal(el: HTMLElement) {
		el.textContent = String(this.state.subtotal);
	}

	showTotal(el: HTMLElement) {
		el.textContent = String(this.state.total);
	}
}

class Themed extends Tracked {
	afterInit() {
		Sprincul.store.subscribe("theme", (theme) => (this.state.theme = theme), { signal: this.$signal });
	}

	showTheme(el: HTMLElement) {
		el.textContent = this.state.theme ?? "";
	}
}

class List extends Tracked {
	beforeInit() {
		this.state.count = 0;
	}

	showCount(el: HTMLElement) {
		el.textContent = String(this.state.count);
	}

	increment() {
		this.state.count++;
	}
}

class Parent extends Tracked {
	received = 0;

	afterInit() {
		this.$listen("ping", () => this.received++);
	}
}

class Child extends Tracked {
	ping() {
		this.$emit("ping");
	}
}

const rowMarkup = (children = "") =>
	`<div data-model="Row"><span data-bind-count="showCount"></span><span data-bind-label="showLabel"></span>` +
	`<button onclick="increment">+</button>${children}</div>`;
const rows = (count: number) => rowMarkup().repeat(count);

/** Forces style recalculation and layout of what the timed step changed. */
const layout = () => document.body.getBoundingClientRect();
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/*
 * Sprincul's own work (its JS and the DOM calls it makes) is timed apart from the browser's layout afterward,
 * which depends on the page and the browser's state more than on Sprincul.
 */
type Timing = { sprincul: number; layout: number };

function timeLayout(): number {
	const start = performance.now();
	layout();
	return performance.now() - start;
}

function timeSync(work: () => void): Timing {
	const start = performance.now();
	work();
	const sprincul = performance.now() - start;
	return { sprincul, layout: timeLayout() };
}

/*
 * Times state writes plus Sprincul's next-frame flush, excluding the idle wait for that frame.
 * Frame callbacks run in request order, so the first marks the frame's start before Sprincul's
 * flush and the last runs right after it.
 */
function timeFlush(write: () => void): Promise<Timing> {
	return new Promise((resolve) => {
		let frameStart = 0;
		requestAnimationFrame(() => (frameStart = performance.now()));

		const writeStart = performance.now();
		write();
		const writing = performance.now() - writeStart;

		requestAnimationFrame(() => {
			const sprincul = writing + performance.now() - frameStart;
			resolve({ sprincul, layout: timeLayout() });
		});
	});
}

/** Setup helpers settle layout before returning, so a timed step never pays for setup's DOM work. */
function attach(markup: string): HTMLElement {
	const root = document.createElement("div");
	root.innerHTML = markup;
	document.body.append(root);
	layout();
	return root;
}

function mounted(markup: string): HTMLElement {
	const root = attach(markup);
	Sprincul.init({ root });
	layout();
	return root;
}

async function release(root: HTMLElement) {
	await Sprincul.unmount(root);
	root.remove();
}

function modelsIn<T extends SprinculModel>(root: HTMLElement, selector: string): T[] {
	return Array.from(root.querySelectorAll(selector), (element) => instances.get(element) as T);
}

function expectAll(root: HTMLElement, selector: string, expected: string) {
	const elements = Array.from(root.querySelectorAll(selector));
	if (elements.length === 0) throw new Error(`No elements match ${selector}`);

	const wrong = elements.find((element) => element.textContent !== expected);
	if (wrong) throw new Error(`${selector}: expected "${expected}", got "${wrong.textContent}"`);
}

function expectEqual(actual: unknown, expected: unknown, what: string) {
	if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

const scenario = <C>(definition: Scenario<C>) => definition as Scenario<unknown>;

/** Times one way of tearing down 1,000 mounted rows, checking it tore down exactly the `expected` ones. */
const teardown = (
	name: string,
	run: (root: HTMLElement, models: Row[]) => unknown,
	expected = (models: Row[]) => models,
) =>
	scenario({
		name,
		samples: 20,
		sample: async () => {
			const root = mounted(rows(1000));
			const models = modelsIn<Row>(root, "[data-model]");
			const timing = timeSync(() => void run(root, models));
			const torn = new Set(expected(models));
			const wrong = models.filter((model) => model.$signal.aborted !== torn.has(model)).length;
			expectEqual(wrong, 0, "models torn down incorrectly");
			await release(root);
			return timing;
		},
	});

const scenarios = [
	scenario({
		name: "init: 100 rows",
		samples: 50,
		sample: async () => {
			const root = attach(rows(100));
			const timing = timeSync(() => Sprincul.init({ root }));
			expectAll(root, "[data-bind-count]", "0");
			await release(root);
			return timing;
		},
	}),
	scenario({
		name: "init: 1,000 rows",
		samples: 20,
		sample: async () => {
			const root = attach(rows(1000));
			const timing = timeSync(() => Sprincul.init({ root }));
			expectAll(root, "[data-bind-count]", "0");
			await release(root);
			return timing;
		},
	}),
	scenario({
		name: "init: 10 rows with 100 nested rows each",
		samples: 20,
		sample: async () => {
			const root = attach(rowMarkup(rows(100)).repeat(10));
			const timing = timeSync(() => Sprincul.init({ root }));
			expectAll(root, "[data-bind-count]", "0");
			await release(root);
			return timing;
		},
	}),
	teardown(
		"unmount: 1 of 1,000 rows",
		(_, models) => Sprincul.unmount(models[500]!.$el),
		(models) => [models[500]!],
	),
	teardown("unmount: subtree of 1,000 rows", (root) => Sprincul.unmount(root)),
	teardown("destroy: 1,000 rows by name", () => Sprincul.destroy("Row")),
	teardown("destroyAll: 1,000 rows", () => Sprincul.destroyAll()),
	scenario({
		name: "update: 1 of 1,000 rows",
		samples: 100,
		setup: () => {
			const root = mounted(rows(1000));
			return { root, models: modelsIn<Row>(root, "[data-model]") };
		},
		sample: async ({ models }) => {
			const model = models[Math.floor(Math.random() * models.length)]!;
			const next = model.state.count + 1;
			const timing = await timeFlush(() => (model.state.count = next));
			expectEqual(model.$el.querySelector("[data-bind-count]")!.textContent, String(next), "row text");
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "update: all 1,000 rows",
		samples: 30,
		setup: () => {
			const root = mounted(rows(1000));
			return { root, models: modelsIn<Row>(root, "[data-model]"), count: 0 };
		},
		sample: async (context) => {
			const next = ++context.count;
			const timing = await timeFlush(() => context.models.forEach((model) => (model.state.count = next)));
			expectAll(context.root, "[data-bind-count]", String(next));
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "update: 10 writes to 1 row in 1 frame",
		samples: 100,
		setup: () => {
			const root = mounted(rows(1));
			return { root, model: modelsIn<Row>(root, "[data-model]")[0]! };
		},
		sample: async ({ root, model }) => {
			const timing = await timeFlush(() => {
				for (let i = 0; i < 10; i++) model.state.count++;
			});
			expectAll(root, "[data-bind-count]", String(model.state.count));
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "event: click to render, 1 of 1,000 rows",
		samples: 100,
		setup: () => {
			const root = mounted(rows(1000));
			return { root, buttons: Array.from(root.querySelectorAll("button")) };
		},
		sample: async ({ buttons }) => {
			const button = buttons[Math.floor(Math.random() * buttons.length)]!;
			const span = button.parentElement!.querySelector("[data-bind-count]")!;
			const next = String(Number(span.textContent) + 1);
			const timing = await timeFlush(() => button.click());
			expectEqual(span.textContent, next, "clicked row text");
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "computed: 100 carts, 2 deps, 2 computed props",
		samples: 50,
		setup: () => {
			const cart = `<div data-model="Cart"><b data-bind-subtotal="showSubtotal"></b><b data-bind-total="showTotal"></b></div>`;
			const root = mounted(cart.repeat(100));
			return { root, models: modelsIn<Cart>(root, "[data-model]"), price: 1 };
		},
		sample: async (context) => {
			const price = ++context.price;
			const timing = await timeFlush(() =>
				context.models.forEach((model) => {
					model.state.price = price;
					model.state.qty = 3;
				}),
			);
			expectAll(context.root, "[data-bind-subtotal]", String(price * 3));
			expectAll(context.root, "[data-bind-total]", String(price * 6));
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "store: 1 key set, 1,000 subscribed models",
		samples: 30,
		setup: () => ({
			root: mounted(`<div data-model="Themed"><i data-bind-theme="showTheme"></i></div>`.repeat(1000)),
			round: 0,
		}),
		sample: async (context) => {
			const theme = `theme-${++context.round}`;
			const timing = await timeFlush(() => Sprincul.store.set("theme", theme));
			expectAll(context.root, "[data-bind-theme]", theme);
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "wire: 100 bound elements into a live model",
		samples: 50,
		setup: () => {
			const root = mounted(`<div data-model="List"><ul></ul></div>`);
			return { root, model: modelsIn<List>(root, "[data-model]")[0]!, list: root.querySelector("ul")! };
		},
		sample: ({ root, model, list }) => {
			const items = Array.from({ length: 100 }, () => {
				const li = document.createElement("li");
				li.setAttribute("data-bind-count", "showCount");
				li.setAttribute("onclick", "increment");
				return li;
			});
			const timing = timeSync(() => {
				list.append(...items);
				model.wire(list);
			});
			expectAll(root, "li", String(model.state.count));
			model.unwire(list);
			list.replaceChildren();
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
	scenario({
		name: "events: 1,000 $emit to a $listen parent",
		samples: 50,
		setup: () => {
			const root = mounted(`<div data-model="Parent"><div data-model="Child"></div></div>`);
			return {
				root,
				parent: modelsIn<Parent>(root, '[data-model="Parent"]')[0]!,
				child: modelsIn<Child>(root, '[data-model="Child"]')[0]!,
			};
		},
		sample: ({ parent, child }) => {
			const before = parent.received;
			const timing = timeSync(() => {
				for (let i = 0; i < 1000; i++) child.ping();
			});
			expectEqual(parent.received - before, 1000, "events received");
			return timing;
		},
		teardown: ({ root }) => release(root),
	}),
];

async function run(definition: Scenario<unknown>): Promise<Result> {
	const context = await definition.setup?.();
	const durations: number[] = [];
	const totals: number[] = [];
	try {
		const warmup = Math.min(5, definition.samples);
		for (let i = 0; i < warmup + definition.samples; i++) {
			const timing = await definition.sample(context);
			if (i >= warmup) {
				durations.push(timing.sprincul);
				totals.push(timing.sprincul + timing.layout);
			}
			await nextFrame();
		}
	} finally {
		await definition.teardown?.(context);
	}

	const at = (values: number[], quantile: number) =>
		values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(quantile * values.length))]!;
	return {
		name: definition.name,
		samples: durations.length,
		median: at(durations, 0.5),
		p95: at(durations, 0.95),
		min: at(durations, 0),
		withLayout: at(totals, 0.5),
	};
}

/*
 * Heap cost of mounting, measured against the same markup (with its JS wrappers) before init(), so only
 * Sprincul's own allocations count. Warmup cycles first let one-time costs (compiled code, collections
 * growing to size) settle. Retained memory that keeps growing across the measured cycles is a leak.
 */
async function measureMemory(models: number, cycles: number): Promise<MemoryResult> {
	const root = attach(rows(models));
	const elements = Array.from(root.querySelectorAll("*"));
	const unmount = async () => {
		await Sprincul.unmount(root);
		// The bench's own tracking would otherwise keep every model alive with its element
		elements.forEach((element) => instances.delete(element));
	};
	const cycle = async () => {
		Sprincul.init({ root });
		await unmount();
	};

	for (let i = 0; i < cycles; i++) await cycle();
	const baseline = await window.__heapUsed();

	Sprincul.init({ root });
	const mountedHeap = await window.__heapUsed();
	await unmount();
	const unmountedHeap = await window.__heapUsed();

	for (let i = 0; i < cycles; i++) await cycle();
	const finalHeap = await window.__heapUsed();
	root.remove();

	return {
		models,
		cycles,
		bytesPerModel: (mountedHeap - baseline) / models,
		retainedAfterUnmount: unmountedHeap - baseline,
		growthPerCycle: (finalHeap - unmountedHeap) / cycles,
	};
}

window.runBenchmarks = async (filter) => {
	Sprincul.registerAll({ Row, Cart, Themed, List, Parent, Child });

	const results: Result[] = [];
	for (const definition of scenarios) {
		if (filter && !definition.name.includes(filter)) continue;

		let result: Result;
		try {
			result = await run(definition);
		} catch (error) {
			result = {
				name: definition.name,
				samples: 0,
				median: 0,
				p95: 0,
				min: 0,
				withLayout: 0,
				error: String(error),
			};
		}
		results.push(result);
		await window.__report(result);
	}

	if (filter && !"memory".includes(filter)) return { results };

	try {
		return { results, memory: await measureMemory(1000, 10) };
	} catch (error) {
		return {
			results,
			memory: {
				models: 1000,
				cycles: 10,
				bytesPerModel: 0,
				retainedAfterUnmount: 0,
				growthPerCycle: 0,
				error: String(error),
			},
		};
	}
};
