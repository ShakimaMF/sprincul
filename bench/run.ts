import { chromium } from "playwright";
import pkg from "../package.json";
import type { MemoryResult, Result } from "./scenarios.ts";

/*
 * Benchmarks Sprincul in a real Chromium page.
 * Usage: bun run bench [--filter <text>] [--json <file>] [--headed] [--cpu <slowdown>]
 * --cpu 4 approximates a mid-range phone, the same throttling Lighthouse uses for mobile.
 */

const args = process.argv.slice(2);
const option = (name: string) => {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
};
const filter = option("--filter");
const jsonPath = option("--json");
const headed = args.includes("--headed");
const cpuSlowdown = Number(option("--cpu") ?? 1);

async function build(entry: string): Promise<string> {
	const output = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm", minify: true });
	if (!output.success) throw new AggregateError(output.logs, `Failed to build ${entry}`);
	return output.outputs[0]!.text();
}

const library = await build(`${import.meta.dir}/../src/index.ts`);
const bundle = await build(`${import.meta.dir}/scenarios.ts`);

// Cross-origin isolation raises performance.now() precision from 100µs to 5µs
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };
const server = Bun.serve({
	port: 0,
	routes: {
		"/": new Response(
			'<!doctype html><html lang="en"><body><script type="module" src="/bench.js"></script></body></html>',
			{ headers: { ...isolation, "Content-Type": "text/html" } },
		),
		"/bench.js": new Response(bundle, { headers: { ...isolation, "Content-Type": "text/javascript" } }),
	},
});

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const time = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(2)} ms`);
const columns = (cells: string[]) =>
	cells[0]!.padEnd(46) +
	cells
		.slice(1)
		.map((cell) => cell.padStart(11))
		.join("");

const browser = await chromium.launch({ headless: !headed });
try {
	const page = await browser.newPage();
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

	await page.exposeFunction("__heapUsed", async () => {
		await cdp.send("HeapProfiler.collectGarbage");
		await cdp.send("HeapProfiler.collectGarbage");
		return (await cdp.send("Runtime.getHeapUsage")).usedSize;
	});
	await page.exposeFunction("__report", (result: Result) => {
		if (result.error) return console.log(columns([result.name, "FAILED"]) + `\n  ${result.error}`);
		console.log(
			columns([
				result.name,
				time(result.median),
				time(result.p95),
				time(result.min),
				time(result.withLayout),
				String(result.samples),
			]),
		);
	});

	await page.goto(server.url.href);
	await page.waitForFunction(() => "runBenchmarks" in window);
	const isolated = await page.evaluate(() => crossOriginIsolated);

	console.log(
		`sprincul ${pkg.version} · Chromium ${browser.version()}${headed ? "" : " (headless)"}${cpuSlowdown > 1 ? ` · CPU ${cpuSlowdown}x slower` : ""}`,
	);
	console.log(`bundle ${kb(library.length)} min, ${kb(Bun.gzipSync(library).length)} gzip`);
	if (!isolated) console.log("warning: page is not cross-origin isolated, timers are coarse (100µs)");
	console.log("times are Sprincul's own work; + layout is the median including the browser's layout afterward");
	console.log(`\n${columns(["scenario", "median", "p95", "min", "+ layout", "samples"])}`);

	const { results, memory } = await page.evaluate((text) => window.runBenchmarks(text), filter);
	if (memory) printMemory(memory);

	if (errors.length > 0) console.log(`\npage errors:\n  ${errors.join("\n  ")}`);
	if (errors.length > 0 || memory?.error || results.some((result) => result.error)) process.exitCode = 1;

	if (jsonPath) {
		const report = {
			version: pkg.version,
			browser: browser.version(),
			date: new Date().toISOString(),
			results,
			memory,
		};
		await Bun.write(jsonPath, JSON.stringify(report, null, "\t"));
	}
} finally {
	await browser.close();
	await server.stop();
}

function printMemory(memory: MemoryResult) {
	if (memory.error) return console.log(`\nmemory: FAILED\n  ${memory.error}`);
	const line = (label: string, value: string) => console.log(`  ${label.padEnd(30)}${value}`);
	console.log(`\nmemory (${memory.models.toLocaleString()} rows, V8 heap after GC)`);
	line("per mounted model", kb(memory.bytesPerModel));
	line("retained after unmount", kb(memory.retainedAfterUnmount));
	line(`growth per cycle (${memory.cycles} cycles)`, kb(memory.growthPerCycle));
}
