<p style="text-align: center">
  <img width="398" height="125" alt="sprincul" src="https://github.com/user-attachments/assets/4c50f36e-48b0-4a6d-b3c2-6f13a85dbffb" />
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

## Installation

### In the browser via CDN

```js
// main.js
import { Sprincul } from 'https://esm.sh/sprincul';
import Counter from './Counter.js';

Sprincul.register('Counter', Counter);
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
import { Sprincul } from 'sprincul';
```

## Quick Start

### 1. Define a model

Each component is a standard JavaScript class that extends `SprinculModel`. Define reactive values on `this.state` in `beforeInit()`, and add methods for UI updates and event handlers.

```js
// Counter.js
import { SprinculModel } from 'sprincul';

export default class Counter extends SprinculModel {
  beforeInit() {
    this.state.count = 0;
  }

  increment() {
    this.state.count++;
  }

  decrement() {
    this.state.count--;
  }

  /** @param {HTMLInputElement} el */
  showCount(el) {
    el.value = this.state.count;
  }

  resetCounter() {
    this.state.count = 0;
  }
}
```

### 2. Register and initialize

**Important:** All model registrations and event listeners (like `Sprincul.onReady()`) must be set up **before** calling `Sprincul.init()`. After initialization completes, newly registered callbacks will not be invoked.

```js
// main.js
import { Sprincul } from 'sprincul';
import Counter from './Counter.js';

Sprincul.register('Counter', Counter);
Sprincul.init();
```

For bulk registration, use `registerAll` with an object of model names and classes:

```js
// main.js
import { Sprincul } from 'sprincul';
import Counter from './Counter.js';
import UserProfile from './UserProfile.js';
import ShoppingCart from './ShoppingCart.js';

Sprincul.registerAll({
  Counter,
  UserProfile,
  ShoppingCart
});
Sprincul.init();
```

During initialization, Sprincul scans the DOM, wires bindings and event listeners, and then runs lifecycle hooks.

### 3. Annotate your HTML

Wrap each model in a container marked with `data-model="<Name>"`. Put the bindings and event attributes for that model inside the container.

```html
<div data-model="Counter">
  <p>Counter</p>
  <button onclick="decrement">-</button>
  <input type="number" data-bind-count="showCount" readonly />
  <button onclick="increment">+</button>
  <button type="reset" onclick="resetCounter">reset</button>
</div>
```

## Lifecycle & Hydration

- `Sprincul.init(options?)` wires bindings, computed props, and event handlers, then invokes lifecycle hooks.
- Implement `beforeInit()` to add computed properties and run setup code such as state **before bindings are attached**.
- Implement `afterInit()` to run code **after bindings and event listeners are attached**. This is the safest place to hydrate state from APIs, connect to external stores, or kick off async work.
- Add `data-cloaked` to hide elements until initialization completes:
  - **Model-level**: `<div data-model="Profile" data-cloaked>` uncloaks after that model's `afterInit` hook **completes** (waits for async operations)
  - **Page-level**: `<body data-cloaked>` uncloaks immediately after **all** models' `afterInit` hooks are **called** (doesn't wait for them to complete)
  - You provide the CSS; Sprincul removes the attribute at the appropriate time.
  - **Best Practice:** For models with heavy initialization (API calls, data processing), use model-level cloaking to prevent showing incomplete UI.
- Use `Sprincul.onReady(callback)` or listen for the `sprincul:ready` event to be notified when all models have been initialized (after all `afterInit` hooks are called). Both provide an array of model information. **Note:** These must be registered **before** calling `Sprincul.init()`.

```html
<style>[data-cloaked]{display:none}</style>
<!-- Per-model cloaking -->
<div data-model="Profile" data-cloaked>…</div>
<!-- Page-level cloaking -->
<body data-cloaked>
  <div data-model="Profile">…</div>
  <div data-model="Settings">…</div>
</body>
```

```js
// Using the helper method
Sprincul.onReady((models) => {
  console.log(`Sprincul initialized ${models.length} models`);
  // Access each model's information
  models.forEach(({ name, element }) => {
    console.log(`Model "${name}" on element:`, element);
  });
});

// Or use the DOM event directly
document.addEventListener('sprincul:ready', ({detail}) => {
  const { models } = detail;
  console.log(`Initialized ${models.length} models`);
  // Access each model's information
});
```

### Development Mode

Pass `{ devMode: true }` to `Sprincul.init()` to enable:
- Development warnings in the console when bindings or handlers are misconfigured
- Model instance exposure in the `sprincul:ready` event and `onReady` callback

```js
Sprincul.onReady((models) => {
  // In devMode, each model includes the instance property
  models.forEach(({ name, element, instance }) => {
    // Direct access to the model instance for debugging
  });
});

Sprincul.init({ devMode: true });
```

> **Security Note:** Model instances are excluded from the ready event in production to prevent console access to internal state. Enable `devMode` only during development.

## Data Bindings

Sprincul reads bindings from attributes shaped like `data-bind-<prop>="<callback>"`. When `this.state.<prop>` changes, Sprincul calls `callback(element)` so your model can update the bound element directly.

> **Important:** Due to HTML's lower-casing of data attributes when building the DOM, state property names referenced in bindings must be lowercase to match the browser's lowercase representation (e.g., `this.state.btntext` not `this.state.btnText`).

```html
<section data-model="Profile">
  <p data-bind-name="showName"></p>
  <p data-bind-email="showEmail"></p>
</section>
```

