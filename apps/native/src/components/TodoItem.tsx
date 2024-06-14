import { useEvolu } from "@evolu/react-native";
import { Database, TodoCategoryForSelect, TodoTable } from "../db/schema";
import { memo } from "react";
import { Button, Text, View } from "react-native";
import { appStyles } from "../styles";
import { TodoCategorySelect } from "./TodoCategorySelect";

export const TodoItem = memo<{
  row: Pick<TodoTable, "id" | "title" | "isCompleted" | "categoryId"> & {
    categories: ReadonlyArray<TodoCategoryForSelect>;
  };
}>(function TodoItem({
  row: { id, title, isCompleted, categoryId, categories },
}) {
  const { update } = useEvolu<Database>();

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row" }}>
        <Text
          style={[
            appStyles.item,
            { textDecorationLine: isCompleted ? "line-through" : "none" },
          ]}
        >
          {title}
        </Text>
        <TodoCategorySelect
          categories={categories}
          selected={categoryId}
          onSelect={(categoryId) => {
            update("todo", { id, categoryId });
          }}
        />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title={isCompleted ? "Completed" : "Complete"}
          onPress={() => {
            update("todo", { id, isCompleted: !isCompleted });
          }}
        />
        <Button
          title="Delete"
          onPress={() => {
            update("todo", { id, isDeleted: true });
          }}
        />
      </View>
    </View>
  );
});
