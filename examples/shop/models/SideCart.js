import { SprinculModel } from "sprincul";
import { Cart } from "../lib/cart.js";
import { Pricing } from "../lib/pricing.js";

/*
 * The slide-out cart. Its rows are cloned from a <template>, wired, and appended on every change to the cart
 * or the discount, and its totals are computed properties.
 */
export default class SideCart extends SprinculModel {
	/** The element focused before the cart opened, refocused when it closes. */
	#returnFocus = null;

	beforeInit() {
		this.state.open = false;
		this.state.placed = false;
		this.state.lines = Cart.getLines();
		this.state.percentOff = 0;
		this.state.codeError = "";
		this.state.codeOpen = false;

		this.addComputedProp("count", () => Cart.count(this.state.lines), ["lines"]);
		this.addComputedProp("subtotal", () => Cart.total(this.state.lines), ["lines"]);
		this.addComputedProp("total", () => this.#discountedTotal(), ["lines", "percentOff"]);
		this.addComputedProp("discount", () => Cart.total(this.state.lines) - this.#discountedTotal(), [
			"lines",
			"percentOff",
		]);

		Cart.onChange((lines) => {
			this.state.lines = lines;
			if (lines.length) this.state.placed = false;
		}, this.$signal);
		Cart.onToggle((open) => (this.state.open = open), this.$signal);
	}

	afterInit() {
		this.$listen(document, "keydown", (e) => {
			if (e.key === "Escape" && this.state.open) this.close();
		});
	}

	close() {
		Cart.close();
	}

	/** @param {MouseEvent} e */
	increment(e) {
		const id = this.#lineId(e);
		Cart.setQty(id, Cart.qtyOf(id) + 1);
	}

	/** @param {MouseEvent} e */
	decrement(e) {
		const id = this.#lineId(e);
		Cart.setQty(id, Cart.qtyOf(id) - 1);
	}

	/** @param {MouseEvent} e */
	remove(e) {
		Cart.remove(this.#lineId(e));
	}

	toggleCode() {
		this.state.codeOpen = !this.state.codeOpen;
	}

	/** @param {SubmitEvent} e */
	applyCode(e) {
		e.preventDefault();
		const input = this.$ref("code");
		const code = input.value.trim();
		if (!code) return;

		const percent = Pricing.percentOffFor(code);
		this.state.codeError = percent ? "" : `"${code}" isn't a valid code.`;
		if (!percent) return;

		this.state.percentOff = percent;
		input.value = "";
	}

	removeCode() {
		this.state.percentOff = 0;
	}

	clear() {
		Cart.clear();
	}

	checkout() {
		Cart.clear();
		this.state.percentOff = 0;
		this.state.codeError = "";
		this.state.codeOpen = false;
		this.state.placed = true;
	}

	/** @param {HTMLElement} el */
	showOpen(el) {
		el.classList.toggle("open", this.state.open);
		el.inert = !this.state.open;

		if (this.state.open) {
			this.#returnFocus = document.activeElement;
			this.$ref("close").focus();
			return;
		}

		this.#returnFocus?.focus();
		this.#returnFocus = null;
	}

	/** @param {HTMLUListElement} list */
	renderLines(list) {
		// Release the old rows' listeners before replacing them
		this.unwire(list);

		const rows = document.createDocumentFragment();
		const template = this.$ref("line");

		this.state.lines.forEach((line) => {
			const row = template.content.firstElementChild.cloneNode(true);
			row.dataset.id = line.id;
			row.querySelector(".name").textContent = line.name;

			const thumb = row.querySelector(".thumb");
			thumb.hidden = !line.image;
			if (line.image) thumb.src = line.image;

			const price = line.price * line.qty;
			const was = row.querySelector(".was");
			was.hidden = !this.state.percentOff;
			was.textContent = Pricing.format(price);
			row.querySelector(".now").textContent = Pricing.format(Pricing.discounted(price, this.state.percentOff));
			row.querySelector("output").value = String(line.qty);
			rows.append(row);
		});

		this.wire(rows);
		list.replaceChildren(rows);
	}

	/** @param {HTMLElement} el */
	showEmpty(el) {
		el.hidden = this.state.count > 0;
		el.textContent = this.state.placed ? "Thanks! Your order is on its way." : "Your cart is empty.";
	}

	/** @param {HTMLElement} el */
	showSubtotal(el) {
		el.textContent = Pricing.format(this.state.subtotal);
	}

	/** @param {HTMLButtonElement} el */
	showCodeToggle(el) {
		el.setAttribute("aria-expanded", String(this.state.codeOpen));

		// Swap the chevron by pointing the <use> at another symbol in the same spritesheet
		const use = el.querySelector("use");
		use.setAttribute(
			"href",
			use.getAttribute("href").replace(/#.*$/, this.state.codeOpen ? "#angle-up" : "#angle-down"),
		);
	}

	/** @param {HTMLFormElement} el */
	showCodeForm(el) {
		el.hidden = !this.state.codeOpen;
		if (this.state.codeOpen) this.$ref("code").focus();
	}

	/** @param {HTMLElement} el */
	showApplied(el) {
		el.hidden = !this.state.percentOff;
		el.querySelector("span").textContent = `${this.state.percentOff}OFF applied`;
	}

	/** @param {HTMLElement} el */
	showCodeError(el) {
		el.hidden = !this.state.codeError;
		el.textContent = this.state.codeError;
	}

	/** @param {HTMLElement} el */
	showDiscount(el) {
		el.hidden = !this.state.percentOff;
		el.querySelector("span").textContent = `Discount (${this.state.percentOff}%)`;
		el.querySelector("strong").textContent = `-${Pricing.format(this.state.discount)}`;
	}

	/** @param {HTMLElement} el */
	showTotal(el) {
		el.textContent = Pricing.format(this.state.total);
	}

	/** @param {HTMLButtonElement} el */
	showClear(el) {
		el.hidden = this.state.count === 0;
	}

	/** @param {HTMLButtonElement} el */
	toggleCheckout(el) {
		el.disabled = this.state.count === 0;
	}

	#discountedTotal() {
		const { lines, percentOff } = this.state;
		return lines.reduce((sum, line) => sum + Pricing.discounted(line.price * line.qty, percentOff), 0);
	}

	/** @param {MouseEvent} e */
	#lineId(e) {
		return e.currentTarget.closest("[data-id]").dataset.id;
	}
}
