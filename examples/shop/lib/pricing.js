const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const Pricing = {
	/** @param {number} amount */
	format(amount) {
		return currency.format(amount);
	},

	/**
	 * Reads a code shaped like "25OFF": 1 to 100 percent off. Returns the percent, or 0 if the code isn't valid.
	 * @param {string} code
	 */
	percentOffFor(code) {
		const match = /^(\d{1,3})OFF$/i.exec(code.trim());
		const percent = match ? Number(match[1]) : 0;
		return percent >= 1 && percent <= 100 ? percent : 0;
	},

	/**
	 * The amount left after taking `percent` off, rounded to the cent.
	 * @param {number} amount
	 * @param {number} percent
	 */
	discounted(amount, percent) {
		return Math.round(amount * (100 - percent)) / 100;
	},
};
