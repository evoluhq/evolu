"use client";

import { JSX, lazy, Suspense } from "react";

const ContactsExample = lazy(() =>
  import("@/components/Contacts").then((mod) => ({
    default: mod.ContactsExample,
  })),
);

export function LazyContactsWrapper(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-center">Loading contacts example...</div>
      }
    >
      <ContactsExample />
    </Suspense>
  );
}
