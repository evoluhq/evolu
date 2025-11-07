import {
  createIdenticon,
  type IdenticonStyle,
  type OwnerId,
} from "@evolu/common";
import { FC, useMemo } from "react";

export const EvoluIdenticon: FC<{
  id: OwnerId;
  size?: number;
  borderRadius?: number;
  style?: IdenticonStyle;
}> = ({ id, size = 32, borderRadius = 3, style }) => {
  const svg = useMemo(() => createIdenticon(id, style), [id, style]);
  const uri = useMemo(
    () => `data:image/svg+xml,${encodeURIComponent(svg)}`,
    [svg],
  );
  return (
    <img
      src={uri}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius }}
      alt="Identicon"
    />
  );
};
