/// <reference lib="dom" />
import { expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import { Sprincul, SprinculModel } from "../../src"
import {loadIsolatedApi} from "../helpers.ts";

describe('Sprincul - Initialization', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('Sprincul.onReady() helper works', async () => {
    const isolatedApi = await loadIsolatedApi();
    const { Sprincul: IsolatedSprincul, SprinculModel: IsolatedSprinculModel, cleanup } = isolatedApi;

    try {
      container.innerHTML = `
        <div data-model="Model1"></div>
        <div data-model="Model2"></div>
        <div data-model="Model3"></div>
      `;

      class Model1 extends IsolatedSprinculModel {
        async afterInit() {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      class Model2 extends IsolatedSprinculModel {}
      class Model3 extends IsolatedSprinculModel {}

      IsolatedSprincul.register('Model1', Model1);
      IsolatedSprincul.register('Model2', Model2);
      IsolatedSprincul.register('Model3', Model3);

      let callbackFired = false;
      let receivedModels: any[] | undefined;
      IsolatedSprincul.onReady((models: any[]) => {
        callbackFired = true;
        receivedModels = models;
      });

      IsolatedSprincul.init({ devMode: true });

      expect(callbackFired).toBe(true);
      expect(receivedModels).toHaveLength(3);
      expect(receivedModels![0]).toHaveProperty('instance');
    } finally {
      cleanup();
    }
  });

  test('onReady callbacks can be re-registered for subsequent init cycles', async () => {
    const isolatedApi = await loadIsolatedApi();
    const { Sprincul: IsolatedSprincul, SprinculModel: IsolatedSprinculModel, cleanup } = isolatedApi;

    try {
      container.innerHTML = `<div data-model="CycleModel"></div>`;

      class CycleModel extends IsolatedSprinculModel {}
      IsolatedSprincul.register('CycleModel', CycleModel);

      let firstCycleCalls = 0;
      IsolatedSprincul.onReady(() => {
        firstCycleCalls += 1;
      });

      IsolatedSprincul.init();
      expect(firstCycleCalls).toBe(1);

      // add a new model root and register a new callback for the next init cycle
      const secondRoot = document.createElement('div');
      secondRoot.setAttribute('data-model', 'CycleModel');
      container.appendChild(secondRoot);

      let secondCycleCalls = 0;
      IsolatedSprincul.onReady(() => {
        secondCycleCalls += 1;
      });

      IsolatedSprincul.init();

      expect(firstCycleCalls).toBe(1);
      expect(secondCycleCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

  test('omits instance in production mode (non-devMode)', async () => {
    const isolatedApi = await loadIsolatedApi();
    const { Sprincul: IsolatedSprincul, SprinculModel: IsolatedSprinculModel, cleanup } = isolatedApi;

    try {
      container.innerHTML = `<div data-model="TestModel"></div>`;

      class TestModel extends IsolatedSprinculModel {}
      IsolatedSprincul.register('TestModel', TestModel);

      let receivedModels: any[] | undefined;
      IsolatedSprincul.onReady((models: any[]) => {
        receivedModels = models;
      });

      IsolatedSprincul.init();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedModels).toHaveLength(1);
      expect(receivedModels![0]).not.toHaveProperty('instance');
    } finally {
      cleanup();
    }
  });

  test('registers and initializes a model', () => {
    container.innerHTML = `
      <div data-model="TestModel">
        <span data-bind-message="updateText"></span>
      </div>
    `;

    class TestModel extends SprinculModel {
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

  test('registerAll registers multiple models at once', () => {
    container.innerHTML = `
      <div data-model="UserModel">
        <span data-bind-name="showName"></span>
      </div>
      <div data-model="ProductModel">
        <span data-bind-title="showTitle"></span>
      </div>
      <div data-model="CartModel">
        <span data-bind-count="showCount"></span>
      </div>
    `;

    class UserModel extends SprinculModel {
      constructor(element: HTMLElement) {
        super(element);
        this.state.name = 'John Doe';
      }

      showName(el: HTMLElement) {
        el.textContent = this.state.name;
      }
    }

    class ProductModel extends SprinculModel {
      constructor(element: HTMLElement) {
        super(element);
        this.state.title = 'Laptop';
      }

      showTitle(el: HTMLElement) {
        el.textContent = this.state.title;
      }
    }

    class CartModel extends SprinculModel {
      constructor(element: HTMLElement) {
        super(element);
        this.state.count = 3;
      }

      showCount(el: HTMLElement) {
        el.textContent = String(this.state.count);
      }
    }

    Sprincul.registerAll({
      UserModel,
      ProductModel,
      CartModel
    });
    Sprincul.init();

    const userName = container.querySelector('[data-bind-name]');
    const productTitle = container.querySelector('[data-bind-title]');
    const cartCount = container.querySelector('[data-bind-count]');

    expect(userName?.textContent).toBe('John Doe');
    expect(productTitle?.textContent).toBe('Laptop');
    expect(cartCount?.textContent).toBe('3');
  });

  test('removes data-cloaked attribute after initialization', async () => {
    container.innerHTML = `
      <div data-model="TestModel" data-cloaked>
        <span>Content</span>
      </div>
    `;

    class TestModel extends SprinculModel {}

    Sprincul.register('TestModel', TestModel);
    Sprincul.init();
    
    // Wait a tick for the init promise to resolve and remove cloaks
    await new Promise(resolve => setTimeout(resolve, 0));

    const model = container.querySelector('[data-model="TestModel"]');
    expect(model?.hasAttribute('data-cloaked')).toBe(false);
  });

  test('logs an error when afterInit throws', async () => {
    container.innerHTML = `<div data-model="AfterInitErrorModel"></div>`;

    class AfterInitErrorModel extends SprinculModel {
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

    class DevModeModel extends SprinculModel {}

    Sprincul.register('DevModeModel', DevModeModel);
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    Sprincul.init({ devMode: true });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Sprincul] Binding callback "nonExistentFn" not found for data-bind-count.'
    );
    warnSpy.mockRestore();
  });

  test('dispatches sprincul:ready event after all models initialized', () => {
    container.innerHTML = `
      <div data-model="Model1"></div>
      <div data-model="Model2"></div>
    `;

    class Model1 extends SprinculModel {
      async afterInit() {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    class Model2 extends SprinculModel {}

    Sprincul.register('Model1', Model1);
    Sprincul.register('Model2', Model2);

    let eventFired = false;
    let eventDetail: any;

    document.addEventListener('sprincul:ready', (e: Event) => {
      eventFired = true;
      eventDetail = (e as CustomEvent).detail;
    }, { once: true });

    Sprincul.init({ devMode: true });

    // Event fires immediately after afterInit hooks are called (not after they complete)
    expect(eventFired).toBe(true);
    expect(eventDetail.models).toHaveLength(2);
    expect(eventDetail.models[0]).toHaveProperty('name');
    expect(eventDetail.models[0]).toHaveProperty('element');
    expect(eventDetail.models[0]).toHaveProperty('instance');
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

    class OuterModel extends SprinculModel {
      constructor(element: HTMLElement) {
        super(element);
        this.state.outer = 'Outer';
      }

      updateOuter(el: HTMLElement) {
        el.textContent = this.state.outer;
      }
    }

    class InnerModel extends SprinculModel {
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
