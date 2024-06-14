import * as S from "@effect/schema/Schema";
import { useQuery, useEvolu, NonEmptyString1000 } from "@evolu/react-native";
import { Database } from "../db/schema";
import { FC, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { appStyles } from "../styles";
import { todosWithCategories } from "../db/db";
import { Either, Function } from "effect";
import { TodoItem } from "./TodoItem";

export const Todos: FC = () => {
  const { rows } = useQuery(todosWithCategories);
  const { create } = useEvolu<Database>();

  const [text, setText] = useState("");
  const newTodoTitle = S.decodeUnknownEither(NonEmptyString1000)(text);
  const handleTextInputEndEditing = () => {
    Either.match(newTodoTitle, {
      onLeft: Function.constVoid,
      onRight: (title) => {
        create("todo", { title, isCompleted: false });
        setText("");
      },
    });
  };

  return (
    <>
      <Text style={appStyles.h2}>Todos</Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        style={appStyles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="What needs to be done?"
        onBlur={handleTextInputEndEditing}
      />
      <View>
        {rows.map((row) => (
          <TodoItem key={row.id} row={row} />
        ))}
      </View>
    </>
  );
};
