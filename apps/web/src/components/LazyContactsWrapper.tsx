"use client";

import { lazy, Suspense } from "react";

const ContactsExample = lazy(() =>
  import("@/components/Contacts").then((mod) => ({
    default: mod.ContactsExample,
  })),
);

export function LazyContactsWrapper() {
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
