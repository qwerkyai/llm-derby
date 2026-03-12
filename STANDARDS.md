# LLM Derby — Engineering Standards

> "Programs must be written for people to read, and only incidentally for machines to execute."
> — Abelson & Sussman

These standards are enforced by tooling, not by hope.

---

## 1. Project Structure

```
llm-derby/
├── src/
│   ├── core/           # Pure logic. No DOM. No side effects. 100% testable.
│   │   ├── config.js         # Every magic number lives here.
│   │   ├── race-engine.js    # Deterministic simulation.
│   │   └── betting-math.js   # Pool math. Pure functions.
│   ├── services/       # Side effects go here. Firebase, network, storage.
│   │   ├── firebase.js       # Single init point. Import once, pass handles.
│   │   ├── auth.js           # Auth state machine.
│   │   └── betting.js        # Firestore operations. Transactions, not prayers.
│   ├── render/         # Canvas and DOM rendering. Reads state, draws pixels.
│   │   ├── track.js          # Track geometry and rendering.
│   │   ├── horses.js         # Horse sprites, trails, particles.
│   │   ├── ui.js             # DOM updates. .textContent, never .innerHTML.
│   │   └── qr.js             # QR code generator.
│   ├── data/           # Static data, generators, seeds.
│   │   └── benchmark.js      # Seeded RNG, model configs, question generation.
│   └── app.js          # Orchestrator. Wires modules. Thin as possible.
├── public/
│   ├── index.html      # Shell. No inline JS. No onclick. Ever.
│   └── css/style.css
├── tests/
│   └── core/           # Mirrors src/core/ — pure logic, 100% coverage.
```

## 2. Module Philosophy — Unix Pipes, Not Monoliths

Each module does one thing. If you need the word "and" to describe it, split it.

- `core/` is a clean room. No `document`, no `window`, no `fetch`. Runs in Node.
- `services/` is where side effects live. Quarantined, not sprinkled.
- `render/` reads state and draws. It never mutates application state.
- Dependencies flow one direction: `app.js` -> `services/` -> `core/`. Never the reverse.

## 3. State Management

All application state lives in a single `state` object in `app.js`. No module-level `let` variables holding race state in separate files. State mutations go through named functions. The frame loop reads state. Event handlers write state.

## 4. Configuration — No Magic Numbers

Every tunable value lives in `src/core/config.js` with a name and a comment. If you change a number and the app breaks, that number should have been in config.

## 5. Error Handling

- No silent `catch` blocks. Either recover with user-facing feedback or throw.
- `return false` is not error handling. Throw an Error with a message.
- Firebase operations that touch money use Firestore transactions.

## 6. Security

- `.innerHTML` is banned for dynamic content. Use `.textContent` or DOM APIs.
- All `parseInt` calls get an `isNaN` check.
- No secrets in source. `.gitignore` covers config files with real keys.

## 7. HTML

- No `onclick` attributes. Event listeners in JavaScript.
- Form inputs have `<label>` elements.
- Modals carry `role="dialog"` and `aria-modal="true"`.

## 8. CSS

- All colors use CSS custom properties in `:root`.
- Canvas colors reference the `PALETTE` object in `config.js`.
- Dead CSS is deleted, not commented out.

## 9. Naming

- Files: `kebab-case.js`
- Functions: `camelCase`, verb-first (`calculatePayout`, `renderTrack`)
- Constants: `UPPER_SNAKE_CASE`
- CSS classes: `kebab-case`, component-prefixed (`horse-card`, `bet-card`)
- No abbreviations. `updateStandings`, not `updStandings`. Code is read 100x more than it's written.

## 10. Testing

- `core/` targets 100% coverage. Pure functions. No excuses.
- Test file mirrors source: `src/core/race-engine.js` -> `tests/core/race-engine.test.js`
- Framework: vitest (requires Node.js)

## 11. Git Hygiene

- `.gitignore` covers: `node_modules/`, `.env`, `firebase-config.js`, `dist/`, `.DS_Store`
- Commits are atomic. One logical change per commit.
