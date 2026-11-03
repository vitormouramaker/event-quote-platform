import { Button } from "../../../components/Button/Button";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import type { BudgetCity } from "../data/budgetCatalog";
import { useCitiesQuery } from "../../cities/queries/useCitiesQuery";
import styles from "./BudgetCitySelectionModal.module.css";

type BudgetCitySelectionModalProps = {
  isOpen: boolean;
  onSelect: (city: BudgetCity) => void;
  onCancel?: () => void;
};

export function BudgetCitySelectionModal({
  isOpen,
  onSelect,
  onCancel,
}: BudgetCitySelectionModalProps) {
  const { data: cities = [], isLoading } = useCitiesQuery();

  if (!isOpen) return null;

  return (
    <ModalShell
      onBackdropClick={onCancel}
      maxWidth="540px"
      panelStyle={{ overflow: "hidden" }}
      zIndex={180}
    >
      <div className={styles.stack}>
        <div className={styles.header}>
          <h3 className={styles.title}>Selecione a cidade do orçamento</h3>
          <p className={styles.description}>
            Essa escolha define quais eventos ficarão disponíveis no passo 1.
          </p>
        </div>

        <div
          className={styles.choices}
          style={{ maxHeight: "48vh", overflowY: "auto", padding: "4px" }}
        >
          {isLoading ? (
            <p className={styles.choiceText}>Carregando cidades...</p>
          ) : cities.length === 0 ? (
            <p className={styles.choiceText}>Nenhuma cidade cadastrada.</p>
          ) : (
            cities.map((city) => (
              <button
                key={city.id}
                type="button"
                className={styles.choice}
                onClick={() => onSelect(city.name)}
              >
                <span className={styles.choiceTitle}>{city.name}</span>
              </button>
            ))
          )}
        </div>

        {onCancel ? (
          <div className={styles.footer}>
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
