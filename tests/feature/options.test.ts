/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html } from "../helpers.ts";

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("Sprincul - setOption()", () => {
	test("sets a page-wide default that init() uses", () => {
		class Modern extends SprinculModel {
			save() {}
		}
		Sprincul.register("Modern", Modern);
		container.innerHTML = html`<div data-model="Modern"><button onclick="save"></button></div>`;

		Sprincul.setOption("processNativeEvents", false);
		Sprincul.init();

		expect(container.querySelector("button")!.getAttribute("onclick")).toBe("save");
	});

	test("reaches custom elements, which mount without init()", async () => {
		Sprincul.setOption("processNativeEvents", false);

		class Widget extends SprinculModel {
			static options = { customElement: "widget-element" };

			save() {}
		}
		Sprincul.register("Widget", Widget);
		container.innerHTML = html`<widget-element><button onclick="save"></button></widget-element>`;
		await tick();

		expect(container.querySelector("button")!.getAttribute("onclick")).toBe("save");
	});

	test("a model's static options and a call's options override it, in that order", () => {
		class Legacy extends SprinculModel {
			static options = { processNativeEvents: true };

			save() {}
		}
		Sprincul.register("Legacy", Legacy);
		container.innerHTML = html`
			<div data-model="Legacy"><button id="by-class" onclick="save"></button></div>
			<div id="by-call"><button onclick="save"></button></div>
		`;

		Sprincul.setOption("processNativeEvents", false);
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		Sprincul.init({ root: container });
		Sprincul.mount(container.querySelector<HTMLElement>("#by-call")!, Legacy, { processNativeEvents: false });
		warn.mockRestore();

		expect(container.querySelector("#by-class")!.hasAttribute("onclick")).toBe(false);
		expect(container.querySelector("#by-call button")!.hasAttribute("onclick")).toBe(true);
	});

	test("devMode set after a custom element is defined still exposes its instance", async () => {
		class Widget extends SprinculModel {
			static options = { customElement: "debug-widget" };
		}
		Sprincul.register("Widget", Widget);
		container.innerHTML = html`<debug-widget></debug-widget>`;
		await tick();

		Sprincul.setOption("devMode", true);

		expect((container.querySelector("debug-widget") as any).model).toBeInstanceOf(Widget);
	});

	test("mount()'s own devMode overrides the model's static options", () => {
		class Debugged extends SprinculModel {
			static options = { devMode: true };
		}
		Sprincul.register("Debugged", Debugged);
		container.innerHTML = html`<div id="by-class"></div>
			<div id="by-call"></div>`;

		let byClass: { instance?: unknown } = {};
		let byCall: { instance?: unknown } = {};
		Sprincul.mount(container.querySelector<HTMLElement>("#by-class")!, Debugged, {
			onReady: (info: typeof byClass) => (byClass = info),
		});
		Sprincul.mount(container.querySelector<HTMLElement>("#by-call")!, Debugged, {
			devMode: false,
			onReady: (info: typeof byCall) => (byCall = info),
		});

		expect(byClass.instance).toBeInstanceOf(Debugged);
		expect(byCall.instance).toBeUndefined();
	});

	test("a model's static devMode includes its instance in onReady payloads", () => {
		class Debugged extends SprinculModel {
			static options = { devMode: true };
		}
		class Plain extends SprinculModel {}
		Sprincul.registerAll({ Debugged, Plain });
		container.innerHTML = html`<div data-model="Debugged"></div>
			<div data-model="Plain"></div>`;

		let models: { name: string; instance?: unknown }[] = [];
		Sprincul.init({ root: container, onReady: (ready: typeof models) => (models = ready) });

		expect(models.map(({ name, instance }) => [name, instance !== undefined])).toEqual([
			["Debugged", true],
			["Plain", false],
		]);
	});

	test("warns about an unknown option and ignores it", () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		Sprincul.setOption("keepDataOn", false);

		expect(warn).toHaveBeenCalledWith('[Sprincul] setOption() was given an unknown option "keepDataOn".');
		warn.mockRestore();
	});
});
