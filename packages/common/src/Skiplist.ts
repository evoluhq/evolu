/**
 * Skiplist data structure with probabilistic level generation.
 *
 * @module
 */

import type { RandomDep } from "./Random.js";
import { PositiveInt } from "./Type.js";

export interface SkiplistLevel {
  readonly create: () => PositiveInt;
}

export interface SkiplistLevelDep {
  readonly skiplistLevel: SkiplistLevel;
}

export interface SkiplistLevelConfig {
  readonly probability?: number;
  readonly maxLevel?: number;
}

// TODO: Use in Storage.
export const createSkiplistLevel =
  (deps: RandomDep) =>
  (config: SkiplistLevelConfig = {}): SkiplistLevel => {
    const { probability = 0.5, maxLevel = 32 } = config;
    return {
      create: () => {
        let level = 1;
        while (deps.random.next() <= probability && level < maxLevel) {
          level += 1;
        }
        return PositiveInt.orThrow(level);
      },
    };
  };

export interface Skiplist {
  readonly insert: (key: number) => void;
  readonly find: (key: number) => SkiplistNode | null;
}

export interface SkiplistNode {
  readonly key: number;
  readonly pointers: Array<SkiplistNode>;
}

export const createSkiplist = (deps: SkiplistLevelDep): Skiplist => {
  const tail: SkiplistNode = {
    key: Number.MAX_VALUE,
    pointers: [],
  };

  const head: SkiplistNode = {
    key: Number.MIN_VALUE,
    pointers: [tail],
  };

  // Cached to reuse the array.
  const path: Array<SkiplistNode> = [];

  return {
    insert: (key) => {
      let cur = head;

      for (let i = head.pointers.length - 1; i >= 0; i--) {
        while (cur.pointers[i].key < key) {
          cur = cur.pointers[i];
        }
        path[i] = cur;
      }

      const level = deps.skiplistLevel.create();

      if (level > head.pointers.length) {
        const tails = Array<SkiplistNode>(level - head.pointers.length).fill(
          tail,
        );
        const heads = Array<SkiplistNode>(level - head.pointers.length).fill(
          head,
        );
        head.pointers.push(...tails);
        path.push(...heads);
      }

      const newNode: SkiplistNode = { key, pointers: [] };

      for (let i = 0; i < level; i++) {
        newNode.pointers[i] = path[i].pointers[i];
        path[i].pointers[i] = newNode;
      }
    },

    find: (key) => {
      let cur = head;

      for (let i = head.pointers.length - 1; i >= 0; i--) {
        while (cur.pointers[i] && cur.pointers[i].key < key) {
          cur = cur.pointers[i];
        }
      }

      const candidate = cur.pointers[0];
      return candidate.key === key ? candidate : null;
    },
  };
};
