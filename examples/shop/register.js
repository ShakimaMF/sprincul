import { Sprincul } from "sprincul";
import * as models from "./models/index.js";

/*
 * Loaded from <head>. Registering only maps each data-model name to its class, so it needs no DOM.
 * This allows preloading modules ahead of time for performance. The page mounts them later, in main.js.
 */
Sprincul.registerAll(models);
