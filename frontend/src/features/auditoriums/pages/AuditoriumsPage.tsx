import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, DollarSign, Building2 } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { Table } from "../../../components/Table/Table";
import { Input } from "../../../components/Input/Input";
import { LoadingStatePanel, ErrorStatePanel } from "../../../components/AsyncState/AsyncState";
import { useAuditoriumsQuery } from "../queries/useAuditoriumsQuery";
import { useAuditoriumMutations } from "../mutations/useAuditoriumMutations";
import type { AuditoriumDto } from "../../../services/api";
import styles from "../styles/AuditoriumsPage.module.css";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AuditoriumsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: auditoriums = [], isLoading, isError, error, refetch } = useAuditoriumsQuery();
  const { deleteMutation } = useAuditoriumMutations();

  const filtered = useMemo(
    () => auditoriums.filter((a) => a.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [auditoriums, searchTerm],
  );

  function openCreate() {
    navigate("/auditoriums/create");
  }

  function openEdit(auditorium: AuditoriumDto) {
    navigate(`/auditoriums/${auditorium.id}`);
  }

  function handleDelete(id: string, name: string) {
    if (confirm(`Excluir o auditório "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  }

  const columns = [
    { header: "Auditório", accessor: "name" as const },
    {
      header: "Slug",
      accessor: (row: AuditoriumDto) => (
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem", opacity: 0.8 }}>{row.slug}</span>
      ),
    },
    {
      header: "Cidade",
      accessor: (row: AuditoriumDto) =>
        row.city ? (
          <span style={{ fontSize: "0.85rem" }}>{row.city}</span>
        ) : (
          <span style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            Todas as cidades
          </span>
        ),
    },
    {
      header: "Valor",
      accessor: (row: AuditoriumDto) => (
        <div className={styles.tableMoney}>
          <DollarSign size={14} />
          {formatMoney(row.price)}
        </div>
      ),
    },
    {
      header: "No orçamento",
      accessor: (row: AuditoriumDto) =>
        row.allow_budget_edit ? (
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1C7D4B" }}>
            Valor editável
          </span>
        ) : (
          <span style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            Valor fixo
          </span>
        ),
    },
    {
      header: "Ações",
      accessor: (row: AuditoriumDto) => (
        <div className={styles.tableActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Editar ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
            aria-label={`Excluir ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.id, row.name);
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
      width: "110px",
    },
  ];

  if (isLoading) return <LoadingStatePanel message="Carregando auditórios..." />;

  if (isError) {
    return (
      <ErrorStatePanel
        title="Erro ao carregar auditórios"
        message={error instanceof Error ? error.message : "Tente novamente."}
        actions={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Auditórios</h1>
          <p className={styles.subtitle}>Gerencie os auditórios disponíveis para locação nos orçamentos.</p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={openCreate}>
          Novo auditório
        </Button>
      </header>

      <div className={styles.content}>
        <div className={styles.toolbar}>
          <Input
            wrapperClassName={styles.searchBox}
            placeholder="Pesquisar auditórios..."
            leftIcon={<Search size={18} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
            <p>{searchTerm ? "Nenhum auditório encontrado." : "Nenhum auditório cadastrado ainda."}</p>
          </div>
        ) : (
          <>
            <div className={styles.desktopTableOnly}>
              <Table data={filtered} columns={columns} keyExtractor={(a) => a.id} />
            </div>

            <div className={styles.mobileCardsOnly}>
              <div className={styles.cardsGrid}>
                {filtered.map((auditorium) => (
                  <article key={auditorium.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <h3 className={styles.cardTitle}>{auditorium.name}</h3>
                        <div className={styles.cardSubtitle}>
                          <DollarSign size={14} />
                          {formatMoney(auditorium.price)}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Editar ${auditorium.name}`}
                          onClick={() => openEdit(auditorium)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                          aria-label={`Excluir ${auditorium.name}`}
                          onClick={() => handleDelete(auditorium.id, auditorium.name)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <span style={{ fontFamily: "monospace", fontSize: "0.8rem", opacity: 0.6 }}>
                      {auditorium.slug}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
