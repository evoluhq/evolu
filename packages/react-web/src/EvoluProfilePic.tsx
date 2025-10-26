import type { OwnerId } from "@evolu/common";
import { blo } from "blo";
import { FC } from "react";

export const EvoluProfilePic: FC<{
  id: OwnerId;
  size?: number;
  borderRadius?: number;
}> = ({ id, size = 32, borderRadius = 3 }) => {
  const uri = blo(`0x${id}`);

  return (
    <img
      src={uri}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius }}
    />
  );
};
