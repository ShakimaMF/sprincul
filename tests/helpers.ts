/**
 * Wait for Sprincul's debounced DOM updates to complete.
 * Sprincul uses requestAnimationFrame to batch updates for performance.
 */
export async function waitForDomUpdate() {
	await new Promise(resolve => requestAnimationFrame(resolve));
}
