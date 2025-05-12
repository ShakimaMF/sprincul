import Sprincul from "../../src/Sprincul.js";

export default class GroceryList extends Sprincul {

	constructor(element) {
		super(element);
	}

	randId() {
		return Math.random().toString(36).slice(2, 12)
	}

	connectedCallback() {
		this.populateListItems();
		this.updateItemCount();
		this.setActiveTab();
	}

	populateListItems() {
		this.state.masterList = [
			{ key: this.randId(), label: 'Eggs', completed: false, order: 1 },
			{ key: this.randId(), label: 'Milk', completed: true, order: 2 },
			{ key: this.randId(), label: 'Bread', completed: false, order: 3 },
			{ key: this.randId(), label: 'Cheese', completed: true, order: 4 }
		];
		this.applyFilter();
	}

	setActiveTab(event = null, tab = null) {
		if (event) {
			event.preventDefault();
			this.state.activeTab = event.target.id;
		} else {
			this.state.activeTab = tab ?? 'all';
		}
		this.state.tabIsSelected = el => this.state.activeTab === el.id;
		this.applyFilter();
	}

	applyFilter() {
		const currentItems = [...this.state.masterList];
		if (this.state.activeTab === 'completed') {
			this.state.listItems = currentItems.filter(item => item.completed);
			return;
		}
		if (this.state.activeTab === 'pending') {
			this.state.listItems = currentItems.filter(item => !item.completed);
			return;
		}
		this.state.listItems = currentItems;
	}

	addListItem(event) {
		event.preventDefault();
		if (!this.state.newlistItem?.trim()) return;

		const newItem = {
			key: this.randId(),
			label: this.state.newlistItem,
			completed: false
		};

		this.state.masterList.push(newItem);
		this.state.newlistItem = '';
		this.applyFilter();
		this.updateItemCount();
	}

	toggleListItem(event) {
		const listItemKey = event.target.closest('[data-key]').dataset.key;
		const listItem = this.state.masterList.find(item => item.key === listItemKey);

		if (listItem) {
			listItem.completed = !listItem.completed;
			this.applyFilter();
			this.updateItemCount();
		}
	}

	deleteListItem(event) {
		const listItemKey = event.target.closest('[data-key]').dataset.key;
		this.state.masterList = this.state.masterList.filter(item => item.key !== listItemKey);
		this.applyFilter();
		this.updateItemCount();
	}

	clearCompleted() {
		this.state.masterList = this.state.masterList.filter(item => !item.completed);
		this.applyFilter();
		this.updateItemCount();
	}

	updateItemCount() {
		this.state.itemCount = this.state.listItems.filter(listItem => !listItem.completed).length;
	}

	refreshList() {
		this.populateListItems();
		this.setActiveTab();
	}
}
