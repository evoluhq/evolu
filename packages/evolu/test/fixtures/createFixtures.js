// It's commented, because importing from /dist
// https://stackoverflow.com/a/58493836

// import arrayShuffle from "array-shuffle";
// import fs from "fs";
// import {
//   createInitialMerkleTree,
//   insertIntoMerkleTree,
// } from "../../dist/src/MerkleTree.js";
// import { unsafeTimestampFromString } from "../../dist/src/Timestamp.js";
// import { messages1 } from "./messages.js";

// const initialMerkleTree = createInitialMerkleTree();

// // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
// const createMerkleWithRandomOrder = () =>
//   arrayShuffle(messages1).reduce((a, b) => {
//     const t = unsafeTimestampFromString(b[0]);
//     return insertIntoMerkleTree(t)(a);
//   }, initialMerkleTree);

// [0, 1, 2, 3].forEach((i) => {
//   fs.writeFileSync(
//     `./merkle${i}.json`,
//     JSON.stringify(createMerkleWithRandomOrder())
//   );
// });
