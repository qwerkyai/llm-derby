# LLM Derby

Horse racing visualization that replays MMLU-Pro Hard benchmark results for LLM models, with real-time parimutuel betting.

Built for **NVIDIA GTC 2026** by [Qwerky AI](https://qwerky.ai).

## Quick Start (Local Demo)

```bash
# No build step needed — vanilla ES modules
python3 -m http.server 3000

# Open http://localhost:3000/public/index.html
```

## Architecture

```
src/core/       Pure logic (race engine, betting math, config)
src/services/   Firebase auth, Firestore betting operations
src/render/     Canvas track, horse rendering, DOM UI updates
src/data/       Benchmark data generation (seeded, deterministic)
src/app.js      Orchestrator — wires everything together
public/         HTML shell + CSS
tests/          Unit tests (vitest)
```

See [STANDARDS.md](STANDARDS.md) for code standards and conventions.

## Key Concepts

- **Deterministic replay**: Same seed always produces the same race
- **Parimutuel betting**: Pool-based — `payout = (myBet / winnerPool) * totalPool`
- **Escalating penalties**: Wrong answers cost `min(2 + wrongs * 0.5, 8)` seconds
- **3 models**: Llama 3.1 3B, Qre Llama 3B, Qre Llama 8B

## Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication (Google + Email/Password)
3. Enable Firestore Database
4. Copy your web app config to `src/services/firebase-config.js`
5. Deploy: `firebase deploy`

Without Firebase config, the app runs in demo mode (no auth, simulated odds).

## Testing

Requires Node.js:

```bash
npm install
npm test
```

## License

Proprietary — Qwerky AI, Inc.
