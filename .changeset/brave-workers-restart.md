---
"@evolu/web": patch
---

Fixed tabs that stopped working after Safari relaunched Evolu's shared worker

When the process hosting Evolu's shared worker ends, WebKit can start the
worker again without its state and connect the open tabs to it
([WebKit bug 318873](https://bugs.webkit.org/show_bug.cgi?id=318873)). Those
tabs stopped working until the user reloaded them. A tab now reloads by itself
when a relaunched worker contacts it, including a tab that was still waiting
for another build.
