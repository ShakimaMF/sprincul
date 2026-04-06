/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { waitForDomUpdate } from '../helpers';

describe('Sprincul - Initialization', () => {
  test('Sprincul.onReady() helper works', async () => {
      container.innerHTML = `
        <div data-model="Model1"></div>
        <div data-model="Model2"></div>
        <div data-model="Model3"></div>
      `;

      class Model1 extends SprinculModel {
        async afterInit() {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      class Model2 extends SprinculModel {}
      class Model3 extends SprinculModel {}

      Sprincul.register('Model1', Model1);
      Sprincul.register('Model2', Model2);
      Sprincul.register('Model3', Model3);

      let callbackFired = false;
      let receivedModels: any[] | undefined;
      Sprincul.onReady((models: any[]) => {
        callbackFired = true;
        receivedModels = models;
      });

      Sprincul.init({ devMode: true });

      expect(callbackFired).toBe(true);
      expect(receivedModels).toHaveLength(3);
      expect(receivedModels![0]).toHaveProperty('instance');
  });

  test('onReady callbacks can be re-registered for subsequent init cycles', async () => {
      container.innerHTML = `<div data-model="CycleModel"></div>`;

      class CycleModel extends SprinculModel {}
      Sprincul.register('CycleModel', CycleModel);

      let firstCycleCalls = 0;
      Sprincul.onReady(() => {
        firstCycleCalls += 1;
      });

      Sprincul.init();
      expect(firstCycleCalls).toBe(1);

      // add a new model root and register a new callback for the next init cycle
      const secondRoot = document.createElement('div');
      secondRoot.setAttribute('data-model', 'CycleModel');
      container.appendChild(secondRoot);

      let secondCycleCalls = 0;
      Sprincul.onReady(() => {
        secondCycleCalls += 1;
      });

      Sprincul.init();

      expect(firstCycleCalls).toBe(1);
      expect(secondCycleCalls).toBe(1);
  });

  test('omits instance in production mode (non-devMode)', async () => {
      container.innerHTML = `<div data-model="TestModel"></div>`;

      class TestModel extends SprinculModel {}
      Sprincul.register('TestModel', TestModel);

      let receivedModels: any[] | undefined;
      Sprincul.onReady((models: any[]) => {
        receivedModels = models;
      });

      Sprincul.init();
      await waitForDomUpdate();

      expect(receivedModels).toHaveLength(1);
      expect(receivedModels![0]).not.toHaveProperty('instance');
  });

  test('registers and initializes a model', async () => {
      container.innerHTML = `
        <div data-model="TestModel">
          <span data-bind-message="updateText"></span>
        </div>
      `;

      class TestModel extends SprinculModel {
        beforeInit() {
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

  test('registerAll registers multiple models at once', async () => {
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
        beforeInit() {
          this.state.name = 'John Doe';
        }

        showName(el: HTMLElement) {
          el.textContent = this.state.name;
        }
      }

      class ProductModel extends SprinculModel {
        beforeInit() {
          this.state.title = 'Laptop';
        }

        showTitle(el: HTMLElement) {
          el.textContent = this.state.title;
        }
      }

      class CartModel extends SprinculModel {
        beforeInit() {
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

      // Wait for the init promise to resolve and remove cloaks
      await waitForDomUpdate();

      const model = container.querySelector('[data-model="TestModel"]');
      expect(model?.hasAttribute('data-cloaked')).toBe(false);
  });

  test('logs an error when afterInit throws', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

      container.innerHTML = `<div data-model="AfterInitErrorModel"></div>`;

      class AfterInitErrorModel extends SprinculModel {
        afterInit() {
          throw new Error('hook failed');
        }
      }

      Sprincul.register('AfterInitErrorModel', AfterInitErrorModel);

      Sprincul.init();
      // Wait for the afterInit hook to complete and error to be logged
      await waitForDomUpdate();

      expect(errorSpy).toHaveBeenCalledWith(
        'Error in "afterInit" hook call:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
  });

  test('warns in devMode when a binding callback is not found', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      container.innerHTML = `
        <div data-model="DevModeModel">
          <span data-bind-count="nonExistentFn"></span>
        </div>
      `;

      class DevModeModel extends SprinculModel {}

      Sprincul.register('DevModeModel', DevModeModel);

      Sprincul.init({ devMode: true });

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sprincul] Binding callback "nonExistentFn" not found for data-bind-count.'
      );
      warnSpy.mockRestore();
  });

  test('dispatches sprincul:ready event after all models initialized', async () => {
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

  test('processes nested models', async () => {
      container.innerHTML = `
        <div data-model="OuterModel">
          <span data-bind-outer="updateOuter"></span>
          <div data-model="InnerModel">
            <span data-bind-inner="updateInner"></span>
          </div>
        </div>
      `;

      class OuterModel extends SprinculModel {
        beforeInit() {
          this.state.outer = 'Outer';
        }

        updateOuter(el: HTMLElement) {
          el.textContent = this.state.outer;
        }
      }

      class InnerModel extends SprinculModel {
        beforeInit() {
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

  test('beforeInit runs synchronously even when async - state is available to bindings immediately after init', async () => {
      container.innerHTML = `
        <div data-model="AsyncBeforeInit">
          <span data-bind-message="updateMessage"></span>
        </div>
      `;

      class AsyncBeforeInit extends SprinculModel {
        async beforeInit() {
          this.state.message = 'Hello from async beforeInit!';
          await Promise.resolve();
        }

        updateMessage(el: HTMLElement) {
          el.textContent = this.state.message;
        }
      }

      Sprincul.register('AsyncBeforeInit', AsyncBeforeInit);
      Sprincul.init();

      const span = container.querySelector('span');
      expect(span?.textContent).toBe('Hello from async beforeInit!');
  });
});
