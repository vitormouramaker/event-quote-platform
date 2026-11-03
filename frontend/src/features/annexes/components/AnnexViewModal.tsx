import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Printer, X } from "lucide-react";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { Button } from "../../../components/Button/Button";
import { LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import { useBudgetStore, type Budget } from "../../../store/budgetStore";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import { buildBudgetEventsCatalog } from "../../budgets/data/budgetCatalog";
import {
  buildBudgetPrintDocument,
  buildCourtesyPrintEvent,
} from "../../budgets/print/budgetPrint";
import type { ContractAnnexDto } from "../../../services/api";
import { AnnexSheet } from "./AnnexSheet";
import styles from "../styles/AnnexPage.module.css";

type AnnexViewModalProps = {
  annex: ContractAnnexDto;
  onClose: () => void;
};

/** Visualização somente leitura do anexo, sem sair da listagem. */
export function AnnexViewModal({ annex, onClose }: AnnexViewModalProps) {
  const navigate = useNavigate();
  const { budgets, fetchBudgetById } = useBudgetStore();
  const { data: eventTemplates } = useEventsQuery();
  const budgetEvents = useMemo(
    () => buildBudgetEventsCatalog(eventTemplates),
    [eventTemplates],
  );

  const [budget, setBudget] = useState<Budget | undefined>(undefined);
  const [view, setView] = useState<"TEAM" | "CLIENT">("TEAM");

  useEffect(() => {
    if (!annex.budget_id) return;
    const local = budgets.find((b) => b.id === annex.budget_id);
    if (local?.data) {
      setBudget(local);
      return;
    }
    void fetchBudgetById(annex.budget_id).then((fetched) => setBudget(fetched));
  }, [annex.budget_id, budgets, fetchBudgetById]);

  const courtesyEventIds = useMemo(
    () => (Array.isArray(annex.courtesy_event_ids) ? annex.courtesy_event_ids : []),
    [annex.courtesy_event_ids],
  );

  // Mesmo cuidado da tela de edição: sem o catálogo vivo o documento sai vazio.
  // Os eventos cortesia salvos entram depois dos do orçamento, como na edição.
  const printDoc = useMemo(() => {
    if (!budget || budgetEvents.length === 0) return undefined;
    const base = buildBudgetPrintDocument(budget, budgetEvents);
    if (courtesyEventIds.length === 0) return base;
    const inBudget = new Set(base.events.map((event) => event.eventId));
    const extras = courtesyEventIds
      .filter((eventId) => !inBudget.has(eventId))
      .map((eventId) => budgetEvents.find((event) => event.id === eventId))
      .filter((event): event is (typeof budgetEvents)[number] => Boolean(event))
      .map((event) => buildCourtesyPrintEvent(event, base.studentsQuantity));
    return { ...base, events: [...base.events, ...extras] };
  }, [budget, budgetEvents, courtesyEventIds]);

  const signatureNames =
    Array.isArray(annex.signature_names) && annex.signature_names.length > 0
      ? annex.signature_names
      : ["", "", ""];

  return (
    <ModalShell onBackdropClick={onClose} maxWidth="880px">
      <div className={styles.modalWrapper}>
      <div className={styles.modalHeader}>
        <div>
          <h2 className={styles.modalTitle}>
            {annex.title || annex.instituicao || "Anexo contratual"}
          </h2>
          <p className={styles.modalSubtitle}>
            {annex.curso || "—"}
            {annex.budget_code ? " · " + annex.budget_code : ""}
          </p>
        </div>
        <div className={styles.modalHeaderActions}>
          <div className={styles.viewToggle} role="group" aria-label="Visão do anexo">
            <button
              type="button"
              className={view === "TEAM" ? styles.viewActive : styles.viewOption}
              onClick={() => setView("TEAM")}
            >
              Equipe
            </button>
            <button
              type="button"
              className={view === "CLIENT" ? styles.viewActive : styles.viewOption}
              onClick={() => setView("CLIENT")}
            >
              Cliente
            </button>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={styles.modalBody}>
        {!budget || !printDoc ? (
          <LoadingStatePanel message="Carregando anexo..." />
        ) : (
          <AnnexSheet
            budget={budget}
            printDoc={printDoc}
            signatureNames={signatureNames}
            view={view}
            courtesyEventIds={courtesyEventIds}
          />
        )}
      </div>

      <div className={styles.modalFooter}>
        <Button
          variant="outline"
          leftIcon={<Printer size={16} />}
          onClick={() => navigate(`/annexes/${annex.id}?print=1`)}
        >
          Imprimir / PDF
        </Button>
        <Button
          leftIcon={<Pencil size={16} />}
          onClick={() => navigate(`/annexes/${annex.id}`)}
        >
          Editar anexo
        </Button>
      </div>
      </div>
    </ModalShell>
  );
}
