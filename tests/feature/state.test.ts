/// <reference lib="dom" />
import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Sprincul from '../../src/Sprincul.ts';
import { waitForDomUpdate } from '../helpers.ts';

describe('Sprincul - State Management', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('updates UI when state changes', async () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <button onclick="increment">Increment</button>
        <span data-bind-count="updateCount"></span>
      </div>
    `;

    class TestModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.count = 0;
      }

      increment() {
        this.state.count++;
      }

      updateCount(el: HTMLElement) {
        el.textContent = String(this.state.count);
      }
    }

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const button = container.querySelector('button') as HTMLButtonElement;
    const span = container.querySelector('span');

    expect(span?.textContent).toBe('0');

    button.click();
    await waitForDomUpdate();

    expect(span?.textContent).toBe('1');
  });

  test('updates multiple elements bound to same property', async () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <button onclick="updateMessage">Update</button>
        <span data-bind-message="updateText"></span>
        <div data-bind-message="updateText"></div>
      </div>
    `;

    class TestModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.message = 'Initial';
      }

      updateMessage() {
        this.state.message = 'Updated';
      }

      updateText(el: HTMLElement) {
        el.textContent = this.state.message;
      }
    }

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const button = container.querySelector('button') as HTMLButtonElement;
    const span = container.querySelector('span');
    const div = container.querySelector('div[data-bind-message]');

    expect(span?.textContent).toBe('Initial');
    expect(div?.textContent).toBe('Initial');

    button.click();
    await waitForDomUpdate();

    expect(span?.textContent).toBe('Updated');
    expect(div?.textContent).toBe('Updated');
  });

  test('updates computed properties when dependencies change', async () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <button onclick="increment">Increment</button>
        <span data-bind-doubled="updateDoubled"></span>
      </div>
    `;

    class TestModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.count = 5;
        this.addComputedProp('doubled', () => this.state.count * 2, ['count']);
      }

      increment() {
        this.state.count++;
      }

      updateDoubled(el: HTMLElement) {
        el.textContent = String(this.state.doubled);
      }
    }

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const button = container.querySelector('button') as HTMLButtonElement;
    const span = container.querySelector('span');

    expect(span?.textContent).toBe('10');

    button.click();
    await waitForDomUpdate();

    expect(span?.textContent).toBe('12');
  });

  test('batches multiple state changes into single render pass', async () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <button onclick="multipleChanges">Update Multiple</button>
        <span data-bind-count="updateCount"></span>
      </div>
    `;

    let callCount = 0;

    class TestModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.count = 0;
      }

      multipleChanges() {
        // Make multiple state changes synchronously
        this.state.count = 1;
        this.state.count = 2;
        this.state.count = 3;
      }

      updateCount(el: HTMLElement) {
        callCount++;
        el.textContent = String(this.state.count);
      }
    }

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const button = container.querySelector('button') as HTMLButtonElement;
    const span = container.querySelector('span');

    // Initial render
    expect(span?.textContent).toBe('0');
    const initialCallCount = callCount;

    button.click();
    await waitForDomUpdate();

    // Should show final value
    expect(span?.textContent).toBe('3');
    // Should only call callback once despite three state changes
    expect(callCount).toBe(initialCallCount + 1);
  });
});
