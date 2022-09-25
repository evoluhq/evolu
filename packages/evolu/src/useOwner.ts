import { useEffect, useState } from "react";
import { getOwner } from "./db.js";
import { Owner } from "./types.js";

export const useOwner = (): Owner | null => {
  const [owner, setOwner] = useState<Owner | null>(null);

  useEffect(() => {
    getOwner().then(setOwner);
  }, []);

  return owner;
};
