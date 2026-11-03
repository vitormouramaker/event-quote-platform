import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Eye, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import { useAnnexesQuery } from "../queries/useAnnexesQuery";
import { useAnnexMutations } from "../mutations/useAnnexMutations";
import { AnnexViewModal } from "../components/AnnexViewModal";
import type { ContractAnnexDto } from "../../../services/api";
import styles from "../styles/AnnexPage.module.css";

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export function AnnexesPage() {
  const navigate = useNavigate();
  const { data: annexes = [], isLoading, isError, error } = useAnnexesQuery();
  const { deleteMutation } = useAnnexMutations();
  const [viewing, setViewing] = useState<ContractAnnexDto | null>(null);

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Excluir o anexo contratual "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Anexos Contratuais</h1>
          <p className={styles.subtitle}>
            Anexos gerados a partir de orçamentos aprovados. Para gerar um novo,
            use o botão no card do orçamento aprovado.
          </p>
        </div>
      </div>

      {isLoading && <LoadingStatePanel message="Carregando anexos..." />}
      {isError && (
        <ErrorStatePanel
          title="Erro ao carregar anexos"
          message={error instanceof Error ? error.message : "Tente novamente."}
        />
      )}

      {!isLoading && !isError && annexes.length === 0 && (
        <EmptyStatePanel message="Nenhum anexo contratual gerado ainda. Gere pelo card de um orçamento aprovado." />
      )}

      {!isLoading && !isError && annexes.length > 0 && (
        <div className={styles.cardsGrid}>
          {annexes.map((annex) => (
            <div key={annex.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <FileSpreadsheet
                  size={18}
                  style={{ color: "var(--color-primary)", flexShrink: 0 }}
                />
                <span className={styles.cardTitle}>
                  {annex.title || annex.instituicao || "Anexo contratual"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardMeta}>
                  Curso: {annex.curso || "—"}
                </span>
                <span className={styles.cardMeta}>
                  Orçamento: {annex.budget_code || "—"}
                </span>
                <span className={styles.cardMeta}>
                  Gerado por: {annex.created_by_name || "—"}
                </span>
                <span className={styles.cardMeta}>
                  Atualizado em: {formatDate(annex.updated_at)}
                </span>
              </div>
              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Visualizar anexo"
                  onClick={() => setViewing(annex)}
                >
                  <Eye size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Editar anexo"
                  onClick={() => navigate(`/annexes/${annex.id}`)}
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Imprimir / PDF"
                  onClick={() => navigate(`/annexes/${annex.id}?print=1`)}
                >
                  <Printer size={18} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  title="Excluir"
                  disabled={
                    deleteMutation.isPending && deleteMutation.variables === annex.id
                  }
                  onClick={() =>
                    handleDelete(annex.id, annex.title || annex.instituicao || "")
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <AnnexViewModal annex={viewing} onClose={() => setViewing(null)} />
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <Button variant="outline" onClick={() => navigate("/budgets?tab=originals")}>
          Ir para Orçamentos
        </Button>
      </div>
    </div>
  );
}
