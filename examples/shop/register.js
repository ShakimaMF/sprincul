import { Sprincul } from "sprincul";
import * as models from "./models/index.js";

/*
 * Every model is a custom element, so registering defines the elements and each one mounts itself.
 * There's no init() call. As a module script, this runs once the markup is parsed, so each element's
 * children are there when it mounts.
 */
Sprincul.setOption("devMode", true);
// Events use data-on-*, so opt in to leaving native on* attributes to the browser
Sprincul.setOption("processNativeEvents", false);
Sprincul.registerAll(models);
