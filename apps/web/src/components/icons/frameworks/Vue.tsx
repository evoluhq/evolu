import { SVGProps } from "react";

export const VueLogo = (
  props: SVGProps<SVGSVGElement>,
): React.ReactElement => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Simple Icons by Simple Icons Collaborators - https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md */}
      <path
        fill="currentColor"
        d="M24 1.607h-9.313L12 6.07 9.313 1.607H0L12 22.389 24 1.607z"
      />
      <path
        fill="currentColor"
        d="M12 22.389 21.313 7.002H15.36L12 11.918 8.64 7.002H2.687z"
      />
    </svg>
  );
};
