import { type InputHTMLAttributes, forwardRef, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={clsx(styles.wrapper, wrapperClassName)}>
        {label && (
          <label className={styles.label}>
            {label}
            {props.required && <span className={styles.required}> *</span>}
          </label>
        )}
        <div className={styles.inputContainer}>
          {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
          <input
            ref={ref}
            className={clsx(
              styles.input,
              error && styles.hasError,
              leftIcon && styles.withIcon,
              className,
            )}
            {...props}
          />
        </div>
        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  },
);

Input.displayName = "Input";
