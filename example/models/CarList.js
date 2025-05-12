import Sprincul from "../../src/Sprincul.js";
import cars from "../data/cars.json" with {type: "json"};

export default class CarList extends Sprincul {

    #carMasterList = cars;

    constructor(element) {
        super(element);
    }

    connectedCallback() {
        this.clearFilters();
        this.state.filtersVisible = false;
        this.state.searchTerm = '';
        this.state.searchIsEmpty = () => this.state.searchTerm === '';
        this.state.carList = this.#carMasterList;
        this.state.currentPage = 1;
        this.updatePaginationInfo(this.#carMasterList);
        this.setPageCheckFunctions();
        this.state.yearOptions = [
            ...Array.from(new Set(this.#carMasterList.map(car => car.year)))
                .map(year => ({ value: year, label: year.toString() }))
                .sort((a, b) => a.value - b.value)
        ];

        this.state.makeOptions = [
            ...Array.from(new Set(this.#carMasterList.map(car => car.make)))
                .map(make => ({ value: make, label: make }))
                .sort((a, b) => b.value.localeCompare(a.value))
        ];

        this.state.modelOptions = [
            ...Array.from(new Set(this.#carMasterList.map(car => car.model)))
                .map(model => ({ value: model, label: model }))
                .sort((a, b) => b.value.localeCompare(a.value))
        ];

        this.applyFilter();
    }

    setPageCheckFunctions() {
        this.state.isFirstPage = () => this.state.currentPage === 1;
        this.state.isLastPage = () => this.state.currentPage === this.state.totalPages;
    }

    showFilters() {
        this.state.filtersVisible = !this.state.filtersVisible;
    }

    // Reusable method to update pagination information based on filtered items.
    updatePaginationInfo(filteredItems) {
        const totalItems = filteredItems.length;
        this.state.totalCars = totalItems;
        this.state.totalPages = Math.max(1, Math.ceil(totalItems / 10));
        // If the current page is out of bounds, reset to first page.
        if (this.state.currentPage > this.state.totalPages) {
            this.state.currentPage = 1;
        }
    }

    applyFilter() {
        const currentItems = [...this.#carMasterList];
        const filteredItems = currentItems.filter(item => {
            let yearIsSelected = true, makeIsSelected = true, modelIsSelected = true;
            if (this.state.currentYear !== 'all') {
                yearIsSelected = item.year === this.state.currentYear;
            }
            if (this.state.currentMake !== 'all') {
                makeIsSelected = item.make === this.state.currentMake;
            }
            if (this.state.currentModel !== 'all') {
                modelIsSelected = item.model === this.state.currentModel;
            }
            return yearIsSelected && makeIsSelected && modelIsSelected;
        });

        // Update pagination info based on the filtered list.
        this.updatePaginationInfo(filteredItems);

        const offset = 10 * (this.state.currentPage - 1);
        this.state.carList = filteredItems.slice(offset, offset + 10);
    }

    setSearchTerm(event) {
        this.state.searchTerm = event.target.value;
        this.state.searchIsEmpty = () => this.state.searchTerm === '';
    }

    searchCars(event) {
        event.preventDefault();
        const searchTerm = (this.state.searchTerm || '').toLowerCase().trim();
        if (!searchTerm) {
            // When there's no search term, reset to full list.
            this.state.currentPage = 1;
            this.updatePaginationInfo(this.#carMasterList);
            this.state.carList = this.#carMasterList.slice(0, 10);
            this.state.searchIsEmpty = () => this.state.searchTerm === '';
            return;
        }
        const filtered = this.#carMasterList.filter(item => {
            return item.year.toString().includes(searchTerm) ||
                item.make.toLowerCase().includes(searchTerm) ||
                item.model.toLowerCase().includes(searchTerm);
        });
        // Update pagination info for search results.
        this.state.currentPage = 1;
        this.updatePaginationInfo(filtered);
        this.state.carList = filtered.slice(0, 10);
        this.state.searchIsEmpty = () => this.state.searchTerm === '';
    }

    clearSearch() {
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        this.updatePaginationInfo(this.#carMasterList);
        this.state.carList = this.#carMasterList.slice(0, 10);
        this.state.searchIsEmpty = () => this.state.searchTerm === '';
    }

    filterByYear(event) {
        const value = event.target.value;
        this.state.currentYear = value === 'all' ? value : Number(value);
        this.applyFilter();
    }

    filterByMake(event) {
        this.state.currentMake = event.target.value;
        this.applyFilter();
    }

    filterByModel(event) {
        this.state.currentModel = event.target.value;
        this.applyFilter();
    }

    pageForward() {
        this.state.currentPage = this.state.currentPage + 1;
        this.setPageCheckFunctions();
        this.applyFilter();
    }

    pageBack() {
        this.state.currentPage = this.state.currentPage - 1;
        this.setPageCheckFunctions();
        this.applyFilter();
    }

    clearFilters() {
        this.state.currentYear = 'all';
        this.state.currentMake = 'all';
        this.state.currentModel = 'all';
        this.state.currentPage = 1;
        this.state.searchIsEmpty = () => this.state.searchTerm === '';
    }
}
