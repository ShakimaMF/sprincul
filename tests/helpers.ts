// noinspection ES6ConvertVarToLetConst

import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

type IsolatedApi = {
    Sprincul: any;
    SprinculModel: any;
    cleanup: () => void;
};

declare global {
    var Sprincul: any;
    var SprinculModel: any;
    var container: HTMLElement;
}

let currentIsolatedApi: IsolatedApi | null = null;

export async function waitForDomUpdate() {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
            }
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
