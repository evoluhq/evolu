import type { OwnerId } from "@evolu/common";
import { blo } from "blo";
import { FC, useMemo } from "react";

export const EvoluAvatar: FC<{
  id: OwnerId;
  size?: number;
  borderRadius?: number;
}> = ({ id, size = 32, borderRadius = 3 }) => {
  const uri = useMemo(() => blo(`0x${id}`), [id]);
  return (
    <img
      src={uri}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius }}
    />
  );
};
