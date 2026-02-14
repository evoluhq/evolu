import {
  createInstances,
  createMutex,
  type LeaderLock,
  type Mutex,
  type Name,
  ok,
} from "@evolu/common";

const leaderLockMutexes = createInstances<Name, Mutex>();

export const leaderLock: LeaderLock = {
  acquire: (name) => async (run) => {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();

    void run.daemon(
      leaderLockMutexes.ensure(name, createMutex).withLock(async () => {
        acquired.resolve();
        await release.promise;
        return ok();
      }),
    );

    await acquired.promise;

    return ok({
      [Symbol.dispose]: () => {
        release.resolve();
      },
    });
  },
};
