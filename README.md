# Evolu

The first complete and usable solution for client-first software is here.

It's so simple that everybody should understand how it works, and it's so complete that you can start building apps on it right now.

Those are strong claims, so let me explain them, but first things first — what is local-first software, and why do we need it?

## Local-first software

The term local-first is probably best described in [this famous article](https://www.inkandswitch.com/local-first/).

TLDR; Local-first software allows users to own their data. It means data are stored in the user's device(s), so local-first software can work offline. How is it different from keeping files on disk? A very. Files are not the right abstraction for applications and are complicated or impossible to synchronize among devices. That's why client-server architecture rules the world. But as with everything, it has trade-offs.

### The trade-offs of the client-server architecture

Client-server architecture provides us with easy backup and synchronization, but all that fun depends on the ability of the server to fulfill its promises. Companies go bankrupt, users are banned, errors occur, all those things happen all the time, and then what? Right, that's why the world needs client-first software. But until now, writing local-first software has been challenging because of the lack of libraries and design patterns. I personally failed several times, and that's why I created Evolu.

## What Evolu is

*Evolu is React Hooks library for local-first software with end-to-end encrypted backup and sync using SQLite and CRDT.*

It's even more, but this is the shortest claim I have been able to come up with. Evolu is my idea of how client-first software should be written.

- It must use an SQL database in the browser. No leaky abstractions.
- It has to have as minimal API as possible. No barriers.
- The source code must be as simple as possible. No Ph.D. stuff.
- It must use types as much as possible. Autocomplete FTW.
- The Developer Experience is foremost.
- And it must be fast. Or don't block the main thread, at least 🙃

That's why I wasn't satisfied with prior work and had to create Evolu. But it does not mean I did not use any. On the contrary, I used many other people's work and ideas. First and foremost, the Evolu architecture is almost a clone of James Long CRDT for mortals. Rewritten and improved, of course.






