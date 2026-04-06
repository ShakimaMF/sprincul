import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
