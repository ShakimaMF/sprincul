// @ts-ignore
import {expect, test, describe, afterEach, beforeAll} from 'vitest';
import {Sprincul} from "../src/index.js";
// @ts-ignore
import {waitForDomUpdate} from "./helpers.js";

let container: HTMLElement;

beforeAll(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
})

afterEach(() => {
	container.innerHTML = '';
})

describe('Basic functionality test suite', () => {
	test('A simple button counter works reactively', async () => {
		const Counter = class extends Sprincul {
			constructor(element: HTMLElement) {
				super(element);
				this.state.count = 0;
			}
			increase() {
				this.state.count++;
			}
			decrease() {
				this.state.count--;
			}
		}

		// Set up the HTML in the container
		container.innerHTML = `
		<main data-model="Counter">
			<button id="inc" data-evt="click: increase">Increment</button>
			<span data-text="count"></span>
			<button id="dec" data-evt="click: decrease">Decrement</button>
		</main>
		`.trim();

		// Register and initialize
		Sprincul.register('Counter', Counter);
		Sprincul.init();

		// Get the span element
		const span = container.querySelector('span');
		expect(span?.textContent).toBe('0');

		const decrementButton = container.querySelector('#dec') as HTMLButtonElement;
		const incrementButton = container.querySelector('#inc') as HTMLButtonElement;

		[...Array(3)].forEach(() => {incrementButton.click()})
		await waitForDomUpdate();
		expect(span?.textContent).toBe('3');
		
		[...Array(2)].forEach(() => {decrementButton.click()})
		await waitForDomUpdate();
		expect(span?.textContent).toBe('1');
	});
})
