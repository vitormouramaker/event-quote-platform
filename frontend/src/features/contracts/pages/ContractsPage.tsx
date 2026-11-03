import { useNavigate } from "react-router-dom";
import { FileSignature, Plus, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import { useContractsQuery } from "../queries/useContractsQuery";
import { useContractMutations } from "../mutations/useContractMutations";
import styles from "../styles/ContractsPage.module.css";

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function ContractsPage() {
  const navigate = useNavigate();
  const { data: contracts = [], isLoading, isError, error } = useContractsQuery();
  const { deleteMutation } = useContractMutations();

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Excluir o contrato "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Contratos</h1>
          <p className={styles.subtitle}>
            Gere os contratos dos clientes com orçamentos fechados a partir do
            modelo padrão da Orça Eventos.
          </p>
        </div>
        <Button
          onClick={() => navigate("/contracts/create")}
          leftIcon={<Plus size={18} />}
        >
          Criar contrato
        </Button>
      </div>

      {isLoading && <LoadingStatePanel message="Carregando contratos..." />}
      {isError && (
        <ErrorStatePanel
          title="Erro ao carregar contratos"
          message={error instanceof Error ? error.message : "Tente novamente."}
        />
      )}

      {!isLoading && !isError && contracts.length === 0 && (
        <EmptyStatePanel message="Nenhum contrato criado ainda. Clique em 'Criar contrato'." />
      )}

      {!isLoading && !isError && contracts.length > 0 && (
        <div className={styles.cardsGrid}>
          {contracts.map((contract) => (
            <div key={contract.id} className={styles.contractCard}>
              <div className={styles.cardHeader}>
                <FileSignature
                  size={18}
                  style={{ color: "var(--color-primary)", flexShrink: 0 }}
                />
                <span className={styles.cardTitle}>
                  {contract.title || "Contrato sem título"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardMeta}>
                  Criado por: {contract.created_by_name || "—"}
                </span>
                <span className={styles.cardMeta}>
                  Atualizado em: {formatDate(contract.updated_at)}
                </span>
              </div>
              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Editar"
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Imprimir / PDF"
                  onClick={() => navigate(`/contracts/${contract.id}?print=1`)}
                >
                  <Printer size={18} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  title="Excluir"
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables === contract.id
                  }
                  onClick={() => handleDelete(contract.id, contract.title)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
