import { Sprincul } from "sprincul";

/*
 * Loaded at the end of <body>. The models were registered in <head> by register.js; this mounts every one on the page.
 */
Sprincul.init({ devMode: true, onReady: (models) => console.log(`[shop] mounted ${models.length} models`) });
