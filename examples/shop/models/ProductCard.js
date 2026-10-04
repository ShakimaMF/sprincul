import { SprinculModel } from "sprincul";
import { Cart } from "../lib/cart.js";

/*
 * One product tile. Its name, category, and starting quantity come from the server-rendered text of their bound
 * elements, and its photo from a ref; only the id and raw price, which the page doesn't show as-is, come from data
 * attributes on its root.
 * It keeps its "in cart" badge in sync through the global store.
 */
export default class ProductCard extends SprinculModel {
	/** @param {import("sprincul").BoundDefaults} defaults */
	beforeInit(defaults) {
		this.state.name = defaults.name?.text.trim() ?? "";
		this.state.category = defaults.category?.text.trim() ?? "";
		this.state.qty = Number(defaults.qty?.text) || 1;
		this.state.visible = true;

		this.product = {
			id: this.$data("id", ""),
			name: this.state.name,
			price: this.$data("price", 0),
			image: this.$ref("photo")?.getAttribute("src") ?? "",
		};
		this.state.inCart = Cart.qtyOf(this.product.id);

		Cart.onChange(() => (this.state.inCart = Cart.qtyOf(this.product.id)), this.$signal);
	}

	/**
	 * Called by the Catalog containing this card. Returns whether the card is shown.
	 * @param {{ query: string, category: string }} filter
	 */
	applyFilter({ query, category }) {
		const inCategory = category === "all" || category === this.state.category.toLowerCase();
		this.state.visible = inCategory && this.state.name.toLowerCase().includes(query.toLowerCase());
		return this.state.visible;
	}

	increment() {
		this.state.qty++;
	}

	decrement() {
		this.state.qty = Math.max(1, this.state.qty - 1);
	}

	add() {
		Cart.add(this.product, this.state.qty);
		this.state.qty = 1;
		Cart.open();
	}

	/** @param {HTMLElement} el */
	showVisible(el) {
		el.hidden = !this.state.visible;
	}

	/** @param {HTMLElement} el */
	showName(el) {
		el.textContent = this.state.name;
	}

	/** @param {HTMLElement} el */
	showCategory(el) {
		el.textContent = this.state.category;
	}

	/** @param {HTMLOutputElement} el */
	showQty(el) {
		el.value = String(this.state.qty);
	}

	/** @param {HTMLElement} el */
	showInCart(el) {
		el.hidden = this.state.inCart === 0;
		el.textContent = `${this.state.inCart} in cart`;
	}
}
