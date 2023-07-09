import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
// import * as Evolu from "evolu";
// import { pipe } from "@effect/data/Function";
// import * as Schema from "@effect/schema/Schema";

// // import "react-native-get-random-values";

// const TodoId = Evolu.id("Todo");
// type TodoId = Schema.To<typeof TodoId>;

// const TodoCategoryId = Evolu.id("TodoCategory");
// type TodoCategoryId = Schema.To<typeof TodoCategoryId>;

// const NonEmptyString50 = pipe(
//   Schema.string,
//   Schema.minLength(1),
//   Schema.maxLength(50),
//   Schema.brand("NonEmptyString50")
// );
// type NonEmptyString50 = Schema.To<typeof NonEmptyString50>;

// const TodoTable = Schema.struct({
//   id: TodoId,
//   title: Evolu.NonEmptyString1000,
//   isCompleted: Evolu.SqliteBoolean,
//   categoryId: Schema.nullable(TodoCategoryId),
// });
// type TodoTable = Schema.To<typeof TodoTable>;

// const TodoCategoryTable = Schema.struct({
//   id: TodoCategoryId,
//   name: NonEmptyString50,
// });
// type TodoCategoryTable = Schema.To<typeof TodoCategoryTable>;

// const Database = Schema.struct({
//   todo: TodoTable,
//   todoCategory: TodoCategoryTable,
// });

export default function App(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text>Foo</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
