import { Evolu } from "@evolu/common/evolu";
import { JSX } from "solid-js";
import { EvoluContext } from "./EvoluContext.js";

export const EvoluProvider = (props: {
  readonly children?: JSX.Element;
  readonly value: Evolu<any>;
}): JSX.Element => {
  return (
    <EvoluContext.Provider value={props.value}>
      {props.children}
    </EvoluContext.Provider>
  );
};
