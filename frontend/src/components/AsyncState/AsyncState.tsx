import type { ReactNode } from "react";
import styles from "./AsyncState.module.css";

type StatePanelProps = {
  title?: string;
  message: string;
  className?: string;
  actions?: ReactNode;
};

export function LoadingStatePanel({ message, className }: Omit<StatePanelProps, "actions" | "title">) {
  return <div className={[styles.panel, className].filter(Boolean).join(" ")}>{message}</div>;
}

export function ErrorStatePanel({ title, message, actions, className }: StatePanelProps) {
  return (
    <div className={[styles.panel, styles.error, className].filter(Boolean).join(" ")}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.message}>{message}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function EmptyStatePanel({ title, message, actions, className }: StatePanelProps) {
  return (
    <div className={[styles.panel, styles.empty, className].filter(Boolean).join(" ")}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.message}>{message}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
