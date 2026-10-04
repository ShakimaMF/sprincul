import { Sprincul } from "sprincul";

/*
 * The cart lives in the global store, so any model can read or change it.
 * Lines are replaced rather than mutated, so every change reaches subscribers.
 */

/** @typedef {{ id: string, name: string, price: number, image: string, qty: number }} CartLine */

const STORAGE_KEY = "sprincul-shop-cart";

export const Cart = {
	/** @returns {CartLine[]} */
	getLines() {
		return Sprincul.store.get("cart") ?? [];
	},

	/** @param {CartLine[]} lines */
	setLines(lines) {
		Sprincul.store.set("cart", lines);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
		} catch {
			// Storage full or blocked: the cart keeps working for this page view
		}
	},

	/** @param {CartLine[]} lines */
	count(lines) {
		return lines.reduce((sum, line) => sum + line.qty, 0);
	},

	/** @param {CartLine[]} lines */
	total(lines) {
		return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
	},

	/** @param {string} id */
	qtyOf(id) {
		return Cart.getLines().find((line) => line.id === id)?.qty ?? 0;
	},

	/**
	 * @param {Omit<CartLine, "qty">} product
	 * @param {number} qty
	 */
	add(product, qty) {
		const lines = Cart.getLines();
		if (!lines.some((line) => line.id === product.id)) return Cart.setLines([...lines, { ...product, qty }]);
		Cart.setLines(lines.map((line) => (line.id === product.id ? { ...line, qty: line.qty + qty } : line)));
	},

	/**
	 * @param {string} id
	 * @param {number} qty
	 */
	setQty(id, qty) {
		if (qty < 1) return Cart.remove(id);
		Cart.setLines(Cart.getLines().map((line) => (line.id === id ? { ...line, qty } : line)));
	},

	/** @param {string} id */
	remove(id) {
		Cart.setLines(Cart.getLines().filter((line) => line.id !== id));
	},

	clear() {
		Cart.setLines([]);
	},

	open() {
		Sprincul.store.set("cartOpen", true);
	},

	close() {
		Sprincul.store.set("cartOpen", false);
	},

	/**
	 * @param {(lines: CartLine[]) => void} callback
	 * @param {AbortSignal} signal
	 */
	onChange(callback, signal) {
		return Sprincul.store.subscribe("cart", (lines) => callback(lines ?? []), { signal });
	},

	/**
	 * @param {(open: boolean) => void} callback
	 * @param {AbortSignal} signal
	 */
	onToggle(callback, signal) {
		return Sprincul.store.subscribe("cartOpen", (open) => callback(Boolean(open)), { signal });
	},
};

/**
 * @param {any} line
 * @returns {line is CartLine}
 */
function isLine(line) {
	return (
		typeof line?.id === "string" &&
		typeof line.name === "string" &&
		typeof line.image === "string" &&
		Number.isFinite(line.price) &&
		Number.isInteger(line.qty) &&
		line.qty > 0
	);
}

/** @returns {CartLine[]} */
function loadLines() {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		return Array.isArray(saved) && saved.every(isLine) ? saved : [];
	} catch {
		return [];
	}
}

// Seeded on import, before any model mounts, so every model starts from the saved cart
Sprincul.store.set("cart", loadLines());
Sprincul.store.set("cartOpen", false);
