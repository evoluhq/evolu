import { blo } from "blo";
import { useMemo } from "react";
import type { OwnerId } from "@evolu/common";

export function EvoluProfilePic(props: {id: OwnerId, size?: number}) {
  const size = props.size ?? 32;
  const uri = useMemo(() => props.id ? blo(`0x${props.id}`) : '', [props.id]);
  return props.id ? (
    <img
      src={uri}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: 3,
      }}
    />
  ) : null;
}
