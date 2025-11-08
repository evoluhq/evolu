import { createIdenticon, IdenticonStyle, OwnerId } from "@evolu/common";
import { FC, useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

export const EvoluIdenticon: FC<{
  id: OwnerId;
  size?: number;
  borderRadius?: number;
  style?: IdenticonStyle;
}> = ({ id, size = 32, borderRadius = 3, style }) => {
  const svg = useMemo(() => createIdenticon(id, style), [id, style]);
  return id ? (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        overflow: "hidden",
      }}
    >
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  ) : null;
};
