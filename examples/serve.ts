/*
 * Serves an example with Sprincul built from src, so no build step is needed.
 * Usage: bun run example [name], default "shop". Set PORT to change the port (default 3000).
 */

const name = process.argv[2] ?? "shop";
const dir = `${import.meta.dir}/${name}`;

const output = await Bun.build({
	entrypoints: [`${import.meta.dir}/../src/index.ts`],
	target: "browser",
	format: "esm",
});
if (!output.success) throw new AggregateError(output.logs, "Failed to build Sprincul");
const sprincul = await output.outputs[0]!.text();

const server = Bun.serve({
	port: Number(process.env.PORT ?? 3000),
	routes: { "/sprincul.js": new Response(sprincul, { headers: { "Content-Type": "text/javascript" } }) },
	async fetch(request) {
		const path = new URL(request.url).pathname;
		const file = Bun.file(`${dir}${path === "/" ? "/index.html" : path}`);
		if (!(await file.exists())) return new Response("Not found", { status: 404 });
		return new Response(file);
	},
});

console.log(`Serving examples/${name} at ${server.url}`);
