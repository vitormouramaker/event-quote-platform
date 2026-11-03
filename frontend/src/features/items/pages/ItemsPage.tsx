import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  DollarSign,
  Layers,
  Edit3,
  Zap,
  Info,
  X,
  CheckSquare,
  Square,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { Button } from "../../../components/Button/Button";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { Table } from "../../../components/Table/Table";
import { useItemsQuery } from "../queries/useItemsQuery";
import { useItemMutations } from "../mutations/useItemMutations";
import { LoadingStatePanel, ErrorStatePanel } from "../../../components/AsyncState/AsyncState";
import { SubItemsList } from "../components/SubItemsList";
import { Input } from "../../../components/Input/Input";
import { Pagination } from "../../../components/Pagination/Pagination";
import { isDuplicateName } from "../../../utils/normalizeName";
import type { BaseItemDto, ItemWriteDto } from "../../../services/api";
import styles from "../styles/ItemsPage.module.css";
import { getDisplayItemName, matchesItemSearch } from "../utils/itemNameDedup";

const ITEMS_PER_PAGE = 20;

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"items" | "subitems">("items");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [subItemCreateRequestKey, setSubItemCreateRequestKey] = useState(0);

  const { data: items = [], isLoading, isError, error, refetch } = useItemsQuery();
  const { deleteMutation, createMutation } = useItemMutations();

  const [duplicateSource, setDuplicateSource] = useState<BaseItemDto | null>(null);
  const [duplicateName, setDuplicateName] = useState("");

  const openDuplicateModal = (item: BaseItemDto) => {
    setDuplicateSource(item);
    setDuplicateName(`${item.name} (cópia)`);
  };
  const closeDuplicateModal = () => {
    setDuplicateSource(null);
    setDuplicateName("");
  };

  const duplicateNameError = useMemo(() => {
    if (!duplicateSource) return undefined;
    if (!duplicateName.trim()) return undefined;
    return isDuplicateName(duplicateName, items)
      ? "Já existe um item com esse nome."
      : undefined;
  }, [duplicateName, items, duplicateSource]);

  const handleConfirmDuplicate = () => {
    if (!duplicateSource) return;
    const trimmed = duplicateName.trim();
    if (!trimmed || duplicateNameError) return;
    const payload: ItemWriteDto = {
      name: trimmed,
      unit_price: Number(duplicateSource.unit_price) || 0,
      default_quantity: Number(duplicateSource.default_quantity) || 1,
      editable: Boolean(duplicateSource.editable),
      dynamic_by_students: Boolean(duplicateSource.dynamic_by_students),
      has_subitems: Boolean(duplicateSource.has_subitems),
      subitems: (duplicateSource.subitems ?? []).map((s) => ({ name: s.name })),
      variations: (duplicateSource.variations ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        unit_price: Number(v.unit_price) || 0,
        default_quantity: Number(v.default_quantity) || 1,
      })),
      has_additional: Boolean(duplicateSource.has_additional),
      additional_quantity: Number(duplicateSource.additional_quantity ?? 0) || 0,
      has_multiplier: Boolean(duplicateSource.has_multiplier),
      multiplier_quantity: Number(duplicateSource.multiplier_quantity ?? 0) || 0,
    };
    createMutation.mutate(payload, { onSuccess: closeDuplicateModal });
  };

  type ItemStatusFlag =
    | "editable"
    | "dynamic"
    | "has_subitems"
    | "has_additional";
  const [statusFlags, setStatusFlags] = useState<Set<ItemStatusFlag>>(new Set());
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const toggleStatusFlag = (flag: ItemStatusFlag) => {
    setStatusFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
    setCurrentPage(1);
  };

  const hasItemFiltersActive =
    statusFlags.size > 0 || Boolean(priceMin) || Boolean(priceMax) || Boolean(searchTerm.trim());

  const clearItemFilters = () => {
    setSearchTerm("");
    setStatusFlags(new Set());
    setPriceMin("");
    setPriceMax("");
    setCurrentPage(1);
  };

  const filteredItems = useMemo(() => {
    const minPrice = priceMin ? Number(priceMin) : null;
    const maxPrice = priceMax ? Number(priceMax) : null;
    const flags = Array.from(statusFlags);
    return items.filter((item) => {
      if (!matchesItemSearch(item.name, searchTerm)) return false;
      const price = Number(item.unit_price) || 0;
      if (minPrice !== null && price < minPrice) return false;
      if (maxPrice !== null && price > maxPrice) return false;
      if (flags.length > 0) {
        for (const flag of flags) {
          if (flag === "editable" && !item.editable) return false;
          if (flag === "dynamic" && !item.dynamic_by_students) return false;
          if (flag === "has_subitems" && !item.has_subitems) return false;
          if (flag === "has_additional" && !item.has_additional) return false;
        }
      }
      return true;
    });
  }, [items, searchTerm, statusFlags, priceMin, priceMax]);

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
    clearSelection();
  }, [activeTab]);

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
    const ids = Array.from(selectedIds);
    let ok = 0;
    let err = 0;
    for (const id of ids) {
      try {
        await deleteMutation.mutateAsync(id);
        ok += 1;
      } catch {
        err += 1;
      }
    }
    if (ok > 0) toast.success(`${ok} item(ns) excluído(s).`);
    if (err > 0) toast.error(`${err} item(ns) falhou ao excluir.`);
    clearSelection();
    setBulkDeleteOpen(false);
    setIsBulkRunning(false);
  };

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const itemToView = useMemo(
    () => items.find((item) => item.id === viewingItemId) ?? null,
    [items, viewingItemId],
  );

  const itemColumns = [
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
      accessor: (row: (typeof items)[number]) => (
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
    { header: "Item", accessor: (row: (typeof items)[number]) => row.name },
    {
      header: "Valor",
      accessor: (row: (typeof items)[number]) => (
        <div className={styles.tableMoney}>
          <DollarSign size={14} />
          {formatMoney(row.unit_price)}
        </div>
      ),
    },
    {
      header: "Qtd. padrão",
      accessor: (row: (typeof items)[number]) => row.default_quantity,
      width: "120px",
    },
    {
      header: "Sub-itens",
      accessor: (row: (typeof items)[number]) => {
        const subitemsCount = row.subitems?.length || 0;
        const canViewSubitems = row.has_subitems && subitemsCount > 0;

        return (
          <div className={styles.tableSubitems}>
            <span className={styles.tableSubitemsCount}>
              <Layers size={14} />
              {subitemsCount}
            </span>
            {canViewSubitems && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Ver sub-itens de ${getDisplayItemName(row.name)}`}
                title="Ver sub-itens"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingItemId(row.id);
                }}
              >
                <Info size={16} />
              </button>
            )}
          </div>
        );
      },
      width: "140px",
    },
    {
      header: "Status",
      accessor: (row: (typeof items)[number]) => (
        <div className={styles.badgeRow}>
          {row.editable && (
            <div title="Editável no orçamento" className={clsx(styles.badge, styles.badgeInfo)}>
              <Edit3 size={12} />
              Editável
            </div>
          )}
          {row.dynamic_by_students && (
            <div
              title="Dinâmico conforme formandos"
              className={clsx(styles.badge, styles.badgeSuccess)}
            >
              <Zap size={12} />
              Dinâmico
            </div>
          )}
          {!row.editable && !row.dynamic_by_students && <span className={styles.tableMuted}>Padrão</span>}
        </div>
      ),
    },
    {
      header: "Ações",
      accessor: (row: (typeof items)[number]) => (
        <div className={styles.tableActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Duplicar ${getDisplayItemName(row.name)}`}
            title="Duplicar"
            onClick={(e) => {
              e.stopPropagation();
              openDuplicateModal(row);
            }}
          >
            <Copy size={18} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Editar ${getDisplayItemName(row.name)}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/items/${row.id}`);
            }}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            className={clsx(styles.iconButton, styles.iconButtonDanger)}
            aria-label={`Excluir ${getDisplayItemName(row.name)}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.id, row.name);
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
      width: "150px",
    },
  ];

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Excluir o item "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  if (activeTab === "items" && isLoading) {
    return <LoadingStatePanel message="Carregando itens..." />;
  }

  if (activeTab === "items" && isError) {
    return (
      <ErrorStatePanel
        title="Erro ao carregar itens"
        message={error instanceof Error ? error.message : "Tente novamente."}
        actions={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className={styles.page}>
      {activeTab === "items" && selectedIds.size > 0 && (
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
            <span>item(ns) selecionado(s)</span>
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
            <h3 className={styles.modalTitle}>Excluir itens selecionados</h3>
          </div>
          <div className={styles.modalBody}>
            <p>
              {selectedIds.size} item(ns) serão excluídos permanentemente. Esta ação
              não pode ser desfeita.
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

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Itens base</h1>
          <p className={styles.subtitle}>Gerencie os itens e sub-itens usados nos orçamentos.</p>
        </div>
        {activeTab === "items" && (
          <Button leftIcon={<Plus size={18} />} onClick={() => navigate("/items/create")}>
            Novo item
          </Button>
        )}
        {activeTab === "subitems" && (
          <Button leftIcon={<Plus size={18} />} onClick={() => setSubItemCreateRequestKey((value) => value + 1)}>
            Novo sub-item
          </Button>
        )}
      </header>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={clsx(styles.tabButton, activeTab === "items" && styles.tabButtonActive)}
          onClick={() => {
            setActiveTab("items");
            setCurrentPage(1);
          }}
        >
          Itens
        </button>
        <button
          type="button"
          className={clsx(styles.tabButton, activeTab === "subitems" && styles.tabButtonActive)}
          onClick={() => {
            setActiveTab("subitems");
            setCurrentPage(1);
          }}
        >
          Sub-itens
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === "items" ? (
          <>
            <div className={styles.toolbar}>
              <Input
                wrapperClassName={styles.searchBox}
                placeholder="Pesquisar itens..."
                leftIcon={<Search size={18} />}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "12px",
                padding: "10px 12px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
              }}
            >
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(
                  [
                    { value: "editable", label: "Editável" },
                    { value: "dynamic", label: "Dinâmico" },
                    { value: "has_subitems", label: "Possui sub-itens" },
                    { value: "has_additional", label: "Possui adicional" },
                  ] as Array<{ value: ItemStatusFlag; label: string }>
                ).map((opt) => {
                  const active = statusFlags.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleStatusFlag(opt.value)}
                      style={{
                        padding: "4px 10px",
                        border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                        borderRadius: "999px",
                        background: active ? "var(--color-primary)" : "var(--color-background)",
                        color: active ? "#fff" : "var(--color-text-main)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 500,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>R$ de</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={priceMin}
                  onChange={(e) => {
                    setPriceMin(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: "90px",
                    padding: "6px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-background)",
                    color: "var(--color-text-main)",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>até</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="∞"
                  value={priceMax}
                  onChange={(e) => {
                    setPriceMax(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: "90px",
                    padding: "6px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-background)",
                    color: "var(--color-text-main)",
                    fontSize: "13px",
                  }}
                />
              </div>

              {hasItemFiltersActive && (
                <button
                  type="button"
                  onClick={clearItemFilters}
                  style={{
                    marginLeft: "auto",
                    padding: "6px 10px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-bg-tertiary)",
                    cursor: "pointer",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <X size={12} /> Limpar filtros
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum item encontrado.</p>
              </div>
            ) : (
              <>
                <div className={styles.desktopTableOnly}>
                  <Table
                    data={paginatedItems}
                    columns={itemColumns}
                    keyExtractor={(item) => item.id}
                  />
                </div>

                <div className={styles.mobileCardsOnly}>
                  <div className={styles.cardsGrid}>
                    {paginatedItems.map((item) => {
                      const subitemsCount = item.subitems?.length || 0;
                      const canViewSubitems = item.has_subitems && subitemsCount > 0;

                      return (
                        <article key={item.id} className={styles.card}>
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
                                <DollarSign size={14} />
                                {formatMoney(item.unit_price)}
                              </div>
                            </div>

                            <div className={styles.cardActions}>
                              {canViewSubitems && (
                                <button
                                  type="button"
                                  className={styles.iconButton}
                                  aria-label={`Ver sub-itens de ${item.name}`}
                                  title="Ver sub-itens"
                                  onClick={() => setViewingItemId(item.id)}
                                >
                                  <Info size={18} />
                                </button>
                              )}
                              <button
                                type="button"
                                className={styles.iconButton}
                                aria-label={`Duplicar ${item.name}`}
                                title="Duplicar"
                                onClick={() => openDuplicateModal(item)}
                              >
                                <Copy size={18} />
                              </button>
                              <button
                                type="button"
                                className={styles.iconButton}
                                aria-label={`Editar ${item.name}`}
                                onClick={() => navigate(`/items/${item.id}`)}
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

                          <div className={styles.metricGrid}>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>Qtd. padrão</span>
                              <span className={styles.metricValue}>{item.default_quantity}</span>
                            </div>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>Sub-itens</span>
                              <span className={styles.metricValue}>
                                <Layers size={14} />
                                {subitemsCount}
                              </span>
                            </div>
                          </div>

                          <div className={styles.badgeRow}>
                            {item.editable && (
                              <div title="Editável no orçamento" className={clsx(styles.badge, styles.badgeInfo)}>
                                <Edit3 size={12} />
                                Editável
                              </div>
                            )}
                            {item.dynamic_by_students && (
                              <div
                                title="Dinâmico conforme formandos"
                                className={clsx(styles.badge, styles.badgeSuccess)}
                              >
                                <Zap size={12} />
                                Dinâmico
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        ) : (
          <SubItemsList createRequestKey={subItemCreateRequestKey} />
        )}
      </div>

      {duplicateSource && (
        <ModalShell onBackdropClick={closeDuplicateModal} maxWidth="420px">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmDuplicate();
            }}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Duplicar item</h3>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: 12, color: "var(--color-text-secondary)", fontSize: 13 }}>
                Será criada uma cópia de <strong>{duplicateSource.name}</strong> com todas as
                especificidades. Informe o novo nome.
              </p>
              <Input
                label="Nome do novo item"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                autoFocus
                required
                error={duplicateNameError}
              />
            </div>
            <div className={styles.modalFooter}>
              <Button variant="outline" type="button" onClick={closeDuplicateModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                isLoading={createMutation.isPending}
                disabled={Boolean(duplicateNameError) || !duplicateName.trim()}
              >
                Duplicar
              </Button>
            </div>
          </form>
        </ModalShell>
      )}

      {viewingItemId && itemToView && (
        <ModalShell onBackdropClick={() => setViewingItemId(null)} maxWidth="500px">
          <div className={styles.modalHeaderCompact}>
            <div>
              <h3 className={styles.modalTitle}>{itemToView.name}</h3>
              <div className={styles.modalMetaRow}>
                <p className={styles.modalMetaText}>Sub-itens inclusos</p>
                <span className={styles.modalCountPill}>{itemToView.subitems?.length || 0}</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={() => setViewingItemId(null)}
              aria-label="Fechar modal"
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.modalBodyScrollable}>
            <div className={styles.modalSubitemsList}>
              {itemToView.subitems?.map((subitem, index) => (
                <div key={`${subitem.id ?? subitem.name}-${index}`} className={styles.modalSubitemRow}>
                  <div className={styles.modalSubitemDot} />
                  {subitem.name}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.modalFooter}>
            <Button size="sm" onClick={() => setViewingItemId(null)}>
              Fechar
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
