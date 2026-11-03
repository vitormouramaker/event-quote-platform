import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, X, MapPin } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { Table } from "../../../components/Table/Table";
import { Input } from "../../../components/Input/Input";
import { LoadingStatePanel, ErrorStatePanel } from "../../../components/AsyncState/AsyncState";
import { useCitiesQuery } from "../queries/useCitiesQuery";
import { useCityMutations } from "../mutations/useCityMutations";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import type { CityDto } from "../../../services/api";
import { isDuplicateName } from "../../../utils/normalizeName";
import styles from "../../auditoriums/styles/AuditoriumsPage.module.css";

type ModalState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; city: CityDto };

export function CitiesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [name, setName] = useState("");

  const { data: cities = [], isLoading, isError, error, refetch } = useCitiesQuery();
  const { data: events = [] } = useEventsQuery();
  const { createMutation, updateMutation, deleteMutation } = useCityMutations();

  // Exclusão de cidade é destrutiva (leva junto os eventos base dela) → exige
  // digitar EXCLUIR, igual ao padrão do orçamento.
  const [cityToDelete, setCityToDelete] = useState<CityDto | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const canConfirmDelete = confirmText === "EXCLUIR";
  const eventsOfCityToDelete = useMemo(
    () => (cityToDelete ? events.filter((e) => e.city === cityToDelete.name) : []),
    [events, cityToDelete],
  );

  function closeDeleteModal() {
    setCityToDelete(null);
    setConfirmText("");
  }

  function confirmDelete() {
    if (!cityToDelete || !canConfirmDelete) return;
    deleteMutation.mutate(cityToDelete.id, { onSuccess: closeDeleteModal });
  }

  const filtered = useMemo(
    () => cities.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [cities, searchTerm],
  );

  function openCreate() {
    setName("");
    setModal({ mode: "create" });
  }

  function openEdit(city: CityDto) {
    setName(city.name);
    setModal({ mode: "edit", city });
  }

  function closeModal() {
    setModal({ mode: "closed" });
  }

  const editingCityId = modal.mode === "edit" ? modal.city.id : undefined;
  const duplicateNameError = useMemo(() => {
    if (modal.mode === "closed" || !name.trim()) return undefined;
    return isDuplicateName(name, cities, editingCityId)
      ? "Já existe uma cidade com esse nome."
      : undefined;
  }, [name, cities, editingCityId, modal.mode]);

  function handleSubmit() {
    if (!name.trim() || duplicateNameError) return;
    const data = { name: name.trim() };
    if (modal.mode === "create") {
      createMutation.mutate(data, { onSuccess: closeModal });
    } else if (modal.mode === "edit") {
      updateMutation.mutate({ id: modal.city.id, data }, { onSuccess: closeModal });
    }
  }

  function handleDelete(city: CityDto) {
    setConfirmText("");
    setCityToDelete(city);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const columns = [
    { header: "Cidade/Local", accessor: "name" as const },
    {
      header: "Ações",
      accessor: (row: CityDto) => (
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
              handleDelete(row);
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
      width: "110px",
    },
  ];

  if (isLoading) return <LoadingStatePanel message="Carregando cidades..." />;

  if (isError) {
    return (
      <ErrorStatePanel
        title="Erro ao carregar cidades"
        message={error instanceof Error ? error.message : "Tente novamente."}
        actions={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Cidades</h1>
          <p className={styles.subtitle}>
            Gerencie as cidades/locais disponíveis na criação de orçamentos.
          </p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={openCreate}>
          Nova cidade
        </Button>
      </header>

      <div className={styles.content}>
        <div className={styles.toolbar}>
          <Input
            wrapperClassName={styles.searchBox}
            placeholder="Pesquisar cidades..."
            leftIcon={<Search size={18} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <MapPin size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
            <p>{searchTerm ? "Nenhuma cidade encontrada." : "Nenhuma cidade cadastrada ainda."}</p>
          </div>
        ) : (
          <>
            <div className={styles.desktopTableOnly}>
              <Table data={filtered} columns={columns} keyExtractor={(c) => c.id} />
            </div>

            <div className={styles.mobileCardsOnly}>
              <div className={styles.cardsGrid}>
                {filtered.map((city) => (
                  <article key={city.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <h3 className={styles.cardTitle}>{city.name}</h3>
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Editar ${city.name}`}
                          onClick={() => openEdit(city)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                          aria-label={`Excluir ${city.name}`}
                          onClick={() => handleDelete(city)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {modal.mode !== "closed" && (
        <ModalShell onBackdropClick={closeModal} maxWidth="440px">
          <div className={styles.modalHeaderCompact}>
            <h3 className={styles.modalTitle}>
              {modal.mode === "create" ? "Nova cidade" : "Editar cidade"}
            </h3>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={closeModal}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.modalBody}>
            <Input
              label="Nome da cidade/local"
              placeholder="Ex: Capital, Litoral, Interior..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={duplicateNameError}
            />
          </div>

          <div className={styles.modalFooter}>
            <Button variant="outline" onClick={closeModal} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim() || Boolean(duplicateNameError)}>
              {isPending ? "Salvando..." : modal.mode === "create" ? "Criar" : "Salvar"}
            </Button>
          </div>
        </ModalShell>
      )}

      {cityToDelete && (
        <ModalShell onBackdropClick={closeDeleteModal} maxWidth="440px">
          <div className={styles.modalHeaderCompact}>
            <h3 className={styles.modalTitle}>Excluir cidade</h3>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={closeDeleteModal}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.modalBody}>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--color-text-secondary)" }}>
              A cidade <strong style={{ color: "var(--color-text-main)" }}>{cityToDelete.name}</strong> será
              excluída permanentemente.
            </p>

            {eventsOfCityToDelete.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--color-error, #ef4444)",
                  background: "rgba(239,68,68,0.08)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <strong>{eventsOfCityToDelete.length} evento(s) base</strong> desta cidade também
                serão excluídos:
                <div style={{ marginTop: 6, color: "var(--color-text-secondary)" }}>
                  {eventsOfCityToDelete.map((e) => e.name).join(", ")}
                </div>
              </div>
            )}

            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              Para confirmar, digite{" "}
              <strong style={{ color: "var(--color-error, #ef4444)" }}>EXCLUIR</strong> abaixo:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              autoFocus
              style={{
                width: "100%",
                height: 40,
                padding: "0 12px",
                border: `1px solid ${canConfirmDelete ? "var(--color-error, #ef4444)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: 14,
                color: "var(--color-text-main)",
                backgroundColor: "var(--color-surface)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div className={styles.modalFooter}>
            <Button variant="outline" onClick={closeDeleteModal} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={!canConfirmDelete || deleteMutation.isPending}
              style={{
                backgroundColor: canConfirmDelete ? "#ef4444" : "var(--color-border)",
                color: canConfirmDelete ? "#fff" : "var(--color-text-muted)",
                border: "none",
                cursor: canConfirmDelete ? "pointer" : "not-allowed",
              }}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir cidade"}
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
