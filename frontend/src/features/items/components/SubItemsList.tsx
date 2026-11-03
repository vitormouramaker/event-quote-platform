import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Search, Sparkles, CheckSquare, Square, Copy } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { Button } from "../../../components/Button/Button";
import { Table } from "../../../components/Table/Table";
import { useSubItemsQuery } from "../queries/useSubItemsQuery";
import { useSubItemMutations } from "../mutations/useSubItemMutations";
import { LoadingStatePanel, ErrorStatePanel } from "../../../components/AsyncState/AsyncState";
import { Input } from "../../../components/Input/Input";
import { Pagination } from "../../../components/Pagination/Pagination";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { isDuplicateName } from "../../../utils/normalizeName";
import styles from "../styles/ItemsPage.module.css";

const ITEMS_PER_PAGE = 20;

interface SubItemsListProps {
  createRequestKey?: number;
}

export function SubItemsList({ createRequestKey = 0 }: SubItemsListProps) {
  const { data: subItems = [], isLoading, isError, error, refetch } = useSubItemsQuery();
  const { createMutation, updateMutation, deleteMutation } = useSubItemMutations();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<{ id: string; name: string } | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [subItemName, setSubItemName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    if (createRequestKey > 0) {
      handleOpenModal();
    }
  }, [createRequestKey]);

  const filteredItems = useMemo(
    () =>
      subItems.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [subItems, searchTerm],
  );

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((it) => selectedIds.has(it.id));
  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const it of filteredItems) next.add(it.id);
      return next;
    });
  };
  const deselectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const it of filteredItems) next.delete(it.id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRunning(true);
    let ok = 0;
    let err = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteMutation.mutateAsync(id);
        ok += 1;
      } catch {
        err += 1;
      }
    }
    if (ok > 0) toast.success(`${ok} sub-item(ns) excluído(s).`);
    if (err > 0) toast.error(`${err} sub-item(ns) falhou ao excluir.`);
    clearSelection();
    setBulkDeleteOpen(false);
    setIsBulkRunning(false);
  };

  const handleOpenModal = (subItem?: { id: string; name: string }) => {
    if (subItem) {
      setEditingSubItem(subItem);
      setSubItemName(subItem.name);
    } else {
      setEditingSubItem(null);
      setSubItemName("");
    }
    setIsDuplicating(false);
    setIsModalOpen(true);
  };

  const handleOpenDuplicateModal = (subItem: { id: string; name: string }) => {
    setEditingSubItem(subItem);
    setSubItemName(`${subItem.name} (cópia)`);
    setIsDuplicating(true);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSubItem(null);
    setIsDuplicating(false);
    setSubItemName("");
  };

  const duplicateNameError = useMemo(() => {
    if (!subItemName.trim()) return undefined;
    const skipId = isDuplicating ? undefined : editingSubItem?.id;
    return isDuplicateName(subItemName, subItems, skipId)
      ? "Já existe um sub-item com esse nome."
      : undefined;
  }, [subItemName, subItems, editingSubItem, isDuplicating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!subItemName.trim()) return;
    if (duplicateNameError) return;

    if (editingSubItem && !isDuplicating) {
      updateMutation.mutate(
        { id: editingSubItem.id, data: { name: subItemName.trim() } },
        { onSuccess: handleCloseModal },
      );
      return;
    }

    createMutation.mutate(
      { name: subItemName.trim() },
      { onSuccess: handleCloseModal },
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Excluir o sub-item "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const subItemColumns = [
    {
      header: (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (allFilteredSelected) deselectAllFiltered();
            else selectAllFiltered();
          }}
          title={allFilteredSelected ? "Desmarcar todos" : "Marcar todos"}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            padding: 0,
          }}
        >
          {allFilteredSelected ? (
            <CheckSquare size={18} color="var(--color-primary)" />
          ) : (
            <Square size={18} color="var(--color-text-secondary)" />
          )}
        </button>
      ),
      accessor: (row: (typeof subItems)[number]) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSelected(row.id);
          }}
          title={selectedIds.has(row.id) ? "Desmarcar" : "Selecionar"}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            padding: 0,
          }}
        >
          {selectedIds.has(row.id) ? (
            <CheckSquare size={18} color="var(--color-primary)" />
          ) : (
            <Square size={18} color="var(--color-text-secondary)" />
          )}
        </button>
      ),
      width: "48px",
    },
    { header: "Sub-item", accessor: "name" as const },
    {
      header: "Tipo",
      accessor: () => (
        <div className={styles.cardSubtitle}>
          <Sparkles size={14} />
          Sub-item base
        </div>
      ),
    },
    {
      header: "ID",
      accessor: (row: (typeof subItems)[number]) => <span className={styles.tableMuted}>{row.id}</span>,
      width: "120px",
    },
    {
      header: "Ações",
      accessor: (row: (typeof subItems)[number]) => (
        <div className={styles.tableActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Duplicar ${row.name}`}
            title="Duplicar"
            onClick={() => handleOpenDuplicateModal(row)}
          >
            <Copy size={18} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Editar ${row.name}`}
            onClick={() => handleOpenModal(row)}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            className={clsx(styles.iconButton, styles.iconButtonDanger)}
            aria-label={`Excluir ${row.name}`}
            onClick={() => handleDelete(row.id, row.name)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
      width: "150px",
    },
  ];

  if (isLoading) return <LoadingStatePanel message="Carregando sub-itens..." />;

  if (isError) {
    return (
      <ErrorStatePanel
        title="Erro ao carregar sub-itens"
        message={error instanceof Error ? error.message : "Tente novamente."}
        actions={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 150,
            padding: "10px 20px",
            background: "var(--color-primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckSquare size={18} />
            <strong>{selectedIds.size}</strong>
            <span>sub-item(ns) selecionado(s)</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                style={{
                  padding: "6px 12px",
                  border: "1px solid rgba(255,255,255,0.6)",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {allFilteredSelected
                  ? `Desmarcar todos (${filteredItems.length})`
                  : `Marcar todos (${filteredItems.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              style={{
                padding: "6px 12px",
                border: "1px solid #dc2626",
                borderRadius: "8px",
                background: "#dc2626",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Excluir
            </button>
            <button
              type="button"
              onClick={clearSelection}
              style={{
                padding: "6px 12px",
                border: "1px solid rgba(255,255,255,0.6)",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <ModalShell
          onBackdropClick={() => !isBulkRunning && setBulkDeleteOpen(false)}
          maxWidth="480px"
          zIndex={185}
        >
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>Excluir sub-itens selecionados</h3>
          </div>
          <div className={styles.modalBody}>
            <p>
              {selectedIds.size} sub-item(ns) serão excluídos permanentemente. Esta
              ação não pode ser desfeita.
            </p>
          </div>
          <div className={styles.modalFooter}>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={isBulkRunning}
            >
              Cancelar
            </Button>
            <Button isLoading={isBulkRunning} onClick={() => void handleBulkDelete()}>
              Confirmar exclusão
            </Button>
          </div>
        </ModalShell>
      )}

      <div className={styles.toolbar}>
        <Input
          wrapperClassName={styles.searchBox}
          placeholder="Pesquisar sub-itens..."
          leftIcon={<Search size={18} />}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Nenhum sub-item encontrado.</p>
        </div>
      ) : (
        <>
          <div className={styles.desktopTableOnly}>
            <Table
              data={paginatedItems}
              columns={subItemColumns}
              keyExtractor={(item) => item.id}
            />
          </div>

          <div className={styles.mobileCardsOnly}>
            <div className={clsx(styles.cardsGrid, styles.subItemGrid)}>
              {paginatedItems.map((item) => (
                <article key={item.id} className={clsx(styles.card, styles.subItemCard)}>
                  <div className={styles.subItemCardBody}>
                    <div className={styles.cardHeader}>
                      <button
                        type="button"
                        onClick={() => toggleSelected(item.id)}
                        title={selectedIds.has(item.id) ? "Desmarcar" : "Selecionar"}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                          marginRight: 8,
                          alignSelf: "flex-start",
                          display: "flex",
                        }}
                      >
                        {selectedIds.has(item.id) ? (
                          <CheckSquare size={20} color="var(--color-primary)" />
                        ) : (
                          <Square size={20} color="var(--color-text-secondary)" />
                        )}
                      </button>
                      <div className={styles.cardTitleGroup}>
                        <h3 className={styles.cardTitle}>{item.name}</h3>
                        <div className={styles.cardSubtitle}>
                          <Sparkles size={14} />
                          Sub-item base
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Duplicar ${item.name}`}
                          title="Duplicar"
                          onClick={() => handleOpenDuplicateModal(item)}
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Editar ${item.name}`}
                          onClick={() => handleOpenModal(item)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className={clsx(styles.iconButton, styles.iconButtonDanger)}
                          aria-label={`Excluir ${item.name}`}
                          onClick={() => handleDelete(item.id, item.name)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.subItemMeta}>ID: {item.id}</div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      {isModalOpen && (
        <ModalShell onBackdropClick={handleCloseModal} maxWidth="420px">
          <form onSubmit={handleSubmit}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {isDuplicating
                  ? "Duplicar sub-item"
                  : editingSubItem
                    ? "Editar sub-item"
                    : "Novo sub-item"}
              </h3>
            </div>

            <div className={styles.modalBody}>
              <Input
                label="Nome do sub-item"
                value={subItemName}
                onChange={(e) => setSubItemName(e.target.value)}
                autoFocus
                required
                error={duplicateNameError}
              />
            </div>

            <div className={styles.modalFooter}>
              <Button variant="outline" type="button" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                isLoading={createMutation.isPending || updateMutation.isPending}
                disabled={Boolean(duplicateNameError) || !subItemName.trim()}
              >
                Salvar
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}
