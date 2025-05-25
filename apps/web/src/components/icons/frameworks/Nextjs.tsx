import { SVGProps } from "react";

export const NextjsLogo = (
  props: SVGProps<SVGSVGElement>,
): React.ReactElement => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="none"
      viewBox="0 0 101 100"
      {...props}
    >
      <g clipPath="url(#a)">
        <path
          fill="#000"
          d="M50.754 100c27.614 0 50-22.386 50-50s-22.386-50-50-50-50 22.386-50 50 22.386 50 50 50"
        />
        <path
          fill="url(#a)"
          d="M83.814 87.51 39.166 30h-8.412v39.984h6.73V38.546L78.53 91.581a50 50 0 0 0 5.283-4.07"
        />
        <path fill="url(#b)" d="M64.644 30h6.667v40h-6.667z" />
      </g>
      <defs>
        <linearGradient
          id="a"
          x1="61.309"
          x2="81.032"
          y1="64.722"
          y2="89.166"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="b"
          x1="67.978"
          x2="67.866"
          y1="30"
          y2="59.375"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};
