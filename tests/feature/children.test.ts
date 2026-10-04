/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html, initInstances } from "../helpers.ts";

describe("Sprincul - Reaching nested and parent models", () => {
	function mountEditor() {
		class Editor extends SprinculModel {
			title = "Home page";
		}
		class Stack extends SprinculModel {
			isDirty = true;

			editorTitle() {
				return this.$parent<Editor>()?.title;
			}
		}
		Sprincul.registerAll({ Editor, Stack });

		container.innerHTML = html`<div data-model="Editor">
			<div data-model="Stack" data-ref="stack" data-zone="header"></div>
			<div data-model="Stack" data-ref="stack" data-zone="footer"></div>
			<span data-ref="plain"></span>
		</div>`;

		const instances = initInstances(container);
		const stacks = Array.from(container.querySelectorAll('[data-model="Stack"]'));
		return {
			editor: instances.get(container.querySelector('[data-model="Editor"]')!),
			stacks: stacks.map((element) => instances.get(element)),
			stackElements: stacks as HTMLElement[],
		};
	}

	test("$child and $children reach nested models through refs on their roots", () => {
		const { editor, stacks } = mountEditor();

		expect(editor.$child("stack")).toBe(stacks[0]);
		expect(editor.$child("stack").isDirty).toBe(true);
		expect(editor.$children("stack")).toEqual(stacks);
		// A ref with no model mounted on it isn't a child
		expect(editor.$child("plain")).toBeNull();
		expect(editor.$child("missing")).toBeNull();
	});

	test("an unmounted child is no longer returned", () => {
		const { editor, stacks, stackElements } = mountEditor();

		Sprincul.unmount(stackElements[0]);

		expect(editor.$child("stack")).toBeNull();
		expect(editor.$children("stack")).toEqual([stacks[1]]);
	});

	test("$parent reaches the model containing this one", () => {
		const { editor, stacks } = mountEditor();

		expect(stacks[0].$parent()).toBe(editor);
		expect(stacks[1].editorTitle()).toBe("Home page");
		expect(editor.$parent()).toBeNull();
	});

	test("$parent is null in a child's init hooks on the first init(), since children mount first", () => {
		let parentDuringInit: unknown = "unset";

		class Parent extends SprinculModel {}
		class Child extends SprinculModel {
			afterInit() {
				parentDuringInit = this.$parent();
			}
		}
		Sprincul.registerAll({ Parent, Child });
		container.innerHTML = html`<div data-model="Parent"><div data-model="Child"></div></div>`;

		initInstances(container);

		expect(parentDuringInit).toBeNull();
	});

	test("$child returns a child whose async beforeInit is still pending", async () => {
		let release!: () => void;
		let childFromParent: any;

		class Slow extends SprinculModel {
			ready = false;

			async beforeInit() {
				await new Promise<void>((resolve) => (release = resolve));
				this.ready = true;
			}
		}
		class Host extends SprinculModel {
			afterInit() {
				childFromParent = this.$child("slow");
			}
		}
		Sprincul.registerAll({ Host, Slow });
		container.innerHTML = html`<div data-model="Host"><div data-model="Slow" data-ref="slow"></div></div>`;

		initInstances(container);

		expect(childFromParent).not.toBeNull();
		expect(childFromParent.ready).toBe(false);
		release();
		await Promise.resolve();
		expect(childFromParent.ready).toBe(true);
	});

	test("$parent is null once the parent is unmounted", () => {
		const { editor, stacks } = mountEditor();

		Sprincul.unmount(editor.$el);

		expect(stacks[0].$parent()).toBeNull();
	});
});
