/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html } from "../helpers.ts";

describe("Sprincul - Reaching nested models", () => {
	function mountEditor() {
		class Editor extends SprinculModel {}
		class Stack extends SprinculModel {
			isDirty = true;
		}
		Sprincul.registerAll({ Editor, Stack });

		container.innerHTML = html`<div data-model="Editor">
			<div data-model="Stack" data-ref="stack" data-zone="header"></div>
			<div data-model="Stack" data-ref="stack" data-zone="footer"></div>
			<span data-ref="plain"></span>
		</div>`;
		Sprincul.init({ root: container });

		const editorEl = container.querySelector('[data-model="Editor"]') as HTMLElement;
		return { editor: Sprincul.instanceFor(editorEl), stacks: container.querySelectorAll('[data-model="Stack"]') };
	}

	test("instanceFor returns the model mounted on an element, or null", () => {
		const { editor, stacks } = mountEditor();

		expect(editor).not.toBeNull();
		expect(Sprincul.instanceFor(stacks[0]).isDirty).toBe(true);
		expect(Sprincul.instanceFor(container)).toBeNull();
		expect(Sprincul.instanceFor(null)).toBeNull();
	});

	test("$child and $children reach nested models through refs on their roots", () => {
		const { editor, stacks } = mountEditor();

		expect(editor.$child("stack")).toBe(Sprincul.instanceFor(stacks[0]));
		expect(editor.$children("stack").map((stack: any) => stack.$el.dataset.zone)).toEqual(["header", "footer"]);
		// A ref with no model mounted on it isn't a child
		expect(editor.$child("plain")).toBeNull();
		expect(editor.$child("missing")).toBeNull();
	});

	test("an unmounted child is no longer returned", () => {
		const { editor, stacks } = mountEditor();

		Sprincul.unmount(stacks[0] as HTMLElement);

		expect(Sprincul.instanceFor(stacks[0])).toBeNull();
		expect(editor.$child("stack")).toBeNull();
		expect(editor.$children("stack").map((stack: any) => stack.$el.dataset.zone)).toEqual(["footer"]);
	});
});
