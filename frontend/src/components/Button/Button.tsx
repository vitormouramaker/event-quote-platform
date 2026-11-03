import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading,
  leftIcon,
  rightIcon,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        styles.btn,
        styles[variant],
        styles[size],
        isLoading && styles.loading,
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className={styles.spinner} />}
      {!isLoading && leftIcon && (
        <span className={styles.icon}>{leftIcon}</span>
      )}
      {children}
      {!isLoading && rightIcon && (
        <span className={styles.icon}>{rightIcon}</span>
      )}
    </button>
  );
}
