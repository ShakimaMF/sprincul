/**
 * Wait for Sprincul's batched DOM updates to complete.
 * Sprincul queues updates in a requestAnimationFrame. We queue a second rAF
 * immediately after so this promise resolves only once Sprincul's frame has run.
 */
export async function waitForDomUpdate() {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
