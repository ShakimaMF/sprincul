import { SprinculModel } from "sprincul";
import { Cart } from "../lib/cart.js";

/*
 * The cart button in the page header, with a badge counting the items in the cart.
 */
export default class CartToggle extends SprinculModel {
	beforeInit() {
		this.state.count = Cart.count(Cart.getLines());
		Cart.onChange((lines) => (this.state.count = Cart.count(lines)), this.$signal);
	}

	open() {
		Cart.open();
	}

	/** @param {HTMLElement} el */
	showCount(el) {
		el.hidden = this.state.count === 0;
		el.textContent = String(this.state.count);
	}
}
