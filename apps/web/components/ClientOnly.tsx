import { FC, ReactNode, useEffect, useState } from "react";

export const ClientOnly: FC<{ readonly children: ReactNode }> = ({
  children,
}) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;
  return <>{children}</>;
};
