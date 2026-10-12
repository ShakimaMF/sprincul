# Examples

Run one with `bun run example [name]` from the package root, then open http://localhost:3000. The server builds Sprincul from `src`, so there's no build step.

## shop

[Live demo](https://shakimamf.github.io/sprincul/). A product listing with search, category filters, and a slide-out cart that persists to `sessionStorage`. Enter a code like `25OFF` (any number from 1 to 100) in the cart to apply a discount.

```
shop/
├── index.html         server-rendered markup: every model's custom element, binding, and event attribute
├── register.js        registers every model, which defines their custom elements
├── images/          product photos and icon-spritesheet.svg, used with <use href>
├── models/
│   ├── index.js       exports every model
│   ├── Catalog.js
│   ├── CartToggle.js
│   ├── ProductCard.js
│   ├── ProductFilters.js
│   └── SideCart.js
└── lib/
    ├── cart.js        cart state in the global store, shared by every model
    └── pricing.js     price formatting and XXOFF discount codes
```

### Every model is a custom element

Each model sets `static options = { customElement: "..." }`, so `register.js` only has to pass `models/index.js` to `registerAll()`: that defines `<product-catalog>`, `<product-card>`, and the rest, and each element mounts its own model. There's no `init()` call, and removing an element cleans up its model. A custom element can't stand in for `<main>`, `<form>`, `<article>`, or `<aside>`, so each one wraps that element, with `display: contents` so it adds no box of its own. See [Custom Elements](https://github.com/ShakimaMF/sprincul/wiki/Custom-Elements).

### What each model shows

| Model            | Shows                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Catalog`        | `$children()` to reach nested models, `$listen()` for an event from a nested model                                                              |
| `ProductFilters` | `$ref()`, `$emit()`                                                                                                                             |
| `ProductCard`    | Seeding state from server-rendered `defaults` in `beforeInit()`, `$data()`, a store subscription cleaned up with `$signal`                      |
| `CartToggle`     | Reacting to the global store from a model far from the cart                                                                                     |
| `SideCart`       | Computed totals that follow both the cart and the discount, rows cloned from a `<template>` with `wire()`/`unwire()`, `$listen()` on `document` |
