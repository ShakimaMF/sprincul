/// <reference lib="dom" />
import { expect, test, describe } from "bun:test";
import { html } from "../helpers.ts";

describe("Sprincul - Server-rendered defaults", () => {
	test("beforeInit receives text/html/input.value for server-rendered content", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<span data-bind-message="updateText">Hello from server</span>
				<div data-bind-note="updateNote"><b>Bold note</b></div>
				<input data-bind-name="updateName" value="Ada" />
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
				this.state.message = defaults.message?.text ?? "";
				this.state.note = defaults.note?.html ?? "";
				this.state.name = defaults.name?.input.value ?? "";
			}

			updateText(el: HTMLElement) {
				el.textContent = this.state.message;
			}

			updateNote(el: HTMLElement) {
				el.innerHTML = this.state.note;
			}

			updateName(el: HTMLInputElement) {
				el.value = this.state.name;
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		expect(receivedDefaults.message.text).toBe("Hello from server");
		expect(receivedDefaults.note.html).toBe("<b>Bold note</b>");
		expect(receivedDefaults.name.input.value).toBe("Ada");

		const span = container.querySelector("span");
		expect(span?.textContent).toBe("Hello from server");
	});

	test("first element bound to a property wins when duplicated", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<span data-bind-message="updateFirst">First</span>
				<span data-bind-message="updateSecond">Second</span>
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}

			updateFirst() {}

			updateSecond() {}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		expect(receivedDefaults.message.text).toBe("First");
	});

	test("nested [data-model] elements are excluded from the parent's defaults map", () => {
		container.innerHTML = html`
			<div data-model="OuterModel">
				<div data-model="InnerModel">
					<span data-bind-message="updateInner">Inner default</span>
				</div>
			</div>
		`;

		let outerDefaults: any;
		let innerDefaults: any;

		class OuterModel extends SprinculModel {
			beforeInit(defaults: any) {
				outerDefaults = defaults;
			}
		}

		class InnerModel extends SprinculModel {
			beforeInit(defaults: any) {
				innerDefaults = defaults;
			}

			updateInner() {}
		}

		Sprincul.register("OuterModel", OuterModel);
		Sprincul.register("InnerModel", InnerModel);
		Sprincul.init();

		expect(outerDefaults).toEqual({});
		expect(innerDefaults.message.text).toBe("Inner default");
	});

	test("beforeInit always receives a plain object, even with no data-bind-* elements to capture", () => {
		container.innerHTML = html`<div data-model="TestModel"><span>No bindings here</span></div>`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		expect(receivedDefaults).toEqual({});
	});

	test("captures checked state for checkboxes and radios, alongside their value attribute", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<input type="checkbox" data-bind-agree="updateAgree" value="yes" />
				<input type="checkbox" data-bind-subscribed="updateSubscribed" value="yes" checked />
				<input type="radio" name="plan" data-bind-plan="updatePlan" value="pro" checked />
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}

			updateAgree() {}
			updateSubscribed() {}
			updatePlan() {}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		// An unchecked checkbox: value attribute is captured, checked is false
		expect(receivedDefaults.agree.input.value).toBe("yes");
		expect(receivedDefaults.agree.input.checked).toBe(false);

		// A checked checkbox: both value and checked are captured
		expect(receivedDefaults.subscribed.input.value).toBe("yes");
		expect(receivedDefaults.subscribed.input.checked).toBe(true);

		// A checked radio behaves the same way as a checkbox
		expect(receivedDefaults.plan.input.value).toBe("pro");
		expect(receivedDefaults.plan.input.checked).toBe(true);
	});

	test("captures input.value as-is for a single select; checked and selectedValues are undefined for non-checkable/non-multi elements", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<select data-bind-color="updateColor">
					<option value="red">Red</option>
					<option value="blue" selected>Blue</option>
				</select>
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}

			updateColor() {}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		// A select's value is the selected option's value; checked/selectedValues don't apply
		expect(receivedDefaults.color.input.value).toBe("blue");
		expect(receivedDefaults.color.input.checked).toBeUndefined();
		expect(receivedDefaults.color.input.selectedValues).toBeUndefined();
	});

	test("captures selectedValues for a multi-select, in addition to the (single, lossy) value", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<select data-bind-tags="updateTags" multiple>
					<option value="red" selected>Red</option>
					<option value="green">Green</option>
					<option value="blue" selected>Blue</option>
				</select>
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}

			updateTags() {}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		expect(receivedDefaults.tags.input.selectedValues).toEqual(["red", "blue"]);
		// .value on a multi-select only ever reflects the first selected option
		expect(receivedDefaults.tags.input.value).toBe("red");
	});

	test("an element with no server-rendered content still gets a full input/text/html entry", () => {
		container.innerHTML = html`
			<div data-model="TestModel">
				<span data-bind-message="updateText"></span>
			</div>
		`;

		let receivedDefaults: any;

		class TestModel extends SprinculModel {
			beforeInit(defaults: any) {
				receivedDefaults = defaults;
			}

			updateText() {}
		}

		Sprincul.register("TestModel", TestModel);
		Sprincul.init();

		expect(receivedDefaults.message).toEqual({
			input: { value: undefined, checked: undefined, selectedValues: undefined },
			text: "",
			html: "",
		});
	});
});
