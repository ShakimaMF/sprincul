import { SprinculModel } from "sprincul";

/*
 * Search and category controls. It only announces the filter; the Catalog containing it decides what to show.
 */
export default class ProductFilters extends SprinculModel {
	static options = { customElement: "product-filters" };

	update() {
		this.$emit("filter", { query: this.$ref("search").value.trim(), category: this.$ref("category").value });
	}

	/**
	 * @param {HTMLFormElement} el
	 * @param {SubmitEvent} e
	 */
	preventSubmit(el, e) {
		e.preventDefault();
	}
}
