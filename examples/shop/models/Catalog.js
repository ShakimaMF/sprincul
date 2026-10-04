import { SprinculModel } from "sprincul";

/*
 * The product listing. It listens for ProductFilters' "filter" event and asks each ProductCard whether it matches.
 */
export default class Catalog extends SprinculModel {
	beforeInit() {
		this.state.shown = 0;
		this.state.total = 0;
	}

	afterInit() {
		// Nested models mount first, so every card is ready here
		this.cards = this.$children("product");
		this.state.total = this.cards.length;
		this.state.shown = this.cards.length;

		this.$listen("filter", (e) => this.applyFilter(e.detail));
	}

	/** @param {{ query: string, category: string }} filter */
	applyFilter(filter) {
		this.state.shown = this.cards.filter((card) => card.applyFilter(filter)).length;
	}

	/** @param {HTMLElement} el */
	showCount(el) {
		el.textContent = `Showing ${this.state.shown} of ${this.state.total} products`;
	}

	/** @param {HTMLElement} el */
	showEmpty(el) {
		el.hidden = this.state.shown > 0;
	}
}
