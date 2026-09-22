<p align="center">
  <img alt="sprincul" src="https://github.com/user-attachments/assets/6f5aa8ea-5ba8-4878-8114-65d1bc94c1bf" />
  <br />
  <b>Sprincul:</b> Lightweight, browser-side reactivity for HTML.
  <br />
</p>

## About

Sprincul is a lightweight, browser-side JS framework for adding reactivity to HTML. It focuses on enhancing existing markup using HTML attributes that map directly to your JavaScript classes.

## Highlights

- State and reactivity are powered by plain JavaScript classes.
- Uses [nanostores](https://github.com/nanostores/nanostores) under the hood for efficient reactive state management.
- Bind state to the DOM with standard `data-*` attributes.
- Use familiar event attributes like `onclick` and `oninput`; Sprincul converts them into proper listeners on your model instances.
- Supports computed properties that automatically update when dependencies change.
- Includes a minimal global store for cross-component communication.

## How it compares

Sprincul will feel familiar if you have used [Stimulus](https://stimulus.hotwired.dev) or [Alpine.js](https://alpinejs.dev).

- Like Stimulus, it enhances server-rendered HTML by connecting JavaScript classes to elements through `data-*` attributes instead of taking over rendering.
- Unlike Stimulus, you do not need to declare `static targets`, `values`, or `actions`; Sprincul works directly with the methods you define on the class.
- Like Alpine.js, behavior stays close to your markup, but Sprincul does not evaluate inline JavaScript. The behavior lives in your model class, which makes it closer in spirit to Stimulus than to Alpine’s expression-driven approach.

This is not meant to compete with either project. The goal is to offer another way to enhance HTML with fewer framework-specific concepts to remember.

## How it works

- Each piece of interactive HTML on your page is a **model**: a container element marked with `data-model="<Name>"`, paired with a plain JavaScript class of the same name.
- The class holds state and the methods that react to it. Bindings (`data-bind-<prop>="<callback>"`) connect state changes to the DOM; event attributes (`onclick`, `oninput`, etc.) connect user interaction to the class.
- Sprincul reads this markup once and wires it up: state changes flow through your methods to update the DOM, and DOM events flow through your methods to update the state.

<img alt="Sprincul Overview Diagram" src="https://github.com/user-attachments/assets/57b448c7-c3ba-4f09-bdca-83b5c64c519e" />

See [Getting Started](https://github.com/ShakimaMF/sprincul/wiki/Getting-Started) in the wiki for the full breakdown, diagrams, installation, and a walkthrough of your first model.

## Installation

### In the browser via CDN

```js
// main.js
import { Sprincul } from "https://esm.sh/sprincul";
import Counter from "./Counter.js";

Sprincul.register("Counter", Counter);
Sprincul.init();
```

### Using a package manager

```bash
npm install sprincul
# or
pnpm add sprincul
# or
bun add sprincul
```

```js
import { Sprincul } from "sprincul";
```

## Learn more

The full reference lives in the [wiki](https://github.com/ShakimaMF/sprincul/wiki):

- [Getting Started](https://github.com/ShakimaMF/sprincul/wiki/Getting-Started) - how it works, installation, and a quick start walkthrough
- [Data Bindings](https://github.com/ShakimaMF/sprincul/wiki/Data-Bindings) - connect `this.state` to the DOM with `data-bind-<prop>`
- [Events](https://github.com/ShakimaMF/sprincul/wiki/Events) - wire up `onclick`, `oninput`, and other native event attributes
- [Computed Properties](https://github.com/ShakimaMF/sprincul/wiki/Computed-Properties) - derived state with `addComputedProp`
- [Mounting & Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting) - `init()`, `mount()`, `unmount()`, `destroyAll()`, and their options
- [Lifecycle & Hydration](https://github.com/ShakimaMF/sprincul/wiki/Lifecycle-and-Hydration) - `beforeInit`, `afterInit`, `beforeDestroy`, cloaking, and hydrating from server-rendered defaults
- [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content) - `this.wire()` for content added inside a live model
- [Global Store](https://github.com/ShakimaMF/sprincul/wiki/Global-Store) - the shared key/value store across models
- [Reactivity & Batching](https://github.com/ShakimaMF/sprincul/wiki/Reactivity-and-Batching) - how DOM updates are batched
- [TypeScript](https://github.com/ShakimaMF/sprincul/wiki/TypeScript) - typing `this.state`
- [Troubleshooting](https://github.com/ShakimaMF/sprincul/wiki/Troubleshooting) - common questions and gotchas

## Examples

For more usage patterns, see the tests under `tests`.

## Tips for success

- Pick one direction for updates and stay consistent. If bindings render the UI, let them own the DOM. If user input updates state, avoid mixing that with ad hoc DOM manipulation.

## License

MIT
