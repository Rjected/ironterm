# Dependencies

Ironterm tries to depend on as little third-party code as possible: every package is code that
runs on your machine, in CI, or on your phone, written by someone we don't know. This file lists
every dependency, what we decided for each one, and why.

Decisions:

- **remove**: not needed.
- **platform**: replace with what the platform or standard library already ships (WebCrypto,
  `node:test`, `HttpURLConnection`, Android Keystore, `org.json`…).
- **in-repo**: reimplement just the part we use, with tests, under [`web/packages/`](../web/packages)
  or next to the code that uses it.
- **keep**: the reason is given. Usually it is the platform itself (Kotlin, Compose, AndroidX),
  a compiler, or something whose in-repo replacement would be *worse*, such as cryptography or TLS.
  We never write our own crypto.

Counts were measured on `main` at `0254df9` (October 2026). "Transitive" means every package that
ends up installed or on the classpath, including the direct ones.

## Summary

| Area | Direct | Transitive | After this plan |
|---|---:|---:|---|
| web (`web/pnpm-lock.yaml`) | 10 | 154 packages, 414 MB `node_modules` | 4 direct: preact, typescript, esbuild, @types/node (+ `@cloudflare/workers-types`, types only); wrangler only via `npx` when deploying |
| Android runtime (`releaseRuntimeClasspath`) | 17 | 150 artifacts | about 135: OkHttp, Okio, kotlinx.serialization, androidsvg, security-crypto, Tink, Gson and androidx.browser removed |
| Android unit tests (`debugUnitTestRuntimeClasspath`) | +9 | 223 artifacts | MockWebServer removed; Robolectric and Roborazzi kept (test-only) |
| iOS | 0 | 0 | 0. Only Apple frameworks; there is no Swift Package Manager dependency. |
| Rust CLI (`cargo tree`) | 7 | 164 crates | 0. The CLI becomes a Node script that reuses `web/shared`. |
| GitHub Actions | 9 | | 5 first-party `actions/*` |

## web

`pnpm list --depth Infinity` on `web/`:

