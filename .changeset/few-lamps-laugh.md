---
"@evolu/common-react": major
"@evolu/react-native": major
"@evolu/common-web": major
"@evolu/common": major
"@evolu/server": major
"@evolu/react": major
---

Multitenancy, stable Effect, refactoring, logging

Greetings. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains unchanged, but Evolu uses the Effect library better. When Evolu started with Effect, the website didn't exist yet.

The initial reason for refactoring Evolu was that I wasn't satisfied with the Web Workers wrapper. I tried Comlink. It's a great library, but it has flaws, as documented in a new ProxyWorker, a lightweight Comlink tailored for Effect. While Effect provides an excellent wrapper for workers, I wanted to try a Comlink-like API. Such a change was a chance to review how Evolu uses Effect, and I realized I used too many Layers for no reason.

During refactoring, I realized it would be nice if Evolu could run more instances concurrently. So, Evolu now supports multitenancy 🙂.

I wasn't satisfied with the initial data definition, so I added an API for that, too. And logging. If you are curious about what's happening within Evolu, try the new `minimumLogLevel` Config option. There are also a few minor improvements inside the core logic. Again, there are no breaking changes; it is just better and more readable source code.

The great news is that Effect is stable now, so there will be no more releases with deps updates. Let's dance 🪩

New features:

- Multitenancy (we can run more Evolu instances side by side)
- Initial data (to define fixtures)
- Logging (you can see what's happening inside Evolu step by step)
- Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
- Stable Effect 🎉
