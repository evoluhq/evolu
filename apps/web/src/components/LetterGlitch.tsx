"use client";
import clsx from "clsx";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LetterGlitch = ({
  glitchColors = ["#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3"],
  glitchSpeed = 50,
  centerVignette = false,
  outerVignette = true,
  smooth = true,
  className,
}: {
  glitchColors?: Array<string>;
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  smooth?: boolean;
  className?: string;
}): React.ReactElement => {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  // Mobile detection state
  const [isMobile, setIsMobile] = useState(false);
  const [hasPlayedOnMobile, setHasPlayedOnMobile] = useState(false);

  // All refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const letters = useRef<
    Array<{
      char: string;
      color: string;
      targetColor: string;
      colorProgress: number;
      visible: boolean;
      disappearTime: number | null;
    }>
  >([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitchTime = useRef(Date.now());

  // Check if device is mobile
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768); // Tailwind's md breakpoint
    };

    // Check on mount
    checkIsMobile();

    // Add resize listener
    window.addEventListener("resize", checkIsMobile);

    return () => {
      window.removeEventListener("resize", checkIsMobile);
    };
  }, []);

  // Main animation useEffect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    context.current = canvas.getContext("2d");
    resizeCanvas();
    animate();

    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        cancelAnimationFrame(animationRef.current!);
        resizeCanvas();
        animate();
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current!);
      window.removeEventListener("resize", handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glitchSpeed, smooth, resolvedTheme]);

  // Early return for non-homepage
  if (pathname !== "/") {
    return <></>;
  }

  // Early return for mobile that has already played
  if (isMobile && hasPlayedOnMobile) {
    return <></>;
  }

  if (resolvedTheme === "dark") {
    glitchColors = ["#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3"];
  } else {
    glitchColors = ["#404040", "#525252", "#737373"];
  }

  const fontSize = 16;
  const charWidth = 10;
  const charHeight = 20;

  const lettersAndSymbols = [
    "E",
    "V",
    "O",
    "L",
    "U",
    "!",
    "@",
    "#",
    "$",
    "&",
    "*",
    "(",
    ")",
    "-",
    "_",
    "+",
    "=",
    "/",
    "[",
    "]",
    "{",
    "}",
    ";",
    ":",
    "<",
    ">",
    ",",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ];

  const getRandomChar = () => {
    return lettersAndSymbols[
      Math.floor(Math.random() * lettersAndSymbols.length)
    ];
  };

  const getRandomColor = () => {
    return glitchColors[Math.floor(Math.random() * glitchColors.length)];
  };

  // Add a function to make all letters disappear over 10 seconds
  const initDisappearSequence = () => {
    const startTime = Date.now();
    const endTime = startTime + 5000; // 5 seconds

    // Set mobile animation start time
    if (isMobile && !hasPlayedOnMobile) {
      setHasPlayedOnMobile(true);
    }

    // Distribute disappear times across the 10 second window
    letters.current.forEach((letter) => {
      letter.visible = true;
      letter.disappearTime =
        Math.floor(Math.random() * (endTime - startTime)) + startTime;
    });
  };

  const hexToRgb = (hex: string) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (_m, r: string, g: string, b: string) => {
      return `${r}${r}${g}${g}${b}${b}`;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const interpolateColor = (
    start: { r: number; g: number; b: number },
    end: { r: number; g: number; b: number },
    factor: number,
  ) => {
    const result = {
      r: Math.round(start.r + (end.r - start.r) * factor),
      g: Math.round(start.g + (end.g - start.g) * factor),
      b: Math.round(start.b + (end.b - start.b) * factor),
    };
    return `rgb(${result.r}, ${result.g}, ${result.b})`;
  };

  const calculateGrid = (width: number, height: number) => {
    const columns = Math.ceil(width / charWidth);
    const rows = Math.ceil(height / charHeight);
    return { columns, rows };
  };

  const initializeLetters = (columns: number, rows: number) => {
    grid.current = { columns, rows };
    const totalLetters = columns * rows;
    letters.current = Array.from({ length: totalLetters }, () => ({
      char: getRandomChar(),
      color: getRandomColor(),
      targetColor: getRandomColor(),
      colorProgress: 1,
      visible: true,
      disappearTime: null,
    }));

    // Start the disappear sequence
    initDisappearSequence();
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (context.current) {
      context.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const { columns, rows } = calculateGrid(rect.width, rect.height);
    initializeLetters(columns, rows);
    drawLetters();
  };

  const drawLetters = () => {
    if (!context.current || letters.current.length === 0 || !canvasRef.current)
      return;
    const ctx = context.current;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";

    letters.current.forEach((letter, index) => {
      if (!letter.visible) return;

      const x = (index % grid.current.columns) * charWidth;
      const y = Math.floor(index / grid.current.columns) * charHeight;
      ctx.fillStyle = letter.color;
      ctx.fillText(letter.char, x, y);
    });
  };

  const updateLetters = () => {
    if (letters.current.length === 0) return; // Prevent accessing empty array

    const updateCount = Math.max(1, Math.floor(letters.current.length * 0.05));

    for (let i = 0; i < updateCount; i++) {
      const index = Math.floor(Math.random() * letters.current.length);
      if (!letters.current[index]) continue; // Skip if index is invalid

      letters.current[index].char = getRandomChar();
      letters.current[index].targetColor = getRandomColor();

      if (!smooth) {
        letters.current[index].color = letters.current[index].targetColor;
        letters.current[index].colorProgress = 1;
      } else {
        letters.current[index].colorProgress = 0;
      }

      // Don't reset visibility - we want all letters to eventually disappear
    }
  };

  const checkDisappearingLetters = () => {
    const now = Date.now();
    let needsRedraw = false;

    letters.current.forEach((letter) => {
      if (
        letter.visible &&
        letter.disappearTime &&
        now >= letter.disappearTime
      ) {
        letter.visible = false;
        // Set a new disappear time for when it reappears (it will reappear when updateLetters selects it)
        letter.disappearTime = null;
        needsRedraw = true;
      }
    });

    return needsRedraw;
  };

  const handleSmoothTransitions = () => {
    let needsRedraw = false;

    for (const letter of letters.current) {
      if (letter.colorProgress < 1) {
        letter.colorProgress += 0.05;
        if (letter.colorProgress > 1) letter.colorProgress = 1;

        const startRgb = hexToRgb(letter.color);
        const endRgb = hexToRgb(letter.targetColor);
        if (startRgb && endRgb) {
          letter.color = interpolateColor(
            startRgb,
            endRgb,
            letter.colorProgress,
          );
          needsRedraw = true;
        }
      }
    }

    return needsRedraw;
  };

  const animate = () => {
    const now = Date.now();
    let needsRedraw = false;

    if (now - lastGlitchTime.current >= glitchSpeed) {
      updateLetters();
      needsRedraw = true;
      lastGlitchTime.current = now;
    }

    // Check for letters that should disappear
    const disappearingLettersChanged = checkDisappearingLetters();
    needsRedraw = needsRedraw || disappearingLettersChanged;

    // Handle smooth color transitions
    if (smooth) {
      const smoothTransitionsChanged = handleSmoothTransitions();
      needsRedraw = needsRedraw || smoothTransitionsChanged;
    }

    if (needsRedraw) {
      drawLetters();
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  return (
    <div
      className={clsx(
        "relative h-full w-full overflow-hidden dark:bg-black",
        className,
      )}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {outerVignette && (
        <div className="pointer-events-none absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle,_rgba(0,0,0,0)_60%,_rgba(0,0,0,1)_100%)]"></div>
      )}
      {centerVignette && (
        <div className="pointer-events-none absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle,_rgba(0,0,0,0.8)_0%,_rgba(0,0,0,0)_60%)]"></div>
      )}
    </div>
  );
};

export default LetterGlitch;
