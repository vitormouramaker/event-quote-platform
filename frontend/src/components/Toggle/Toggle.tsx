import { forwardRef, type InputHTMLAttributes } from "react";
import { HelpTip } from "../HelpTip/HelpTip";
import styles from "./Toggle.module.css";

type ToggleProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

// Switch (visual) sobre um <input type="checkbox"> — funciona com o register do
// react-hook-form: `<Toggle label="..." {...register("campo")} />`.
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, hint, className, ...rest }, ref) => (
    <label className={`${styles.toggle}${className ? ` ${className}` : ""}`}>
      <span className={styles.switch}>
        <input
          type="checkbox"
          ref={ref}
          className={styles.input}
          {...rest}
        />
        <span className={styles.track} aria-hidden>
          <span className={styles.thumb} />
        </span>
      </span>
      <span className={styles.label}>{label}</span>
      {hint ? <HelpTip text={hint} /> : null}
    </label>
  ),
);

Toggle.displayName = "Toggle";
