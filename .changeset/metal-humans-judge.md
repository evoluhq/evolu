---
"@evolu/common-react": patch
"@evolu/common-web": patch
"@evolu/common": patch
---

Fix SSR

Evolu server-side rendering was surprisingly problematic because of the React Suspense error: "This Suspense boundary received an update before it finished hydrating."

If you are curious why a local-first library needs to render something on the server where there is no data, the answer is that if we can render empty rows, we should.

But because of the React Suspense error, Evolu apps had to be wrapped by the ClientOnly component, which wasn't ideal. Check article:

https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store

Internally, PlatformName has been replaced with useWasSSR React Hook.
