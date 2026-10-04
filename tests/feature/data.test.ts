/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";

function mountWith(attributes: Record<string, string>, devMode = false) {
	const el = document.createElement("div");
	Object.entries(attributes).forEach(([name, value]) => el.setAttribute(name, value));
	container.appendChild(el);

	return Sprincul.mount(el, class Config extends SprinculModel {}, { devMode });
}

describe("Sprincul - $data", () => {
	test("reads each type by its fallback", () => {
		const instance = mountWith({
			"data-fields": '["title","body"]',
			"data-properties": '{"color":"red"}',
			"data-grouping": '"by-date"',
			"data-max": "12",
			"data-open": "",
			"data-closed": "false",
			"data-label": "Save",
		});

		expect(instance.$data("fields", [])).toEqual(["title", "body"]);
		expect(instance.$data("properties", {})).toEqual({ color: "red" });
		expect(instance.$data("grouping", null)).toBe("by-date");
		expect(instance.$data("max", 0)).toBe(12);
		expect(instance.$data("open", false)).toBe(true);
		expect(instance.$data("closed", true)).toBe(false);
		expect(instance.$data("label", "")).toBe("Save");
	});

	test("a missing attribute gives the fallback", () => {
		const instance = mountWith({});

		expect(instance.$data("fields", [])).toEqual([]);
		expect(instance.$data("grouping", null)).toBeNull();
		expect(instance.$data("max", 5)).toBe(5);
	});

	test("reads camelCase dataset names", () => {
		const instance = mountWith({ "data-max-size": "2048" });

		expect(instance.$data("maxSize", 0)).toBe(2048);
	});

	test("a malformed value gives the fallback without throwing, and warns in devMode", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const instance = mountWith(
			{
				"data-fields": "[oops",
				"data-shape": "[1,2]",
				"data-max-size": "big",
				"data-empty": "",
				"data-flag": "yes",
			},
			true,
		);

		expect(instance.$data("fields", [])).toEqual([]);
		expect(instance.$data("shape", {})).toEqual({});
		expect(instance.$data("maxSize", 0)).toBe(0);
		expect(instance.$data("empty", 3)).toBe(3);
		expect(instance.$data("flag", false)).toBe(false);

		expect(warnSpy).toHaveBeenCalledTimes(5);
		expect(warnSpy).toHaveBeenCalledWith(
			'[Sprincul] data-max-size="big" on model "Config" can\'t be read like its fallback; using the fallback.',
		);

		warnSpy.mockRestore();
	});
});
