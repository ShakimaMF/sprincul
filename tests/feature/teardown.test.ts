/// <reference lib="dom" />
import { expect, test, describe, spyOn } from "bun:test";
import { waitForDomUpdate } from "../helpers.ts";

describe('Sprincul - Teardown', () => {
    test('destroy(modelName) tears down all instances for that model', async () => {
      container.innerHTML = `
        <div data-model="DestroyByNameModel" id="one">
          <button onclick="increment">+</button>
          <span data-bind-count="showCount"></span>
        </div>
        <div data-model="DestroyByNameModel" id="two">
          <button onclick="increment">+</button>
          <span data-bind-count="showCount"></span>
        </div>
      `;

      class DestroyByNameModel extends SprinculModel {
        beforeInit() {
          this.state.count = 0;
        }

        increment() {
          this.state.count++;
        }

        showCount(el: HTMLElement) {
          el.textContent = String(this.state.count);
        }
      }

      Sprincul.register('DestroyByNameModel', DestroyByNameModel);
      Sprincul.init();

      const one = container.querySelector('#one') as HTMLElement;
      const two = container.querySelector('#two') as HTMLElement;
      const oneButton = one.querySelector('button') as HTMLButtonElement;
      const twoButton = two.querySelector('button') as HTMLButtonElement;
      const oneCount = one.querySelector('[data-bind-count]') as HTMLElement;
      const twoCount = two.querySelector('[data-bind-count]') as HTMLElement;

      oneButton.click();
      twoButton.click();
      await waitForDomUpdate();

      expect(oneCount.textContent).toBe('1');
      expect(twoCount.textContent).toBe('1');

      Sprincul.destroy('DestroyByNameModel');

      oneButton.click();
      twoButton.click();
      await waitForDomUpdate();

      expect(oneCount.textContent).toBe('1');
      expect(twoCount.textContent).toBe('1');
  });

  test('destroy(modelName, element) tears down only the matching instance', async () => {
      container.innerHTML = `
        <div data-model="ScopedDestroyModel" id="first">
          <button onclick="increment">+</button>
          <span data-bind-count="showCount"></span>
        </div>
        <div data-model="ScopedDestroyModel" id="second">
          <button onclick="increment">+</button>
          <span data-bind-count="showCount"></span>
        </div>
      `;

      class ScopedDestroyModel extends SprinculModel {
        beforeInit() {
          this.state.count = 0;
        }

        increment() {
          this.state.count++;
        }

        showCount(el: HTMLElement) {
          el.textContent = String(this.state.count);
        }
      }

      Sprincul.register('ScopedDestroyModel', ScopedDestroyModel);
      Sprincul.init();

      const firstRoot = container.querySelector('#first') as HTMLElement;
      const secondRoot = container.querySelector('#second') as HTMLElement;
      const firstButton = firstRoot.querySelector('button') as HTMLButtonElement;
      const secondButton = secondRoot.querySelector('button') as HTMLButtonElement;
      const firstCount = firstRoot.querySelector('[data-bind-count]') as HTMLElement;
      const secondCount = secondRoot.querySelector('[data-bind-count]') as HTMLElement;

      firstButton.click();
      secondButton.click();
      await waitForDomUpdate();

      expect(firstCount.textContent).toBe('1');
      expect(secondCount.textContent).toBe('1');

      Sprincul.destroy('ScopedDestroyModel', firstRoot);

      firstButton.click();
      secondButton.click();
      await waitForDomUpdate();

      expect(firstCount.textContent).toBe('1');
      expect(secondCount.textContent).toBe('2');
  });

  test('destroy(modelName, element) works for a removed parent model element', async () => {
      container.innerHTML = `
        <div data-model="RemovedParentModel" id="parent-root">
          <button onclick="increment">+</button>
          <span data-bind-count="showCount"></span>
        </div>
      `;

      class RemovedParentModel extends SprinculModel {
        beforeInit() {
          this.state.count = 0;
        }

        increment() {
          this.state.count++;
        }

        showCount(el: HTMLElement) {
          el.textContent = String(this.state.count);
        }
      }

      Sprincul.register('RemovedParentModel', RemovedParentModel);
      Sprincul.init();

      const root = container.querySelector('#parent-root') as HTMLElement;
      const button = root.querySelector('button') as HTMLButtonElement;
      const count = root.querySelector('[data-bind-count]') as HTMLElement;

      button.click();
      await waitForDomUpdate();
      expect(count.textContent).toBe('1');

      root.remove();
      Sprincul.destroy('RemovedParentModel', root);

      container.appendChild(root);
      button.click();
      await waitForDomUpdate();

      expect(count.textContent).toBe('1');
  });

  test('body-level observer reacts to parent removal and calls destroy for removed model roots', async () => {
      container.innerHTML = `
        <section id="wrapper">
          <div data-model="ObservedModel" id="observed-root"></div>
        </section>
      `;

      class ObservedModel extends SprinculModel {}

      Sprincul.register('ObservedModel', ObservedModel);
      Sprincul.init();

      const destroySpy = spyOn(Sprincul, 'destroy');
      const wrapper = container.querySelector('#wrapper') as HTMLElement;
      const observedRoot = container.querySelector('#observed-root') as HTMLElement;

      wrapper.remove();
      await waitForDomUpdate();
      await waitForDomUpdate();

      expect(destroySpy).toHaveBeenCalled();

      const matchingCall = destroySpy.mock.calls.find(([name, element]) => {
        return name === 'ObservedModel' && (element as HTMLElement | undefined)?.id === observedRoot.id;
      });

      expect(matchingCall?.[0]).toBe('ObservedModel');
      expect(matchingCall?.[1]).toBe(observedRoot);
      destroySpy.mockRestore();
  });
});