| Package | Kind | Transitive deps | Decision |
|---|---|---:|---|
| `preact` 10.29.8 | runtime | 0 | **keep** (see [Preact](#preact)) |
| `qrcode-generator` 1.4.4 | runtime | 0 | **in-repo**: `web/packages/qr`, byte mode with ECC M, versions 1–10 (the connect link is under 200 bytes). It is tested against the old library's output and decoded by an independent reference decoder in the tests. |
| `vitest` 5.0.3 | test | 88 | **platform**: `node:test` + `node:assert` and a small `describe`/`it`/`expect` shim in `web/packages/test`, so the 466 existing tests keep their shape. Snapshot tests use a small file-based `toMatchSnapshot`. |
| `vite` 8.3.1 | build | 68 | **in-repo**: `web/scripts/build.mjs` (esbuild) bundles the client, the Worker and the Node server; `web/scripts/dev.mjs` is a dev server that rebuilds on change and reloads the page. |
| `@cloudflare/vite-plugin` 1.62.3 | build | 132 (shares most with wrangler) | **remove** with vite. The build writes the same `dist/ironterm/wrangler.json` + `.wrangler/deploy/config.json` that the plugin wrote, so `wrangler deploy` keeps working with your existing `wrangler.jsonc`. |
| `wrangler` 4.145.0 | deploy | 93 | **keep, deploy-only**: run as `npx wrangler@<pinned>` from the deploy scripts, so it isn't installed for development, tests or CI. It is Cloudflare's own tool and the only way to deploy there. |
| `esbuild` 0.28.1 | build | 1 (+ one platform binary) | **keep**: one Go binary with no npm dependencies; it replaces vite, rolldown and the vitest transform. Dropping it would mean running TypeScript through `tsc` emit and writing our own bundler, which is slower and not safer. |
| `typescript` 5.9.3 | compiler | 0 | **keep**: the compiler; it has no dependencies. |
| `@types/node` 22.13.0 | types | 1 (`undici-types`) | **keep**: types only, never runs. It is used by `web/server` and the tests. |
| `@cloudflare/workers-types` | types | 0 | **keep**: types only, never runs. |

### Preact

Preact is one package with zero dependencies (about 4 KB gzipped), and the UI uses only `h`,
`render`, `useState`, `useMemo`, `useEffect`, `useRef` and `useLayoutEffect`. An in-repo VDOM
with keyed diffing and those five hooks is about 500 lines plus tests, roughly 1–2 days to write
and verify across every view (forms keeping focus, keyed list reorders, SVG namespaces, refs,
style objects, effect ordering). The supply-chain risk it removes is small: one exact-pinned
package with a lockfile integrity hash and no install scripts. **Recommendation: keep Preact for
now** and revisit once the web UI stops changing every day, because a subtle diffing bug would
cost more than the dependency does.

## Android

Direct dependencies from `android/app/build.gradle.kts` (`./gradlew :app:dependencies`):

| Dependency | Decision |
|---|---|
| Compose BOM, `compose.ui`, `foundation`, `material3`, `ui-tooling(-preview)`, `ui-test-manifest` | **keep**: the platform's UI toolkit. |
| `androidx.core:core-ktx`, `activity-compose`, `lifecycle-*-compose` | **keep**: platform. |
| `androidx.glance:glance-appwidget` | **keep**: platform (home screen widgets). |
| `androidx.work:work-runtime-ktx` | **keep**: platform (background refresh). It pulls in Room/SQLite, but there is no lighter correct way to schedule periodic work. |
| `kotlinx-coroutines-android` (+ `-test`) | **keep**: Kotlin's own library, already required by Compose and lifecycle. |
| `com.squareup.okhttp3:okhttp` (+ Okio) | **platform**: `HttpURLConnection`. The app makes a handful of JSON GET/POST calls; TLS comes from the platform. |
| `com.squareup.okhttp3:mockwebserver` (tests) | **platform**: a tiny test server on the JDK's built-in `com.sun.net.httpserver`. |
| `kotlinx-serialization-json` + its compiler plugin | **in-repo**: a small JSON reader/writer (`data/Json.kt`) and explicit decoders for each model. They behave the same in JVM tests and on the device, unlike `org.json`, which is a stub in plain JVM tests. |
| `com.caverock:androidsvg-aar` | **in-repo**: an SVG path renderer for the body figure, ported from the iOS parser in `ios/Ironterm/Body/SVG.swift`. |
| `androidx.security:security-crypto` (deprecated; pulls in Tink and Gson) | **platform**: an AES-GCM key in the Android Keystore that encrypts the stored credentials. Existing encrypted preferences are migrated once on first launch. The crypto itself is the platform's; we only call it. |
| `androidx.browser` | **platform**: a plain `ACTION_VIEW` `Intent`. |
| `play-services-code-scanner` | **keep**: QR scanning without the CAMERA permission. It accounts for about 25 artifacts (Firebase, ML Kit, datatransport, legacy support libraries). Replacing it means asking for the camera permission, writing a camera pipeline and a QR *decoder* (much harder than an encoder). Filling in the fields by hand, or tapping "Open in app" on the phone, already works without it. This is a candidate for later. |
| `junit` | **keep** (tests). |
| Robolectric, `androidx.test:*`, `compose ui-test-junit4` | **keep, test-only**: runs Android framework code on the JVM so 280+ tests don't need an emulator. Never shipped in the APK. |
| Roborazzi (+ Differ) | **keep, test-only**: it renders `docs/screens/android` and the widget previews. Never shipped. |
| Gradle plugins: AGP 8.7.3, Kotlin 2.0.21, Compose compiler | **keep**: the toolchain. The serialization plugin is removed with kotlinx.serialization. |

## iOS

No third-party code: SwiftUI, WidgetKit, Foundation, Security and CryptoKit only. The body figure
already uses an in-repo SVG parser. Nothing to do.

## Rust CLI (`src/`)

`reqwest`, `tokio`, `serde`, `serde_json`, `chrono`, `clap`, `crossterm`: 164 crates in `cargo tree`
for a 500-line program that fetches workouts and prints a graph.

Options:

1. **std-only Rust that shells out to `curl`.** No crates, but it needs a hand-written JSON parser,
   date arithmetic, and the local time zone, which std can't provide without `libc` or parsing
   `date +%z`. It would still need the Rust toolchain in CI.
2. **A zero-dependency Node CLI** that reuses `web/shared` (Hevy types, `dailyCells`, the same
   quartile levels the web app, Android and iOS use) and Node's built-in `fetch` and `Intl` time zones.

**Decision: option 2.** The Node CLI drops all 164 crates and the Rust toolchain from CI, and its
graph can't drift from the web app's, because it runs the same code. TLS comes from Node's
bundled OpenSSL, not from code we wrote. The trade-off: it needs Node 22 instead of being a single
static binary. Node is already required to develop the web app.

## GitHub Actions

| Action | Used by | Decision |
|---|---|---|
| `actions/checkout`, `actions/setup-node`, `actions/setup-java`, `actions/upload-artifact` | all | **keep**: GitHub's own. |
| `pnpm/action-setup` | web | **platform**: `corepack enable`, which ships with Node, reading `packageManager` in `web/package.json`. |
| `gradle/actions/setup-gradle` | android | **platform**: `actions/setup-java` with `cache: gradle` and the checked-in Gradle wrapper. |
| `maxim-lobanov/setup-xcode` | ios | **platform**: a shell step that picks the newest `/Applications/Xcode_*.app` with `xcode-select`. |
| `dtolnay/rust-toolchain`, `Swatinem/rust-cache` | cli | **remove** with the Rust CLI. |

## Order of work

Each step is one small PR that keeps every test green:

1. This inventory.
2. CLI: Rust → zero-dependency Node CLI (`web/cli`), README and CI.
3. CI: drop the third-party actions (corepack, setup-java gradle cache, xcode-select).
4. Android: `androidx.browser` → `Intent`.
5. Android: OkHttp + MockWebServer → `HttpURLConnection` + a JDK test server.
6. Android: security-crypto → Android Keystore, with a migration.
7. Android: androidsvg → in-repo SVG path renderer.
8. Android: kotlinx.serialization → in-repo JSON codec.
9. web: vitest → `node:test` + an `expect` shim (`web/packages/test`).
10. web: qrcode-generator → `web/packages/qr`.
11. web: vite + `@cloudflare/vite-plugin` → esbuild build + dev server; wrangler via `npx`.

The web steps go last because other work changes web code every day.
