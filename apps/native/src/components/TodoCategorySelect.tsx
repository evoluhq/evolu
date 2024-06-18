import RNPickerSelect from "react-native-picker-select";
import { TodoCategoryForSelect, TodoCategoryId } from "../db/schema";
import { FC } from "react";

export const TodoCategorySelect: FC<{
  categories: ReadonlyArray<TodoCategoryForSelect>;
  selected: TodoCategoryId | null;
  onSelect: (_value: TodoCategoryId | null) => void;
}> = ({ categories, selected, onSelect }) => {
  const nothingSelected = "";
  const value =
    selected && categories.find((row) => row.id === selected)
      ? selected
      : nothingSelected;

  return (
    <RNPickerSelect
      value={value}
      onValueChange={(value: TodoCategoryId | null) => {
        onSelect(value);
      }}
      items={categories.map((row) => ({
        label: row.name || "",
        value: row.id,
      }))}
    />
  );
};
