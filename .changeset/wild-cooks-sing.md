---
"evolu-server": major
"evolu": major
---

Port Evolu from fp-ts to Effect

Nothing changed except Evolu is internally using [Effect](https://www.effect.website) instead of fp-ts now. Because of that, I refactored all source code hence a major change.

Effect is [the successor](https://dev.to/effect-ts/a-bright-future-for-effect-455m) of fp-ts. If you already know fp-ts, you will understand it quickly. If you don't know fp-ts yet, skip it, and learn Effect instead. Give it five minutes, and you will love it.

The devil's advocate question: Could Evolu be written without Effect? It could be, but the source code would be uglier, brittle, and slower. Let me explain it. For now, Evolu is using a synchronous version of SQLite. But soon, we will also use asynchronous SQLite for other platforms where synchronous SQLite is not available. With Effect, the code is the same. Without Effect, we would always use Promises, even for synchronous code. Or we would have to write the same logic twice. As for brittle code, Effect catches and can recover from all errors. As for uglier code, errors we can expect are typed. And much more. I believe Effect will be the next big thing in the JavaScript ecosystem.
