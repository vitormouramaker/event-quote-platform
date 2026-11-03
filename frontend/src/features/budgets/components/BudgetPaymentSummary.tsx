import { sumSummaryBlocks, type SummaryBlock } from "../domain/summaryBlocks";
import styles from "./BudgetPaymentSummary.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const integer = new Intl.NumberFormat("pt-BR");

/**
 * "Valor total do orçamento": o valor cheio, em reais, de tudo que está no
 * orçamento. Com um evento fechando quadro próprio (ex.: o baile) mostra o
 * pacote, o acumulado com ele e deixa o total geral por último.
 */
export function BudgetTotalsSummary({ blocks }: { blocks: SummaryBlock[] }) {
  if (blocks.length === 0) return null;
  const grand = sumSummaryBlocks(blocks);

  return (
    <div className={styles.wrapper}>
      {blocks.map((block) => (
        <div key={block.key} className={styles.line}>
          <span className={styles.label}>{block.totalsLabel}</span>
          <span className={styles.value}>{currency.format(block.total)}</span>
        </div>
      ))}

      {/* Com um quadro só o total dele já é o do orçamento. */}
      {blocks.length > 1 && (
        <div className={styles.line + " " + styles.lineStrong}>
          <span className={styles.label}>Total geral do orçamento</span>
          <span className={styles.value}>{currency.format(grand.total)}</span>
        </div>
      )}
    </div>
  );
}

type BudgetPaymentSummaryProps = {
  blocks: SummaryBlock[];
  installments: number;
};

/**
 * "Resumo Final · Condições de Pagamento" como ele sai na impressão, para as
 * telas de edição do orçamento mostrarem exatamente a mesma coisa — antes o
 * consultor só via o valor com desconto depois de imprimir.
 */
export function BudgetPaymentSummary({
  blocks,
  installments,
}: BudgetPaymentSummaryProps) {
  return (
    <div className={styles.wrapper}>
      {blocks.map((block, index) => (
        <div
          key={block.key}
          className={index > 0 ? styles.block + " " + styles.blockSplit : styles.block}
        >
          {block.caption && <div className={styles.caption}>{block.caption}</div>}

          <div className={styles.line + " " + styles.lineStrong}>
            <span className={styles.label}>{block.totalLabel}</span>
            <span className={styles.value}>
              {currency.format(block.totalPerStudent)}
            </span>
          </div>

          <div className={styles.line}>
            <span className={styles.label}>Quantidade de parcelas</span>
            <span className={styles.value}>{integer.format(installments)}</span>
          </div>

          <div className={styles.line}>
            <span className={styles.label}>Valor da parcela por formando</span>
            <span className={styles.value}>
              {currency.format(block.installmentPerStudent)}
            </span>
          </div>

          <div className={styles.line + " " + styles.lineStrong}>
            <span className={styles.label}>
              Valor da parcela com 10% de desconto
            </span>
            <span className={styles.value}>
              {currency.format(block.discountedInstallmentPerStudent)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
