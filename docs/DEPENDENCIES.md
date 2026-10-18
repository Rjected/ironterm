# Dependencies

Ironterm tries to depend on as little third-party code as possible: every package is code that
runs on your machine, in CI, or on your phone, written by someone we don't know. This file lists
every dependency, what we decided for each one, and why.

Decisions:

- **remove**: not needed.
- **platform**: replace with what the platform or standard library already ships (`node:test`,
  `HttpURLConnection`, the Android Keystore, corepack…).
- **in-repo**: reimplement just the part we use, with tests, under [`web/packages/`](../web/packages)
  or next to the code that uses it.
- **keep**: the reason is given. Usually it is the platform itself (Kotlin, Compose, AndroidX),
  a compiler, or something whose in-repo replacement would be *worse*, such as cryptography or TLS.
  We never write our own crypto.

"Transitive" means every package that ends up installed or on the classpath, including the direct
ones.

## Summary

Before is `main` at `0254df9` (October 2026); after is with every pull request below merged.

| Area | Before | After |
|---|---|---|
| web (`web/pnpm-lock.yaml`) | 10 direct, 154 packages, 414 MB `node_modules` | 5 direct (preact, typescript, esbuild, @types/node, @cloudflare/workers-types), 33 packages of which about 26 are esbuild's per-platform binaries (10 installed), 50 MB |
| web runtime (shipped to browsers) | preact, qrcode-generator | preact |
| Cloudflare deploy tooling | wrangler in the dev dependencies | `web/deploy/` with its own lockfile (same versions), installed only by `pnpm wrangler` / `pnpm run deploy` |
| Android runtime (`releaseRuntimeClasspath`) | 150 artifacts | 145; about 140 once security-crypto (with Tink and Gson) is removed after its migration has shipped |
| Android unit tests (`debugUnitTestRuntimeClasspath`) | 223 artifacts | 217 |
| iOS | 0 | 0 (Apple frameworks only, no Swift packages) |
| CLI | Rust, 164 crates (`cargo tree`) | Node, no runtime dependencies (`web/cli`) |
| GitHub Actions | 9 distinct, 4 of them third-party | 4, all GitHub's own `actions/*` |

## web

`pnpm list --depth Infinity` on `web/`:

