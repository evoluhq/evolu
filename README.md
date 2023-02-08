# Evolu

React Hooks library for [local-first software](https://www.inkandswitch.com/local-first/) with end-to-end encrypted backup and sync using [SQLite](https://sqlite.org/) and [CRDT](https://crdt.tech/).

Evolu is designed for privacy, ease of use, and no vendor lock-in. Everybody can run their Evolu server, and the source code is so simple that everybody can understand what it does.

## Local-first software

Local-first software allows users to own their data. Evolu stores data in the user's device(s), so Evolu apps can work offline and without a specific server. How is it different from keeping files on disk? A very. Files are not the right abstraction for apps and are complicated to synchronize among devices. That's why client-server architecture rules the world. But as with everything, it has trade-offs.

### The trade-offs of the client-server architecture

Client-server architecture provides us with easy backup and synchronization, but all that depends on the ability of a server to fulfill its promises. Internet is offline, companies go bankrupt, users are banned, and errors occur. All those things happen all the time, and then what? Right, that's why the world needs local-first software. But until now, writing local-first software has been challenging because of the lack of libraries and design patterns. That's why I created Evolu.

## Getting Started

```sh
npm install evolu
```

The complete Next.js example is [here](https://github.com/evoluhq/evolu/tree/main/apps/web).

### Define data

To start using Evolu, you need to define a schema for your database. Evolu uses [Zod](https://github.com/colinhacks/zod) for runtime validations.

```ts
const { useQuery, useMutation } = createHooks({
  todo: {
    id: model.id<"todo">(),
    title: model.NonEmptyString1000,
    isCompleted: model.SqliteBoolean,
  },
});
```

### Query data

Evolu uses type-safe TypeScript SQL query builder [kysely](https://github.com/koskimas/kysely), so autocompletion works OOTB.

```ts
const { rows } = useQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted", "updatedAt"])
    .orderBy("updatedAt")
);
```

### Mutate data

Mutation API is tailored for CRDT to ensure changes are always merged without conflicts.

```ts
const handleAddTodoClick = () => {
  const title = model.NonEmptyString1000.safeParse(
    prompt("What needs to be done?")
  );
  if (!title.success) {
    alert(JSON.stringify(title.error, null, 2));
    return;
  }
  mutate("todo", { title: title.data });
};
```

### Show mnemonic

Mnemonic is your safe autogenerated password based on [bip39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

```ts
const owner = useOwner();
const handleShowMnemonic = () => {
  alert(owner.mnemonic);
};
```

### Delete all your local data

Leave no traces on a device.

```ts
const ownerActions = useOwnerActions();
const handleResetOwner = () => {
  if (confirm("Are you sure? It will delete all your local data."))
    ownerActions.reset();
};
```

### Restore your data elsewhere

Your data are safely stored via randomly generated 12 words. You may know this pattern from Bitcoin.

```ts
const ownerActions = useOwnerActions();
const handleRestoreOwner = () => {
  const mnemonic = prompt("Your Mnemonic");
  if (mnemonic == null) return;
  const either = ownerActions.restore(mnemonic);
  if (either._tag === "Left") alert(JSON.stringify(either.left, null, 2));
};
```

### Handle errors

Evolu useQuery and useMutation never fail, it's the advantage of local first software, but Evolu, in rare cases, can.

```ts
const evoluError = useEvoluError();

useEffect(() => {
  // eslint-disable-next-line no-console
  if (evoluError) console.log(evoluError);
}, [evoluError]);
```

And that's all. Minimal API is the key to a great developer experience.

## Privacy

Evolu uses end-to-end encryption and generates strong and safe passwords for you. Evolu sync and backup server see only timestamps.

## Trade-offs

> “There are no solutions. There are only trade-offs.” ― Thomas Sowell

Evolu is not P2P software. For reliable syncing and backup, there needs to be a server. Evolu server is very minimal, and everyone can run their own. While it's theoretically possible to have P2P Evolu, I have yet to see a reliable solution. It's not only a technical problem; it's an economic problem. Someone has to be paid to keep your data safe. Evolu provides a free server for testing. Soon we will provide a paid server for production usage.

All table columns except for ID are nullable by default. It's not a bug; it's a feature. Local-first data are meant to last forever, but schemas evolve. This design decision was inspired by GraphQL [nullability](https://graphql.org/learn/best-practices/#nullability) and [versioning](https://graphql.org/learn/best-practices/#versioning) design patterns. Evolu provides a handy `filterMap` helper for that.

Evolu has no support for CRDT transactions because CRDT transactions are still in the research phase. There are a few proposals, but nothing is usable yet. Instead of a half-baked solution, I made a design decision not to implement them. Fortunately, it's not a show-stopper.

## Community

The Evolu community is on GitHub Discussions, where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://twitter.com/evoluhq)

## Contributing

Evolu monorepo uses [pnpm](https://pnpm.io/).

Install the dependencies with:

```
pnpm install
```

Build Evolu monorepo:

```
pnpm build
```

Start developing and watch for code changes:

```
pnpm dev
```

Describe changes for release log:

```
pnpm changeset
```
