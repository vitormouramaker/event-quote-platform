import type { CSSProperties, ReactNode } from "react";
import summaryStyles from "./SummaryStep.module.css";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

type SummaryMoneyLineProps = {
  label: ReactNode;
  value: number;
  className?: string;
  style?: CSSProperties;
  prefix?: string;
};

export function SummaryMoneyLine({
  label,
  value,
  className,
  style,
  prefix,
}: SummaryMoneyLineProps) {
  return (
    <div className={className ?? summaryStyles.row} style={style}>
      <span>{label}</span>
      <span>
        {prefix}
        {formatCurrency(value)}
      </span>
    </div>
  );
}
