# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `beforeInit(defaults)` for hydrating initial state from server-rendered markup. See [Lifecycle and Hydration](https://github.com/ShakimaMF/sprincul/wiki/Lifecycle-and-Hydration).
- Add `beforeDestroy()` lifecycle hook for cleaning up anything a model subscribed to or started itself. See [Lifecycle and Hydration](https://github.com/ShakimaMF/sprincul/wiki/Lifecycle-and-Hydration).
- Add `wire(element)` for binding newly added content within a live model without mounting a new one. See [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content).
- Add `unwire(element)` for releasing bindings/listeners on a subtree before discarding it, so components that rebuild part of their own DOM on every render don't leak. See [Wiring Dynamic Content](https://github.com/ShakimaMF/sprincul/wiki/Wiring-Dynamic-Content).
- Add `options` parameter to `Sprincul.mount()`, with `onReady` and `devMode` (`devMode` was previously `init()`-only). Add a `root` option to `init()`. See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting).
- Add `Sprincul.destroyAll()` to tear down every live model instance at once.

### Changed

- `Sprincul.onReady()` and the `sprincul:ready` DOM event have been replaced by the `onReady` option on `init()`/`mount()`.

### Removed

- **Breaking:** Sprincul no longer cleans anything up automatically on DOM changes: neither destroying a model whose element is removed, nor purging bindings/listeners for descendants removed from within it. See [Mounting and Unmounting](https://github.com/ShakimaMF/sprincul/wiki/Mounting-and-Unmounting).

### Fixed

- Fix a race where destroying and remounting a model on the same element within one synchronous tick could register its bindings twice, causing duplicate callback invocations
- Fix a model whose constructor or binding setup throws leaving its element permanently unmountable, with `unmount()` unable to recover it
- Warn when `unmount()`/`destroy()` is given a model name that doesn't match the instance mounted on the element, instead of silently doing nothing
- Fix any attribute starting with `on` (such as `once`, `one`, `only`) being treated as an event handler and stripped from the DOM; only attributes the DOM exposes as real event handlers are bound now
- Fix an element bound to both a state property and a computed property derived from it running its callback twice for a single change; each callback now runs at most once per element per frame

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

[0.3.0]: https://github.com/ShakimaMF/sprincul/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ShakimaMF/sprincul/compare/v0.1.0...v0.2.1
[0.1.0]: https://github.com/ShakimaMF/sprincul/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/ShakimaMF/sprincul/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.0.1
