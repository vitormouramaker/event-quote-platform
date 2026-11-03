import { useMemo } from "react";
import { ArrowRight, X } from "lucide-react";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { Button } from "../../../components/Button/Button";
import type { Budget } from "../../../store/budgetStore";
import type { BudgetCatalogEvent } from "../data/budgetCatalog";
import {
  getBudgetItemChangeLog,
  type BudgetItemChange,
} from "../domain/budgetItemChanges";
import styles from "./BudgetChangesModal.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const integer = new Intl.NumberFormat("pt-BR");

type BudgetChangesModalProps = {
  budget: Budget;
  budgetEvents?: BudgetCatalogEvent[];
  /** Item que disparou a abertura — fica destacado e no topo da lista. */
  focus?: { eventId: string; itemId: string };
  onClose: () => void;
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function BudgetChangesModal({
  budget,
  budgetEvents = [],
  focus,
  onClose,
}: BudgetChangesModalProps) {
  const labels = useMemo(() => {
    const eventTitles = new Map<string, string>();
    const itemNames = new Map<string, string>();
    for (const event of budgetEvents) {
      eventTitles.set(String(event.id), event.title);
      for (const item of event.items ?? []) {
        itemNames.set(String(event.id) + "|" + String(item.id), item.name);
      }
    }
    return { eventTitles, itemNames };
  }, [budgetEvents]);

  const groups = useMemo(() => {
    const log = getBudgetItemChangeLog(budget);
    const entries = Object.entries(log)
      .map(([eventId, items]) => ({
        eventId,
        title: labels.eventTitles.get(eventId) ?? eventId,
        items: Object.entries(items).map(([itemId, change]) => ({
          itemId,
          name: labels.itemNames.get(eventId + "|" + itemId) ?? itemId,
          change: change as BudgetItemChange,
        })),
      }))
      .filter((group) => group.items.length > 0);

    // O evento do item clicado vem primeiro.
    if (focus) {
      entries.sort((a, b) =>
        a.eventId === focus.eventId ? -1 : b.eventId === focus.eventId ? 1 : 0,
      );
    }
    return entries;
  }, [budget, labels, focus]);

  return (
    <ModalShell onBackdropClick={onClose} maxWidth="720px" zIndex={200}>
      <div className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Alterações desta versão</h2>
          <p className={styles.subtitle}>
            {budget.instituicao} - {budget.curso}
            {budget.version ? ` - v${budget.version}` : ""}
          </p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Fechar"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className={styles.body}>
        {groups.length === 0 && (
          <p className={styles.empty}>
            Esta versão não tem alterações de item registradas. Versões criadas
            antes deste histórico não guardam o antes e o depois.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.eventId} className={styles.group}>
            <div className={styles.groupTitle}>{group.title}</div>
            {group.items.map((item) => {
              const highlighted =
                focus?.eventId === group.eventId && focus?.itemId === item.itemId;
              const { change } = item;
              return (
                <div
                  key={item.itemId}
                  className={
                    styles.changeRow +
                    (highlighted ? " " + styles.changeRowFocused : "")
                  }
                >
                  <div className={styles.changeName}>
                    {item.name}
                    <span className={styles.sourceTag}>
                      {change.source === "ANNEX"
                        ? "via anexo contratual"
                        : "edição do orçamento"}
                      {change.at ? " · " + formatDate(change.at) : ""}
                    </span>
                  </div>
                  <div className={styles.changeDiffs}>
                    {change.quantityTo !== undefined ||
                    change.quantityFrom !== undefined ? (
                      <div className={styles.diffLine}>
                        <span className={styles.diffLabel}>Quantidade</span>
                        <span className={styles.diffFrom}>
                          {change.quantityFrom === undefined
                            ? "—"
                            : integer.format(change.quantityFrom)}
                        </span>
                        <ArrowRight size={14} />
                        <span className={styles.diffTo}>
                          {change.quantityTo === undefined
                            ? "—"
                            : integer.format(change.quantityTo)}
                        </span>
                      </div>
                    ) : null}
                    {change.unitPriceTo !== undefined ||
                    change.unitPriceFrom !== undefined ? (
                      <div className={styles.diffLine}>
                        <span className={styles.diffLabel}>Valor unitário</span>
                        <span className={styles.diffFrom}>
                          {change.unitPriceFrom === undefined
                            ? "—"
                            : currency.format(change.unitPriceFrom)}
                        </span>
                        <ArrowRight size={14} />
                        <span className={styles.diffTo}>
                          {change.unitPriceTo === undefined
                            ? "—"
                            : currency.format(change.unitPriceTo)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
      </div>
    </ModalShell>
  );
}