```js
import { SprinculModel } from 'sprincul';

export default class Profile extends SprinculModel {
  beforeInit() {
    // Initialize state
    this.state.name = '--';
    this.state.email = '--';
  }

  /** @param {HTMLElement} el */
  showName(el) {
    el.textContent = this.state.name;
  }

  /** @param {HTMLElement} el */
  showEmail(el) {
    el.textContent = this.state.email;
  }

  async fakeFetch() {
    return new Promise((resolve) => {
      const result = () =>
        resolve({
          name: 'Jane Doe',
          email: 'jane@email.com',
        });
      setTimeout(result, 2000);
    });
  }

  async updateUI() {
    const { name, email } = await this.fakeFetch();
    this.state.name = name;
    this.state.email = email;
  }

  async afterInit() {
    await this.updateUI();
    console.log('UI Updated');
  }
}
```

## Events

Use native `on<event>` attributes such as `onclick`, `oninput`, and `onchange`. Sprincul converts them into event listeners on your model instance, removes the inline attributes, and passes the native `Event` object to your handler.

```html
<input oninput="handleInput" />
<button onclick="save">Save</button>
```

```js
import { SprinculModel } from 'sprincul';

export default class Foo extends SprinculModel {
  /** @param {InputEvent} e */
  handleInput(e) { /* ... */ }
  
  save() { /* ... */ }
}
```

## Computed Properties

Register derived values with `addComputedProp(name, fn, dependencies)`.

```html
<div data-model="Totals">
  <label for="price">Price</label>
  <input id="price" name="price" type="number" value="10" oninput="setPrice" />
  <label for="qty">Quantity</label>
  <input id="qty" name="qty" type="number" value="2" oninput="setQty" />
  <p>Total: <span data-bind-total="showTotal"></span></p>
</div>
```

```js
import { SprinculModel } from 'sprincul';

export default class Totals extends SprinculModel {
  beforeInit() {
    // Initialize state and add computed props
    this.state.price = 10;
    this.state.qty = 2;
    this.addComputedProp('total', () => this.state.price * this.state.qty, ['price', 'qty']);
  }

  /** @param {InputEvent} e */
  setPrice(e) {
    this.state.price = Number(e.target.value || 0);
  }

  /** @param {InputEvent} e */
  setQty(e) {
    this.state.qty = Number(e.target.value || 0);
  }

  /** @param {HTMLElement} el */
  showTotal(el) {
    el.textContent = String(this.state.total);
  }
}
```

- Computed properties are available on `this.state.<computedPropName>` like any other state field.
- Dependencies are required so only relevant computations rerun.
- Dependency changes are batched with other state updates to keep UI updates synchronized.

## Global Store

Sprincul ships with a simple key/value store shared across models.

```js
// Set and get
Sprincul.store.set('theme', 'dark');
const theme = Sprincul.store.get('theme');

// Subscribe (fires only after subsequent changes; call get() first for initial value)
const unsubscribe = Sprincul.store.subscribe('theme', (value) => {
  console.log('theme:', value); // string | undefined
});

// Clear all
Sprincul.store.clear();
```

- `Sprincul.store.get(key)` returns the latest value or `undefined`.
- `Sprincul.store.set(key, value)` creates the entry if needed and notifies subscribers.
- `Sprincul.store.subscribe(key, cb)` fires **after** the value changes and returns an unsubscribe function.

> Need the current value immediately? Call `Sprincul.store.get(key)` before subscribing, or seed a default with `Sprincul.store.set(key, value)`.

## Reactivity & Batching

- Sprincul batches DOM updates with `requestAnimationFrame`.
- Multiple state changes in the same frame are coalesced into one render pass.
- Computed-property invalidations run in the same batch.
- This reduces redundant work and keeps rapid UI updates predictable.

## TypeScript Tips

If you prefer TypeScript, extend `SprinculModel` with a typed `state`:

```ts
import { SprinculModel } from 'sprincul';

interface MyState {
  count: number;
  name: string;
}

class MyModel extends SprinculModel {
  state!: MyState;

  beforeInit() {
    // Initialize state
    this.state.count = 0;
    this.state.name = 'Hello World';
  }

  afterInit() {
    // Optional lifecycle hook
  }
}
```

## Limitations

Sprincul assumes the surrounding HTML is relatively stable once `Sprincul.init()` has run. It handles cleanup when its own models are removed, but it does not try to track or rebuild itself around external DOM rewrites. If an already-initialized model root is removed, Sprincul cleans up its own framework references for that root and it's descendants.

Sprincul does **not** currently auto-initialize new `data-model` elements that are added to the DOM after `Sprincul.init()` has run. However, if you need this behavior, you can use the following workaround:

- Add your own DOM observer.
- When you inject new model markup, register any fresh `onReady` callbacks needed for that cycle.
- Call `Sprincul.init()` again to hydrate newly added model roots (already-initialized roots are skipped).

This pattern works today and requires no additional framework code.

### Why this isn’t automatic

Automatic DOM scanning on every change would hide work behind the scenes and make it harder to predict when things initialize or run, especially in apps that already manage the DOM themselves. Keeping initialization explicit keeps the framework behavior transparent without hidden magic.

## FAQ

- **Why isn't my `data-bind-*` callback firing?** Make sure the attribute is inside the same `data-model` container as the model instance, the callback name matches a method on your class, and that you mutated `this.state.<prop>` rather than `this.<prop>`.
- **Do I need a backend or bundler?** No. You can import Sprincul directly through `<script type="module">` from a CDN, your own registry, or your bundler output.
- **When can I seed `Sprincul.store` values?** Any time: before registering models, before `Sprincul.init()`, or after initialization.
- **Why isn't my `onReady()` callback being called?** `onReady` callbacks are one-shot per init cycle. Register them before each `Sprincul.init()` call where you want them to run.

## Examples

For more usage patterns, see the tests under `tests`.

## Tips for success

- Pick one direction for updates and stay consistent. If bindings render the UI, let them own the DOM. If user input updates state, avoid mixing that with ad hoc DOM manipulation.

## License

MIT
