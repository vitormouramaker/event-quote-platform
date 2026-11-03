import type { CSSProperties, ReactNode } from "react";
import styles from "./StatusPill.module.css";

type StatusPillProps = {
  children: ReactNode;
  bg: string;
  color: string;
  borderColor?: string;
  size?: "xs" | "sm";
  style?: CSSProperties;
};

export function StatusPill({
  children,
  bg,
  color,
  borderColor,
  size = "xs",
  style,
}: StatusPillProps) {
  return (
    <span
      className={`${styles.pill} ${size === "sm" ? styles.sm : styles.xs}`}
      style={{
        backgroundColor: bg,
        color,
        border: borderColor ? `1px solid ${borderColor}` : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
