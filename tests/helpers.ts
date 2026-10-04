// noinspection ES6ConvertVarToLetConst

import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

import type * as Api from "../src/index.ts";

type IsolatedApi = { Sprincul: any; SprinculModel: typeof Api.SprinculModel; cleanup: () => void };

declare global {
	var Sprincul: any;
	var SprinculModel: typeof Api.SprinculModel;
	var container: HTMLElement;
}

let currentIsolatedApi: IsolatedApi | null = null;

export function html(strings: TemplateStringsArray, ...values: unknown[]) {
	return String.raw({ raw: strings.raw }, ...values);
}

/** Runs init() in devMode and returns the model mounted on each element, for tests that need instances. */
export function initInstances(root: HTMLElement): Map<Element, any> {
	const instances = new Map<Element, any>();
	Sprincul.init({
		root,
		devMode: true,
		onReady: (models: any[]) => models.forEach((model) => instances.set(model.element, model.instance)),
	});
	return instances;
}

export async function waitForDomUpdate() {
	await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Given the single-ton like very stateful nature of Sprincul, this is needed for some tests requiring a truly fresh state
 */
export async function loadIsolatedApi() {
	const tempRoot = `${process.cwd()}/.sprincul-test-${crypto.randomUUID()}`;
	const tempSrc = `${tempRoot}/src`;

	try {
		const glob = new Bun.Glob("**/*");
		for await (const relativePath of glob.scan({ cwd: `${process.cwd()}/src`, onlyFiles: true })) {
			await Bun.write(`${tempSrc}/${relativePath}`, Bun.file(`${process.cwd()}/src/${relativePath}`));
		}

		const moduleUrl = new URL(`./index.ts?v=${Math.random()}`, pathToFileURL(`${tempSrc}/`)).href;
		const isolated = await import(moduleUrl);

		return {
			Sprincul: isolated.Sprincul,
			SprinculModel: isolated.SprinculModel,
			cleanup: () => {
				rmSync(tempRoot, { recursive: true, force: true });
			},
		};
	} catch (error) {
		rmSync(tempRoot, { recursive: true, force: true });
		throw error;
	}
}

export function setCurrentIsolatedApi(api: IsolatedApi | null) {
	currentIsolatedApi = api;
}

export function getCurrentIsolatedApi(): IsolatedApi {
	if (!currentIsolatedApi) {
		throw new Error("Global isolated API is not initialized for this test.");
	}

	return currentIsolatedApi;
}
