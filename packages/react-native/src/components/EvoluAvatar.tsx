import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { FC, useMemo } from "react";
import { bloSvg } from "blo";
import { OwnerId } from "@evolu/common";

export const EvoluAvatar: FC<{
  id: OwnerId;
  size?: number;
  borderRadius?: number;
}> = ({ id, size = 32, borderRadius = 3 }) => {
  const svg = useMemo(() => bloSvg(`0x${id}`), [id]);
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
