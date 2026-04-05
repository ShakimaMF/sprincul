# Sprincul

Sprincul is a lightweight utility for adding **reactivity** to existing HTML with plain JavaScript classes and `data-*` attributes.

## Highlights

- State and reactivity are powered by plain JavaScript classes.
- Built on [nanostores](https://github.com/nanostores/nanostores) for efficient reactive state management.
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

Each component is a standard JavaScript class that extends `SprinculModel`. Define reactive values on `this.state`, and add methods for UI updates and event handlers.

```js
// Counter.js
import { SprinculModel } from 'sprincul';

export default class Counter extends SprinculModel {
  constructor(element) {
    super(element);
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

Register each model before calling `Sprincul.init()`.

```js
// main.js
import { Sprincul } from 'sprincul';
import Counter from './Counter.js';

Sprincul.register('Counter', Counter);
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
- Pass `{ devMode: true }` to enable development logs in the console.
- Implement `afterInit()` to run code **after bindings and event listeners are attached**. This is the safest place to hydrate state from APIs, connect to external stores, or kick off async work.
- Add `data-cloaked` to any section that should stay hidden until initialization completes. Sprincul removes the attribute when setup finishes; you provide the CSS.

```html
<style>[data-cloaked]{display:none}</style>
<div data-model="MyModel" data-cloaked>…</div>
```

## Data Bindings

Sprincul reads bindings from attributes shaped like `data-bind-<prop>="<callback>"`. When `this.state.<prop>` changes, Sprincul calls `callback(element)` so your model can update the bound element directly.

```html
<section data-model="Profile">
  <p data-bind-name="showName"></p>
  <p data-bind-email="showEmail"></p>
</section>
```

```js
import { SprinculModel } from 'sprincul';

export default class Profile extends SprinculModel {
  constructor(el) {
    super(el);
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
  constructor(el) {
    super(el);
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

  constructor(el: HTMLElement) {
    super(el);
    this.state.count = 0;
    this.state.name = 'World';
  }

  afterInit() {
    // Optional lifecycle hook
  }
}
```

## Testing

- Synthetic keyboard and input events can be unreliable in DOM emulators; prefer click-based tests or assert state changes directly.
- Because updates are batched with `requestAnimationFrame`, async tests should wait briefly before asserting DOM output.

```js
await new Promise((r) => setTimeout(r, 10));
```

## FAQ

- **Why isn’t my `data-bind-*` callback firing?** Make sure the attribute is inside the same `data-model` container as the model instance, the callback name matches a method on your class, and that you mutated `this.state.<prop>` rather than `this.<prop>`.
- **Do I need a backend or bundler?** No. You can import Sprincul directly through `<script type="module">` from a CDN, your own registry, or your bundler output.
- **When can I seed `Sprincul.store` values?** Any time: before registering models, before `Sprincul.init()`, or after initialization.

## Examples

For more usage patterns, see the tests under `tests`.

## Tips for success

- Pick one direction for updates and stay consistent. If bindings render the UI, let them own the DOM. If user input updates state, avoid mixing that with ad hoc DOM manipulation.

## License

MIT