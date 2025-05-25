# @evolu/solid

Evolu for Solid.

## Installation

```bash
npm install @evolu/solid @evolu/common
```

## Usage

### Basic Setup

```tsx
import { createEvolu } from "@evolu/common";
import { EvoluProvider, createUseEvolu } from "@evolu/solid";
import { Component } from "solid-js";

const evolu = createEvolu(/* your schema */);
const useEvolu = createUseEvolu(evolu);

const App: Component = () => {
  return (
    <EvoluProvider value={evolu}>
      <TodoList />
    </EvoluProvider>
  );
};
```

### Using Queries

```tsx
import { useQuery } from "@evolu/solid";
import { Component } from "solid-js";

const TodoList: Component = () => {
  const todos = useQuery(allTodosQuery);

  return (
    <div>
      <For each={todos()}>{(todo) => <div>{todo.title}</div>}</For>
    </div>
  );
};
```

### Available Hooks

- `useEvolu()` - Get the Evolu instance
- `createUseEvolu(evolu)` - Create a typed hook for your Evolu instance
- `useQuery(query, options?)` - Subscribe to query results with suspense
- `useQueries(queries, options?)` - Subscribe to multiple queries
- `useQuerySubscription(query, options?)` - Low-level query subscription
- `useAppOwner()` - Subscribe to app owner changes
- `useSyncState()` - Subscribe to sync state changes
- `useEvoluError()` - Subscribe to error state changes

## Components

- `EvoluProvider` - Context provider for Evolu instance
