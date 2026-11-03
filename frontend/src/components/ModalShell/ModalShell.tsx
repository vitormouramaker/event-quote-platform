import type { CSSProperties, ReactNode } from "react";
import styles from "./ModalShell.module.css";

type ModalShellProps = {
  children: ReactNode;
  onBackdropClick?: () => void;
  maxWidth?: string;
  zIndex?: number;
  panelStyle?: CSSProperties;
  overlayStyle?: CSSProperties;
};

export function ModalShell({
  children,
  onBackdropClick,
  maxWidth = "500px",
  zIndex,
  panelStyle,
  overlayStyle,
}: ModalShellProps) {
  return (
    <div
      className={styles.overlay}
      style={{ zIndex, ...overlayStyle }}
      onClick={onBackdropClick}
    >
      <div
        className={styles.panel}
        style={{ maxWidth, ...panelStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
