import { SprinculModel } from "sprincul";

/*
 * Search and category controls. It only announces the filter; the Catalog containing it decides what to show.
 */
export default class ProductFilters extends SprinculModel {
	update() {
		this.$emit("filter", { query: this.$ref("search").value.trim(), category: this.$ref("category").value });
	}

	/** @param {SubmitEvent} e */
	preventSubmit(e) {
		e.preventDefault();
	}
}
