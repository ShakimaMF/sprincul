# Changelog

## 0.2.0 - 2026-05-19

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

## 0.1.0 - 2026-04-06

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

## 0.0.2 - 2026-04-05

### Fixed

- Fix missing TypeScript type definitions

## 0.0.1 - 2026-04-05

_Initial release._

[0.2.0]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.2.0
[0.1.0]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.1.0
[0.0.2]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.0.2
[0.0.1]: https://github.com/ShakimaMF/sprincul/releases/tag/v0.0.1
