---
"@evolu/common-react": major
"@evolu/react-native": major
"@evolu/common-web": major
"@evolu/common": major
"@evolu/server": major
"@evolu/react": major
---

Multitenancy, stable Effect, refactoring, logging

Hi. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains the same, but I use the Effect library better. When I started with Effect, there wasn't a website yet.

New features:

- Multitenancy (we can run more Evolu instances side by side)
- Initial data (to define fixtures)
- Logging (you can see what's happening inside Evolu step by step)
- Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
- Stable Effect 🎉

There are also a lot of minor improvements here and there inside the core logic. Again, there are no breaking changes, just better and more readable source code.
