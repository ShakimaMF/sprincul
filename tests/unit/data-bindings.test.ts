/// <reference lib="dom" />
import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Sprincul from '../../src/Sprincul.ts';
import { waitForDomUpdate } from '../helpers.ts';

describe('Sprincul - Data Bindings', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('data-bind-* reactive bindings', () => {
    test('calls callback with element when bound property changes', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <button onclick="changeMessage">Change</button>
          <span data-bind-message="updateText"></span>
        </div>
      `;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.message = 'Hello';
        }

        changeMessage() {
          this.state.message = 'Goodbye';
        }

        updateText(el: HTMLElement) {
          el.textContent = this.state.message;
        }
      }

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      const button = container.querySelector('button') as HTMLButtonElement;
      const span = container.querySelector('span');

      expect(span?.textContent).toBe('Hello');

      button.click();
      await waitForDomUpdate();

      expect(span?.textContent).toBe('Goodbye');
    });

    test('supports multiple different bindings on same element', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <button onclick="update">Update</button>
          <div data-bind-title="updateTitle" data-bind-content="updateContent"></div>
        </div>
      `;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.title = 'Title';
          this.state.content = 'Content';
        }

        update() {
          this.state.title = 'New Title';
          this.state.content = 'New Content';
        }

        updateTitle(el: HTMLElement) {
          el.setAttribute('title', this.state.title);
        }

        updateContent(el: HTMLElement) {
          el.textContent = this.state.content;
        }
      }

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      const button = container.querySelector('button') as HTMLButtonElement;
      const div = container.querySelector('div[data-bind-title]') as HTMLElement;

      expect(div.getAttribute('title')).toBe('Title');
      expect(div.textContent).toBe('Content');

      button.click();
      await waitForDomUpdate();

      expect(div.getAttribute('title')).toBe('New Title');
      expect(div.textContent).toBe('New Content');
    });
  });

  describe('Event handlers', () => {
    test('handles click events via onclick attribute', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <button onclick="handleClick">Click Me</button>
          <span data-bind-clicked="updateClicked"></span>
        </div>
      `;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.clicked = false;
        }

        handleClick() {
          this.state.clicked = true;
        }

        updateClicked(el: HTMLElement) {
          el.textContent = this.state.clicked ? 'Clicked!' : 'Not clicked';
        }
      }

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      const button = container.querySelector('button') as HTMLButtonElement;
      const span = container.querySelector('span');

      expect(span?.textContent).toBe('Not clicked');

      button.click();
      await waitForDomUpdate();

      expect(span?.textContent).toBe('Clicked!');
    });

    // Note: keyboard/input synthetic events in happy-dom are unreliable; click is covered above.

    test('comprehensive integration: event changes state, multiple elements react', async () => {
      container.innerHTML = `
        <div data-model="CounterModel">
          <button onclick="increment">+</button>
          <button onclick="decrement">-</button>
          <button onclick="reset">Reset</button>
          <div data-bind-count="updateCount"></div>
          <div data-bind-doubled="updateDoubled"></div>
          <div data-bind-status="updateStatus"></div>
        </div>
      `;

      class CounterModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.count = 0;
          this.addComputedProp('doubled', () => this.state.count * 2, ['count']);
          this.addComputedProp('status', () => {
            if (this.state.count === 0) return 'Zero';
            if (this.state.count > 0) return 'Positive';
            return 'Negative';
          }, ['count']);
        }

        increment() {
          this.state.count++;
        }

        decrement() {
          this.state.count--;
        }

        reset() {
          this.state.count = 0;
        }

        updateCount(el: HTMLElement) {
          el.textContent = `Count: ${this.state.count}`;
        }

        updateDoubled(el: HTMLElement) {
          el.textContent = `Doubled: ${this.state.doubled}`;
        }

        updateStatus(el: HTMLElement) {
          el.textContent = `Status: ${this.state.status}`;
        }
      }

      Sprincul.register('CounterModel', CounterModel);
      Sprincul.init();

      const [incrementBtn, decrementBtn, resetBtn] = container.querySelectorAll('button');
      const [countDiv, doubledDiv, statusDiv] = container.querySelectorAll('div[data-bind-count], div[data-bind-doubled], div[data-bind-status]');

      // Initial state
      expect(countDiv.textContent).toBe('Count: 0');
      expect(doubledDiv.textContent).toBe('Doubled: 0');
      expect(statusDiv.textContent).toBe('Status: Zero');

      // Increment
      incrementBtn.click();
      await waitForDomUpdate();

      expect(countDiv.textContent).toBe('Count: 1');
      expect(doubledDiv.textContent).toBe('Doubled: 2');
      expect(statusDiv.textContent).toBe('Status: Positive');

      // Increment again
      incrementBtn.click();
      await waitForDomUpdate();

      expect(countDiv.textContent).toBe('Count: 2');
      expect(doubledDiv.textContent).toBe('Doubled: 4');
      expect(statusDiv.textContent).toBe('Status: Positive');

      // Decrement multiple times to go negative
      decrementBtn.click();
      await waitForDomUpdate();
      decrementBtn.click();
      await waitForDomUpdate();
      decrementBtn.click();
      await waitForDomUpdate();

      expect(countDiv.textContent).toBe('Count: -1');
      expect(doubledDiv.textContent).toBe('Doubled: -2');
      expect(statusDiv.textContent).toBe('Status: Negative');

      // Reset
      resetBtn.click();
      await waitForDomUpdate();

      expect(countDiv.textContent).toBe('Count: 0');
      expect(doubledDiv.textContent).toBe('Doubled: 0');
      expect(statusDiv.textContent).toBe('Status: Zero');
    });
  });

  describe('Array/List Rendering', () => {
    test('renders a list bound to an array property', () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <ul data-bind-items="renderList"></ul>
        </div>
      `;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.items = [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ];
        }

        renderList(el: HTMLElement) {
          el.innerHTML = this.state.items
            .map(item => `<li>${item.name}</li>`)
            .join('');
        }
      }

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      const listItems = container.querySelectorAll('li');
      expect(listItems).toHaveLength(2);
      expect(listItems[0].textContent).toBe('Item 1');
      expect(listItems[1].textContent).toBe('Item 2');
    });

    test('re-renders list when array changes', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <button onclick="addItem">Add Item</button>
          <ul data-bind-items="renderList"></ul>
        </div>
      `;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.items = [{ id: 1, name: 'Item 1' }];
        }

        addItem() {
          const newId = this.state.items.length + 1;
          this.state.items = [...this.state.items, { id: newId, name: `Item ${newId}` }];
        }

        renderList(el: HTMLElement) {
          el.innerHTML = this.state.items
            .map(item => `<li>${item.name}</li>`)
            .join('');
        }
      }

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      const button = container.querySelector('button') as HTMLButtonElement;
      let listItems = container.querySelectorAll('li');

      expect(listItems).toHaveLength(1);
      expect(listItems[0].textContent).toBe('Item 1');

      button.click();
      await waitForDomUpdate();

      listItems = container.querySelectorAll('li');
      expect(listItems).toHaveLength(2);
      expect(listItems[1].textContent).toBe('Item 2');
    });

    // Skipping dynamic-item manual event wiring: happy-dom synthetic click on non-controls is unreliable.
  });

  describe('MutationObserver binding cleanup', () => {
    test('stops calling binding callbacks for children of a removed parent element', async () => {
      container.innerHTML = `
        <div data-model="PurgeModel">
          <button onclick="update">Update</button>
          <div id="wrapper">
            <span data-bind-message="updateText"></span>
          </div>
        </div>
      `;

      let callCount = 0;

      class PurgeModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.message = 'Hello';
        }

        update() {
          this.state.message = 'World';
        }

        updateText(el: HTMLElement) {
          callCount++;
          el.textContent = this.state.message;
        }
      }

      Sprincul.register('PurgeModel', PurgeModel);
      Sprincul.init();

      // Flush any pending RAFs from the constructor's initial state set before removing.
      // In happy-dom: RAF fires before MutationObserver, so we must drain it first to
      // prevent a pending constructor RAF from calling the callback after removal.
      await waitForDomUpdate();
      const countAfterInit = callCount;

      // Remove the parent wrapper — the bound span is a child, not the direct removed node.
      // The MutationObserver's child-walk (line 157) is responsible for purging it from #bindings.
      container.querySelector('#wrapper')!.remove();

      // In happy-dom: RAF fires before MO, which fires before setTimeout.
      // After this await the MO callback has fired and the span is purged from #bindings.
      await new Promise(resolve => setTimeout(resolve, 0));

      // Trigger a state change and wait for the update cycle to complete
      (container.querySelector('button') as HTMLButtonElement).click();
      await waitForDomUpdate();

      // The span binding was purged via the child-walk; no additional calls expected
      expect(callCount).toBe(countAfterInit);
    });
  });

  describe('Error handling', () => {
    test('errors in one binding do not affect other bindings', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <button onclick="trigger">Trigger</button>
          <span data-bind-count="throwError"></span>
          <div data-bind-count="safeUpdate"></div>
        </div>
      `;

      let safeCallCount = 0;

      class TestModel extends Sprincul {
        constructor(element: HTMLElement) {
          super(element);
          this.state.count = 0;
        }

        trigger() {
          this.state.count++;
        }

        throwError(el: HTMLElement) {
          throw new Error('Intentional error in binding');
        }

        safeUpdate(el: HTMLElement) {
          safeCallCount++;
          el.textContent = String(this.state.count);
        }
      }

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

      Sprincul.register('TestModel', TestModel);
      Sprincul.init();

      // Wait for initial bindings to complete
      await waitForDomUpdate();
      const initialCallCount = safeCallCount;

      const button = container.querySelector('button') as HTMLButtonElement;
      const div = container.querySelector('div[data-bind-count]') as HTMLElement;

      button.click();
      await waitForDomUpdate();

      // Safe binding should still work despite error in other binding
      expect(safeCallCount).toBe(initialCallCount + 1);
      expect(div.textContent).toBe('1');
      
      // Error should have been logged
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in binding callback'),
        expect.any(Error)
      );
      
      errorSpy.mockRestore();
    });
  });
});
