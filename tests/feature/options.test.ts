/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { html } from "../helpers.ts";

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("Sprincul - setOption()", () => {
	test("sets a page-wide default that init() uses", () => {
		class Modern extends SprinculModel {}
		Sprincul.register("Modern", Modern);
		container.innerHTML = html`<div data-model="Modern"></div>`;

		let models: { instance?: unknown }[] = [];
		Sprincul.setOption("devMode", true);
		Sprincul.init({ onReady: (ready: typeof models) => (models = ready) });

		expect(models[0]!.instance).toBeInstanceOf(Modern);
	});

	test("reaches custom elements, which mount without init()", async () => {
		Sprincul.setOption("devMode", true);

		class Widget extends SprinculModel {
			static options = { customElement: "widget-element" };
		}
		Sprincul.register("Widget", Widget);
		container.innerHTML = html`<widget-element></widget-element>`;
		await tick();

		expect((container.querySelector("widget-element") as any).model).toBeInstanceOf(Widget);
	});

	test("a model's static options and a call's options override it, in that order", () => {
		class Quiet extends SprinculModel {
			static options = { devMode: false };
		}
		Sprincul.register("Quiet", Quiet);
		container.innerHTML = html`<div data-model="Quiet"></div>
			<div id="by-call"></div>`;

		let byClass: { instance?: unknown }[] = [];
		let byCall: { instance?: unknown } = {};
		Sprincul.setOption("devMode", true);
		Sprincul.init({ root: container, onReady: (ready: typeof byClass) => (byClass = ready) });
		Sprincul.mount(container.querySelector<HTMLElement>("#by-call")!, Quiet, {
			devMode: true,
			onReady: (info: typeof byCall) => (byCall = info),
		});

		expect(byClass[0]!.instance).toBeUndefined();
		expect(byCall.instance).toBeInstanceOf(Quiet);
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
		Sprincul.setOption("processNativeEvents", false);

		expect(warn).toHaveBeenCalledWith('[Sprincul] setOption() was given an unknown option "processNativeEvents".');
		warn.mockRestore();
	});
});
