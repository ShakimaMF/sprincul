# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `data-watch` for an element whose contents change often, which wires the content added inside it and releases the content removed from it. See [Watching an element](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content#watching-an-element).
- Add a `devMode` warning for `$emit()` event names with uppercase letters, which `data-on-*` can't listen for. See [Model Events](https://github.com/ShakimaMF/sprincul/wiki/Model-Events).

### Changed

- **Breaking:** `data-on-*` handlers receive the element with the attribute first and the event second, like binding callbacks. A handler that uses its event changes from `save(e)` to `save(el, e)`. See [Handler arguments](https://github.com/ShakimaMF/sprincul/wiki/Events#handler-arguments).
- Calling `wire()` again on content you've rebuilt binds what's new and releases what's gone. See [Rebuilding wired content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content#rebuilding-wired-content).
- `unwire()` also releases wired content that was removed before it was called.

### Removed

- **Breaking:** Native `on*` attributes are no longer bound to model methods and are left to the browser. Use `data-on-*` instead (`onclick="save"` becomes `data-on-click="save"`).
- **Breaking:** The transitional `processNativeEvents` option is removed.

### Fixed

- Fix content inside a custom element that hasn't mounted yet being bound to the surrounding model, by `wire()` or `data-watch`. A registered custom element's tag is a model root from the start.
- Fix camelCase `data-bind-*` names such as `data-bind-buttonText` never updating; names now match state keys in any case, including in `beforeInit()`'s defaults.

## [0.5.0] - 2026-10-12

### Added

- Add `data-on-<event>` attributes as the preferred way to bind events, safe under a strict CSP. Unlike native `on<event>` attributes, which still work, they stay in the DOM once bound. When an element has both for the same event, `data-on-<event>` wins and a `devMode` warning is logged. See [Events](https://github.com/ShakimaMF/sprincul/wiki/Events).
- Add a transitional `processNativeEvents` option to `init()` and `mount()` (default `true`). Set `false` to opt in early to native `on*` attributes being left to the browser. See [Events](https://github.com/ShakimaMF/sprincul/wiki/Events#native-on-attributes).
- Add `Sprincul.setOption()` for page-wide defaults, and `static options` for a model to set its own `devMode` and `processNativeEvents`. Options passed to `init()`/`mount()` override a model's, which override `setOption()`. See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting#initialization-options).
- Add a `customElement` model option for giving a model its own custom element, which mounts the model when added to the page and unmounts it when removed. See [Custom Elements](https://github.com/ShakimaMF/sprincul/wiki/Custom-Elements).
- Export the `SprinculOptions` and `SprinculModelOptions` types.

### Deprecated

- Binding native `on<event>` attributes to model methods: use `data-on-<event>` instead. It still works for now and warns once per page.

## [0.4.0] - 2026-10-04

### Added

- Add `data-ref` with `$ref()` / `$refs()` for reading elements within a model. See [Refs](https://github.com/ShakimaMF/sprincul/wiki/Refs).
- Add `$data(name, fallback)` for reading typed config from a model root's data attributes. See [Model Data](https://github.com/ShakimaMF/sprincul/wiki/Model-Data).
- Add `$child()` / `$children()` and `$parent()` for reaching nested and parent models. See [Refs](https://github.com/ShakimaMF/sprincul/wiki/Refs#reaching-nested-and-parent-models).
- Add `$emit()`, `$listen()`, and `$signal` for events between models and cleanup on destroy, and a `signal` option on `Sprincul.store.subscribe()`. See [Model Events](https://github.com/ShakimaMF/sprincul/wiki/Model-Events).
- `wire()` and `init({ root })` take a `DocumentFragment` or detached element, so content can be bound before it's appended. See [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content#wiring-before-appending).
- Export the `BoundDefaults`, `BoundElementDefault`, `BoundElementInput`, `SprinculInitOptions`, and `SprinculMountOptions` types.
- Add a product listing example with a side cart in `examples/`, run with `bun run example`.

### Changed

- **Breaking:** `data-bind-*` names follow the `dataset` rule: `data-bind-button-text` binds `state.buttonText` (and `defaults.buttonText`) instead of `state["button-text"]`. See [Data Bindings](https://github.com/ShakimaMF/sprincul/wiki/Data-Bindings).
- `init()` mounts nested models before the models containing them, so a parent's `afterInit()` finds its children mounted. In `destroyAll()`, a parent's `beforeDestroy()` (including an async one) now settles before its children are torn down.
- **Breaking:** `unmount(el)` also tears down every model inside `el` and works on an element without a model of its own (the reverse of `init({ root })`). See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting).
- `unmount()`, `destroy()`, and `destroyAll()` return a promise that resolves once every `beforeDestroy()` has settled. A model whose teardown fails is logged and doesn't stop the rest.
- `registerAll()` skips values that aren't `SprinculModel` classes, with a warning.

### Deprecated

- Second parameter of `unmount(el, modelName)` and `destroy(modelName, el)`: use `unmount(el)` and `destroy(modelName)` instead. Both still work for now and warn once.

### Fixed

- Fix `registerAll()` rejecting a module namespace (`import * as models`) or an interface-typed object in TypeScript.

## [0.3.0] - 2026-09-24

### Added

- Add `beforeInit(defaults)` for hydrating initial state from server-rendered markup. See [Lifecycle and Hydration](https://github.com/ShakimaMF/sprincul/wiki/Lifecycle-and-Hydration).
- Add `beforeDestroy()` lifecycle hook for cleaning up anything a model subscribed to or started itself. See [Lifecycle and Hydration](https://github.com/ShakimaMF/sprincul/wiki/Lifecycle-and-Hydration).
- Add `wire(element)` for binding newly added content within a live model without mounting a new one. See [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content).
- Add `unwire(element)` for releasing what `wire()` registered on a subtree before discarding it. See [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content).
- Add `options` parameter to `Sprincul.mount()`, with `onReady` and `devMode` (`devMode` was previously `init()`-only). Add a `root` option to `init()`. See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting).
- Add `Sprincul.destroyAll()` to tear down every live model instance at once.

### Changed

- `Sprincul.onReady()` and the `sprincul:ready` DOM event have been replaced by the `onReady` option on `init()`/`mount()`.

### Removed

- **Breaking:** Sprincul no longer cleans anything up automatically on DOM changes: neither destroying a model whose element is removed, nor purging bindings/listeners for descendants removed from within it. See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting).

### Fixed

- Fix a race where destroying and remounting a model on the same element within one synchronous tick could register its bindings twice, causing duplicate callback invocations
- Fix a model whose constructor or binding setup throws leaving its element permanently unmountable
- Warn when `unmount()`/`destroy()` is given a model name that doesn't match the element's instance
- Fix non-event attributes starting with `on` (such as `once`, `one`, `only`) being bound as event handlers and stripped from the DOM
- Fix an element bound to both a state property and a computed derived from it rendering twice per change

## [0.2.1] - 2026-05-20

### Changed

- Return `null` from `processModelElement()` with console warnings instead of throwing errors for missing or unregistered models
- Exclude model instances from `sprincul:ready` event and `onReady` callbacks in production mode
- Bump `@happy-dom/global-registrator` from 20.8.x to 20.9.x
- Bump `@types/bun` from 1.3.11 to 1.3.14
- Bump `typescript` from 6.0.2 to 6.0.3
- Bump `nanostores` from 1.2.0 to 1.3.0

### Added

- Add `mount()` method to manually mount a model instance on a specific element
- Add `unmount()` method to cleanly remove a model from an element

## [0.1.0] - 2026-04-06

### Changed

- Refactor monolithic class into separate modules (`Sprincul`, `SprinculCore`, `SprinculModel`, `registry`)

### Added

- Add global `sprincul:ready` event dispatched on `document` when initialization is complete
- Add `onReady(callback)` API for programmatic lifecycle hooks
- Add bulk model registration API
- Add `destroy(model[, element])` teardown method with optional element scope
- Add `SprinculModel` as named export
- Include active model instances in `devMode` readiness payload

### Fixed

- Fix cloaking removal timing with separate model-level and page-level removal paths

## [0.0.2] - 2026-04-05

### Fixed

- Fix missing TypeScript type definitions

## [0.0.1] - 2026-04-05

_Initial release._

[Unreleased]: https://github.com/ShakimaMF/sprincul/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/ShakimaMF/sprincul/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ShakimaMF/sprincul/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ShakimaMF/sprincul/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ShakimaMF/sprincul/compare/v0.1.0...v0.2.1
[0.1.0]: https://github.com/ShakimaMF/sprincul/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/ShakimaMF/sprincul/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.0.1
