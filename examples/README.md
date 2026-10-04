# Examples

Run one with `bun run example [name]` from the package root, then open http://localhost:3000. The server builds Sprincul from `src`, so there's no build step.

## shop

[Live demo](https://shakimamf.github.io/sprincul/). A product listing with search, category filters, and a slide-out cart that persists to `localStorage`. Enter a code like `25OFF` (any number from 1 to 100) in the cart to apply a discount.

```
shop/
├── index.html         server-rendered markup: every data-model, binding, and event attribute
├── register.js        loaded in <head>: registers every model
├── main.js            loaded at the end of <body>: calls Sprincul.init()
├── images/          product photos and icon-spritesheet.svg, used with <use href>
├── models/
│   ├── index.js       exports every model by its data-model name
│   ├── Catalog.js
│   ├── CartToggle.js
│   ├── ProductCard.js
│   ├── ProductFilters.js
│   └── SideCart.js
└── lib/
    ├── cart.js        cart state in the global store, shared by every model
    └── pricing.js     price formatting and XXOFF discount codes
```

### Registering apart from mounting

`register.js` imports `models/index.js` as a namespace and passes it straight to `registerAll()`, since each export is named after its `data-model`. Registration needs no DOM, so it can run from `<head>` on every page, and `main.js` calls `init()` once the markup is there. Both files import `sprincul` through the same import map entry, so they share one registry.

### What each model shows

| Model            | Shows                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Catalog`        | `$children()` to reach nested models, `$listen()` for an event from a nested model                                                              |
| `ProductFilters` | `$ref()`, `$emit()`                                                                                                                             |
| `ProductCard`    | Seeding state from server-rendered `defaults` in `beforeInit()`, `$data()`, a store subscription cleaned up with `$signal`                      |
| `CartToggle`     | Reacting to the global store from a model far from the cart                                                                                     |
| `SideCart`       | Computed totals that follow both the cart and the discount, rows cloned from a `<template>` with `wire()`/`unwire()`, `$listen()` on `document` |
