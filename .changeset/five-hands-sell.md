---
"@evolu/web": patch
---

Fixed Safari 27.2 terminating the page when Evolu keeps a database in memory or runs without SharedWorker

In Safari 27.2 and web views on iOS 27.2, the page's web process was terminated as soon as Evolu opened a database kept in memory, as in Safari's Private Browsing or with `memoryOnly`, or any database where Evolu falls back to one tab because SharedWorker is unavailable. Since `@evolu/common` 8.28.0, Evolu closed a message port right after transferring it to another context, which this WebKit mishandles ([WebKit bug 315394](https://bugs.webkit.org/show_bug.cgi?id=315394)). Evolu no longer closes a port it has transferred.