| Package | Kind | Transitive deps | Decision |
|---|---|---:|---|
| `preact` 10.29.8 | runtime | 0 | **keep** (see [Preact](#preact)) |
| `qrcode-generator` 1.4.4 | runtime | 0 | **in-repo** (#93): `web/packages/qr`, byte mode, level M, versions 1–40. Its matrices are identical to the old library's for 86 inputs across all 40 versions, and the tests decode them with an independent decoder. 5.5 KB minified instead of 21.4 KB. |
| `vitest` 5.0.3 | test | 88 | **platform** (#82): Node's test runner. `web/scripts/test.mjs` bundles the tests with esbuild and runs them with `node --test`; `web/packages/test` is the part of the vitest API the tests use (`describe`/`it`/`expect`, hooks, `vi.fn`, `vi.stubGlobal`, fake `Date`, snapshots, timeouts), so the test files didn't change. |
| `vite` 8.3.1 | build | 68 | **in-repo** (#96): `web/scripts/build.mjs` (esbuild) bundles the client, the Worker and the Node server in about 0.2 s; `web/scripts/dev.mjs` watches and reloads the page. |
| `@cloudflare/vite-plugin` 1.62.3 | build | 132 (shares most with wrangler) | **remove** (#96). The build writes the same redirected deploy config the plugin wrote, and `wrangler deploy --dry-run` prints the same thing. |
| `wrangler` 4.145.0 | deploy | 93 | **keep, deploy-only** (#96): Cloudflare's own CLI, and the only way to deploy there. It lives in `web/deploy/` with its own lockfile and is installed the first time you run `pnpm wrangler`. `npx wrangler@x` would avoid the extra folder but would resolve its 90 dependencies fresh each time, with no lockfile. |
| `esbuild` 0.28.1 | build | 1 (+ one platform binary) | **keep**: one Go binary with no npm dependencies; it replaces vite, rolldown and the vitest transform. Node can strip TypeScript types by itself now, but the code imports without file extensions, uses JSX and code-splits the client, so dropping esbuild would mean writing a bundler. That is not worth it, and not safer. |
| `typescript` 5.9.3 | compiler | 0 | **keep**: the compiler; it has no dependencies. |
| `@types/node` 22.13.0 | types | 1 (`undici-types`) | **keep**: types only, never runs. Used by `web/server`, the CLI and the tests. |
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
| `com.squareup.okhttp3:okhttp` (+ Okio) | **platform** (#59): `HttpURLConnection`, wrapped in `Net.send` / `Net.exchange`. Calls are cancellable, and redirects follow our rules: never https → http, and credentials are dropped when a redirect leaves the origin. TLS comes from the platform. |
| `com.squareup.okhttp3:mockwebserver` (tests) | **in-repo** (#59): a ~170-line HTTP/1.1 test server on a `ServerSocket` with the same API. (`com.sun.net.httpserver` isn't on the Android unit-test classpath.) |
| `kotlinx-serialization-json` + its compiler plugin | **keep**. There are 184 `@Serializable` classes. Hand-written codecs would be thousands of lines that every model change has to keep in sync, a bigger correctness risk than the library. It comes from JetBrains (the Kotlin vendor), the plugin ships with the compiler, and the runtime is two artifacts with no third-party dependencies. |
| `com.caverock:androidsvg-aar` | **in-repo** (#50): `ui/Svg.kt`, a port of the iOS renderer in `ios/Ironterm/Body/SVG.swift`. It also fixed the Android figure being drawn narrower than on iOS and the web. |
| `androidx.security:security-crypto` (deprecated; pulls in Tink and Gson) | **platform** (#72): an AES-256-GCM key in the Android Keystore seals the stored credentials. The old encrypted file is migrated once on first launch, so the library stays **only for that one read**. Remove it, and `Settings.migrateLegacy`, after a few releases. |
| `androidx.browser` | **platform** (#23): the Custom Tabs extras set directly on an `ACTION_VIEW` `Intent`. |
| `play-services-code-scanner` | **keep**: QR scanning without the CAMERA permission. It accounts for about 25 artifacts (Firebase, ML Kit, datatransport, legacy support libraries). Replacing it means asking for the camera permission, writing a camera pipeline and a QR *decoder* (much harder than an encoder). Filling in the fields by hand, or tapping "Open in app" on the phone, already works without it. This is a candidate for later. |
| `junit` | **keep** (tests). |
| Robolectric, `androidx.test:*`, `compose ui-test-junit4` | **keep, test-only**: runs Android framework code on the JVM so 300+ tests don't need an emulator. Never shipped in the APK. |
| Roborazzi (+ Differ) | **keep, test-only**: it renders `docs/screens/android` and the widget previews. Never shipped. |
| Gradle plugins: AGP 8.7.3, Kotlin 2.0.21, Compose compiler, kotlinx.serialization | **keep**: the toolchain. CI checks the Gradle wrapper jar and distribution against Gradle's published checksums (#19). |

## iOS

No third-party code: SwiftUI, WidgetKit, Foundation, Security and CryptoKit only. The body figure
already uses an in-repo SVG parser. Nothing to do.

## CLI

The Rust CLI used `reqwest`, `tokio`, `serde`, `serde_json`, `chrono`, `clap` and `crossterm`: 164
crates in `cargo tree` for a 500-line program that fetches workouts and prints a graph.

Options:

1. **std-only Rust that shells out to `curl`.** No crates, but it needs a hand-written JSON parser,
   date arithmetic, and the local time zone, which std can't provide without `libc` or parsing
   `date +%z`. It would still need the Rust toolchain in CI.
2. **A zero-dependency Node CLI** that reuses `web/shared` (Hevy types, `dailyCells`, the same
   quartile levels the web app, Android and iOS use) and Node's built-in `fetch` and `Intl` time zones.

**Decision: option 2** (#16). The Node CLI drops all 164 crates and the Rust toolchain from CI, and
its graph can't drift from the web app's, because it runs the same code. TLS comes from Node's
bundled OpenSSL, not from code we wrote. The trade-off: it needs Node 22 instead of being a single
static binary. Node is already required to develop the web app.

## GitHub Actions

| Action | Used by | Decision |
|---|---|---|
| `actions/checkout`, `actions/setup-node`, `actions/setup-java`, `actions/upload-artifact` | all | **keep**: GitHub's own. |
| `pnpm/action-setup` | web | **platform** (#19): `corepack enable`, which ships with Node, with pnpm pinned by version and sha512 in `web/package.json`. |
| `gradle/actions/setup-gradle` | android | **platform** (#19): `actions/setup-java` with `cache: gradle`; the wrapper jar is checked against Gradle's published checksum and the distribution by `distributionSha256Sum`. |
| `maxim-lobanov/setup-xcode` | ios | **platform** (#19): a shell step that picks the newest `/Applications/Xcode_*.app` with `xcode-select`. |
| `dtolnay/rust-toolchain`, `Swatinem/rust-cache` | cli | **remove** with the Rust CLI (#16). |

## Pull requests

| # | Change |
|---|---|
| #10 | This inventory |
| #16 | CLI: Rust → zero-dependency Node CLI (`web/cli`) |
| #19 | CI: corepack, setup-java's Gradle cache and wrapper checksum, xcode-select |
| #23 | Android: `androidx.browser` → Custom Tabs intent extras |
| #50 | Android: androidsvg → in-repo SVG renderer |
| #59 | Android: OkHttp + MockWebServer → `HttpURLConnection` + an in-repo test server |
| #72 | Android: security-crypto → Android Keystore, with a migration |
| #82 | web: vitest → `node:test` + `web/packages/test` |
| #93 | web: qrcode-generator → `web/packages/qr` |
| #96 | web: vite + plugin → esbuild build and dev server; wrangler deploy-only |

## Later

- Remove `androidx.security:security-crypto` (with Tink and Gson) once the Keystore migration has
  shipped for a few releases.
- `play-services-code-scanner` (about 25 artifacts) is the biggest remaining Android subtree; see
  above.
- Preact: see above.
