/// <reference lib="dom" />
import { expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import Sprincul from '../../src/Sprincul.ts';

describe('Sprincul - Initialization', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('registers and initializes a model', () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <span data-bind-message="updateText"></span>
      </div>
    `;

    class TestModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.message = 'Hello';
      }

      updateText(el: HTMLElement) {
        el.textContent = this.state.message;
      }
    }

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Hello');
  });

  test('removes data-cloaked attribute after initialization', () => {
    container.innerHTML = `
      <div data-model="TestModel" data-cloaked>
        <span>Content</span>
      </div>
    `;

    class TestModel extends Sprincul {}

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();

    const model = container.querySelector('[data-model="TestModel"]');
    expect(model?.hasAttribute('data-cloaked')).toBe(false);
  });

  test('logs an error when afterInit throws', async () => {
    container.innerHTML = `<div data-model="AfterInitErrorModel"></div>`;

    class AfterInitErrorModel extends Sprincul {
      afterInit() {
        throw new Error('hook failed');
      }
    }

    Sprincul.register('AfterInitErrorModel', AfterInitErrorModel);
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    Sprincul.init();
    // #runHook runs via Promise microtasks; a macrotask flush ensures the .catch() has fired
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      'Error in "afterInit" hook call:',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  test('warns in devMode when a binding callback is not found', () => {
    container.innerHTML = `
      <div data-model="DevModeModel">
        <span data-bind-count="nonExistentFn"></span>
      </div>
    `;

    class DevModeModel extends Sprincul {}

    Sprincul.register('DevModeModel', DevModeModel);
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    Sprincul.init({ devMode: true });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Sprincul] Binding callback "nonExistentFn" not found for data-bind-count.'
    );
    warnSpy.mockRestore();
  });

  test('processes nested models', () => {
    container.innerHTML = `
      <div data-model="OuterModel">
        <span data-bind-outer="updateOuter"></span>
        <div data-model="InnerModel">
          <span data-bind-inner="updateInner"></span>
        </div>
      </div>
    `;

    class OuterModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.outer = 'Outer';
      }

      updateOuter(el: HTMLElement) {
        el.textContent = this.state.outer;
      }
    }

    class InnerModel extends Sprincul {
      constructor(element: HTMLElement) {
        super(element);
        this.state.inner = 'Inner';
      }

      updateInner(el: HTMLElement) {
        el.textContent = this.state.inner;
      }
    }

    Sprincul.register('OuterModel', OuterModel);
    Sprincul.register('InnerModel', InnerModel);
    Sprincul.init();

    const outerSpan = container.querySelector('[data-bind-outer]');
    const innerSpan = container.querySelector('[data-bind-inner]');

    expect(outerSpan?.textContent).toBe('Outer');
    expect(innerSpan?.textContent).toBe('Inner');
  });
});
