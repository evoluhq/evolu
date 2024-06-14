import * as S from "@effect/schema/Schema";
import { useQuery, useEvolu } from "@evolu/react-native";
import { Database, NonEmptyString50 } from "../db/schema";
import { FC, useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { appStyles } from "../styles";
import { todoCategories } from "../db/db";
import { Either, Function } from "effect";

export const TodoCategories: FC = () => {
  const { create, update } = useEvolu<Database>();
  const { rows } = useQuery(todoCategories);

  const [text, setText] = useState("");
  const newTodoTitle = S.decodeUnknownEither(NonEmptyString50)(text);
  const handleTextInputEndEditing = () => {
    Either.match(newTodoTitle, {
      onLeft: Function.constVoid,
      onRight: (name) => {
        create("todoCategory", {
          name: name as any,
          json: { foo: "a", bar: false },
        });
        setText("");
      },
    });
  };

  return (
    <>
      <Text style={appStyles.h2}>Categories</Text>
      <TextInput
        autoComplete="off"
        autoCorrect={false}
        style={appStyles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="New Category"
        onBlur={handleTextInputEndEditing}
      />
      {rows.map(({ id, name }) => (
        <View key={id} style={{ marginBottom: 16 }}>
          <Text style={appStyles.item}>{name}</Text>
          <View style={{ flexDirection: "row" }}>
            <Button
              title="Delete"
              onPress={() => {
                update("todoCategory", { id, isDeleted: true });
              }}
            />
          </View>
        </View>
      ))}
    </>
  );
};
