import * as S from "@effect/schema/Schema";
import { useEvolu, useOwner, NonEmptyString1000 } from "@evolu/react-native";
import { formatError } from "@effect/schema/TreeFormatter";
import { Database } from "../db/schema";
import { FC, useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { appStyles } from "../styles";
import { Either } from "effect";

export const OwnerActions: FC = () => {
  const evolu = useEvolu<Database>();
  const owner = useOwner();
  const [isMnemonicShown, setIsMnemonicShown] = useState(false);
  const [isRestoreShown, setIsRestoreShown] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const parsedMnemonic = S.decodeUnknownEither(NonEmptyString1000)(mnemonic);

  const handleMnemonicInputEndEditing = () => {
    Either.match(parsedMnemonic, {
      onLeft: (error) => alert(formatError(error)),
      onRight: (nmnemonic) => evolu.restoreOwner(nmnemonic, { reload: false }),
    });
  };

  return (
    <View>
      <Text>
        Open this page on a different device and use your mnemonic to restore
        your data.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        <Button
          title={`${!isMnemonicShown ? "Show" : "Hide"} Mnemonic`}
          onPress={() => setIsMnemonicShown(!isMnemonicShown)}
        />
        <Button
          title="Restore"
          onPress={() => setIsRestoreShown(!isRestoreShown)}
        />
        <Button
          title="Reset"
          onPress={() => {
            evolu.resetOwner();
          }}
        />
      </View>
      {isMnemonicShown && owner != null && (
        <TextInput multiline selectTextOnFocus>
          {owner.mnemonic}
        </TextInput>
      )}
      {isRestoreShown && (
        <TextInput
          placeholder="insert your mnemonic"
          autoComplete="off"
          autoCorrect={false}
          style={appStyles.textInput}
          value={mnemonic}
          onChangeText={setMnemonic}
          onBlur={handleMnemonicInputEndEditing}
        />
      )}
    </View>
  );
};
