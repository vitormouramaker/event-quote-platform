import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAnnexesQuery } from "../../annexes/queries/useAnnexesQuery";
import { useAnnexMutations } from "../../annexes/mutations/useAnnexMutations";
import { wasEditedByAnnex } from "../../annexes/data/annexBudgetWriteBack";
import {
  Plus,
  Trash2,
  Printer,
  FileSpreadsheet,
  Pencil,
  Eye,
  Calendar,
  Phone,
  Hash,
  Users,
  GraduationCap,
  Send,
  Copy,
  Lock,
  FolderOpen,
  Archive,
  ArchiveRestore,
  Search,
  X,
  CheckSquare,
  Square,
  MessageSquareText,
} from "lucide-react";
import { mapBudget, type Budget } from "../../../store/budgetStore";
import { formatAppliedDiscount } from "../domain/discountInput";
import { useAuthStore } from "../../../store/authStore";
import { Button } from "../../../components/Button/Button";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import styles from "../styles/BudgetsDashboard.module.css";
import { toast } from "sonner";
import { useBudgetsQuery } from "../queries/useBudgetsQuery";
import { useDeleteBudgetMutation } from "../mutations/useDeleteBudgetMutation";
import { useEditRequestsQuery } from "../queries/useEditRequestsQuery";
import { useCreateEditRequestMutation } from "../mutations/useEditRequestMutations";
import { budgetsApi } from "../../../services/api";
import {
  useArchiveBudgetMutation,
  useUpdateBudgetStatusMutation,
} from "../mutations/useBudgetMutations";
import {
  openBudgetPrintShell,
  renderBudgetPrintWindow,
  type BudgetPrintView,
  type BudgetPrintMode,
} from "../print/budgetPrint";
import { BudgetCitySelectionModal } from "../components/BudgetCitySelectionModal";
import { buildBudgetEventsCatalog, type BudgetCity } from "../data/budgetCatalog";
import { computeBudgetSummaryTotals } from "../domain/budgetTotals";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import { BudgetPreviewContent } from "../components/BudgetPreviewContent";
import { BudgetReviewModal } from "../components/BudgetReviewModal";
import { formatDateBR } from "../../../utils/date";

// Nº de formandos do card: usa "Qtd. Geral de Formandos" (studentsQuantity). Como
// o campo é opcional, cai para a maior participação por evento quando vazio.
function getBudgetStudentsCount(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const d = data as Record<string, unknown>;
  const general = Number(d.studentsQuantity);
  if (Number.isFinite(general) && general > 0) return general;
  let max = 0;
  for (const [key, value] of Object.entries(d)) {
    if (!key.startsWith("participation_")) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

const PAGE_SIZE = 20;

// Momento da última mexida no orçamento (edição > criação).
function editTime(b: Budget): number {
  const t = new Date(b.updatedAt || b.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Edição mais recente dentro de uma pasta de versões.
function groupEditTime(versions: Budget[]): number {
  return versions.reduce((max, b) => Math.max(max, editTime(b)), 0);
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const go = (p: number) => {
    onChange(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-main)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontSize: 13,
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 16,
      }}
    >
      <button
        type="button"
        style={btn(page <= 1)}
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        Anterior
      </button>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
        Página {page} de {pageCount}
      </span>
      <button
        type="button"
        style={btn(page >= pageCount)}
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

export function BudgetsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    data: budgets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useBudgetsQuery();
  const { data: editRequests = [] } = useEditRequestsQuery();
  const { data: eventTemplates } = useEventsQuery();
  const budgetEvents = useMemo(
    () => buildBudgetEventsCatalog(eventTemplates),
    [eventTemplates],
  );

  // Valor exibido no card recalculado a partir dos dados versionados, para
  // não depender do total persistido (que pode estar defasado em versões
  // antigas). Faz fallback para o valor salvo quando faltam dados.
  const getCardDisplayValues = useCallback(
    (budget: Budget): { total: number; original?: number } => {
      const selectedEvents = (budget.data?.selectedEvents as string[] | undefined) ?? [];
      if (selectedEvents.length === 0 || budgetEvents.length === 0) {
        return { total: budget.totalValue, original: budget.originalTotalValue };
      }
      const { subtotal, totalDiscounted } = computeBudgetSummaryTotals(budget, budgetEvents);
      return {
        total: totalDiscounted,
        original: subtotal > totalDiscounted ? subtotal : undefined,
      };
    },
    [budgetEvents],
  );
  const deleteBudgetMutation = useDeleteBudgetMutation();
  const createEditRequestMutation = useCreateEditRequestMutation();
  const updateBudgetStatusMutation = useUpdateBudgetStatusMutation();
  const archiveBudgetMutation = useArchiveBudgetMutation();

  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  const canArchive = isAdmin;
  const isBudgetAnalyst = user?.role === "ADM_ANALISTA_ORCAMENTO";
  // Visão de todos os orçamentos é estritamente por credencial: master,
  // gerente e analista veem todos; orçamento vê apenas os próprios.
  const canViewAllBudgets = isAdmin || isBudgetAnalyst;
  const canCreateBudget =
    !isBudgetAnalyst && (isAdmin || user?.perm_create_budget === true);
  const canEditBudget =
    !isBudgetAnalyst &&
    (isAdmin || user?.role === "ADM_ORCAMENTO" || user?.perm_edit_budget === true);
  const canDeleteBudget =
    !isBudgetAnalyst && (isAdmin || user?.perm_delete_budget === true);
  const canChangeBudgetStatus =
    !isBudgetAnalyst &&
    (user?.role === "ADM_ORCAMENTO" ||
      user?.role === "ADM_MASTER" ||
      user?.role === "ADM_GERENTE");

  const visibleBudgetsAll = canViewAllBudgets
    ? budgets
    : budgets.filter(
        (b) => b.createdByName === user?.name || b.createdBy === user?.name,
      );

  // ===== Filtros =====
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<Budget["status"]>>(
    new Set(),
  );
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterCreatedBy, setFilterCreatedBy] = useState("");

  const createdByOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of visibleBudgetsAll) {
      const name = b.createdByName || b.createdBy;
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [visibleBudgetsAll]);

  const matchesFilters = (b: Budget): boolean => {
    if (statusFilters.size > 0 && !statusFilters.has(b.status)) return false;
    if (
      filterCreatedBy &&
      (b.createdByName || b.createdBy) !== filterCreatedBy
    )
      return false;
    if (filterStartDate || filterEndDate) {
      const created = new Date(b.createdAt);
      if (Number.isNaN(created.getTime())) return false;
      if (filterStartDate) {
        const start = new Date(`${filterStartDate}T00:00:00`);
        if (created < start) return false;
      }
      if (filterEndDate) {
        const end = new Date(`${filterEndDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        if (created >= end) return false;
      }
    }
    if (searchTerm.trim()) {
      // Busca independe de acentos e caixa (ex.: "orcamento" acha "Orçamento").
      const normalizeSearch = (value: string) =>
        value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const q = normalizeSearch(searchTerm.trim());
      const haystack = normalizeSearch(
        [
          b.instituicao,
          b.curso,
          b.comissao,
          b.controle,
          b.budgetCode,
          b.parentId,
          b.id,
          b.createdByName,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!haystack.includes(q)) return false;
    }
    return true;
  };

  const filteredBudgetsAll = useMemo(
    () => visibleBudgetsAll.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      visibleBudgetsAll,
      searchTerm,
      statusFilters,
      filterStartDate,
      filterEndDate,
      filterCreatedBy,
    ],
  );
  const visibleBudgets = filteredBudgetsAll.filter((b) => !b.archivedAt);
  const archivedBudgets = useMemo(
    () => filteredBudgetsAll.filter((b) => !!b.archivedAt),
    [filteredBudgetsAll],
  );

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    statusFilters.size > 0 ||
    Boolean(filterStartDate) ||
    Boolean(filterEndDate) ||
    Boolean(filterCreatedBy);

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilters(new Set());
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterCreatedBy("");
  };

  const toggleStatusFilter = (status: Budget["status"]) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  // Modal de Solicitação de Edição
  const [editRequestModal, setEditRequestModal] = useState<{
    open: boolean;
    budget: Budget | null;
  }>({ open: false, budget: null });
  const [editReason, setEditReason] = useState("");
  const [pendingStatusByBudgetId, setPendingStatusByBudgetId] = useState<
    Record<string, Budget["status"]>
  >({});
  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    open: boolean;
    budget: Budget | null;
    nextStatus: Budget["status"] | null;
  }>({ open: false, budget: null, nextStatus: null });
  const [printModal, setPrintModal] = useState<{
    open: boolean;
    budget: Budget | null;
    view?: BudgetPrintView;
  }>({
    open: false,
    budget: null,
  });
  const [shareModal, setShareModal] = useState<{
    open: boolean;
    loading: boolean;
    link: string;
    budget: Budget | null;
  }>({ open: false, loading: false, link: "", budget: null });
  const [shareCopied, setShareCopied] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    budget: Budget | null;
  }>({
    open: false,
    budget: null,
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [isBudgetCityModalOpen, setIsBudgetCityModalOpen] = useState(false);
  const [previewBudget, setPreviewBudget] = useState<Budget | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [reviewBudget, setReviewBudget] = useState<Budget | null>(null);

  // Aba, pasta de versoes e pagina vivem na URL. Assim o "voltar" do navegador
  // devolve o usuario exatamente onde estava (ex.: dentro da pasta de versoes),
  // em vez de recomecar na aba de originais.
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      // Forma funcional: duas chamadas no mesmo handler leem sempre o valor mais
      // recente (com o valor da renderizacao, a segunda desfazia a primeira).
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      });
    },
    [setSearchParams],
  );

  const tabParam = searchParams.get("tab");
  const activeTab: "originals" | "versions" | "archived" =
    tabParam === "versions" || tabParam === "archived" ? tabParam : "originals";

  const setActiveTab = useCallback(
    (tab: "originals" | "versions" | "archived") => {
      updateParams((params) => {
        if (tab === "originals") params.delete("tab");
        else params.set("tab", tab);
        // Trocar de aba fecha a pasta aberta e volta para a 1a pagina.
        params.delete("code");
        params.delete("page");
      });
    },
    [updateParams],
  );
  const [archiveModal, setArchiveModal] = useState<{
    open: boolean;
    budget: Budget | null;
    mode: "archive" | "unarchive";
  }>({ open: false, budget: null, mode: "archive" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<{
    open: boolean;
    action: "archive" | "unarchive" | "delete" | null;
  }>({ open: false, action: null });
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

  const handleBulkConfirm = async () => {
    const action = bulkModal.action;
    if (!action || selectedIds.size === 0) return;
    setIsBulkRunning(true);
    const ids = Array.from(selectedIds);
    let okCount = 0;
    let errCount = 0;
    try {
      for (const id of ids) {
        try {
          if (action === "delete") {
            await deleteBudgetMutation.mutateAsync(id);
          } else {
            await archiveBudgetMutation.mutateAsync({
              id,
              archived: action === "archive",
            });
          }
          okCount += 1;
        } catch {
          errCount += 1;
        }
      }
      if (okCount > 0) {
        const label =
          action === "delete"
            ? "excluído(s)"
            : action === "archive"
              ? "arquivado(s)"
              : "desarquivado(s)";
        toast.success(`${okCount} orçamento(s) ${label}.`);
      }
      if (errCount > 0) {
        toast.error(`${errCount} item(ns) falhou ao processar.`);
      }
      clearSelection();
      setBulkModal({ open: false, action: null });
    } finally {
      setIsBulkRunning(false);
    }
  };
  const selectedVersionCode = searchParams.get("code");

  const setSelectedVersionCode = useCallback(
    (code: string | null) => {
      updateParams((params) => {
        if (code) {
          params.set("tab", "versions");
          params.set("code", code);
        } else {
          params.delete("code");
        }
        params.delete("page");
      });
    },
    [updateParams],
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, selectedVersionCode]);

  const originalBudgets = useMemo(() => {
    return visibleBudgets.filter((b) => !b.parentId);
  }, [visibleBudgets]);

  // So uma lista pagina por vez (a aba/pasta define qual), entao um unico
  // parametro "page" na URL cobre originais, pastas e versoes da pasta.
  const pageParam = Number(searchParams.get("page"));
  const currentPage =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const setPage = useCallback(
    (page: number) => {
      updateParams((params) => {
        if (page <= 1) params.delete("page");
        else params.set("page", String(page));
      });
    },
    [updateParams],
  );

  const versionBudgets = useMemo(() => {
    return visibleBudgets
      .filter((b) => !!b.parentId)
      .sort((a, b) => {
        if (a.parentId !== b.parentId)
          return (a.parentId || "").localeCompare(b.parentId || "");
        return (a.version || 1) - (b.version || 1);
      });
  }, [visibleBudgets]);

  const versionGroups = useMemo(() => {
    const groups = new Map<string, typeof versionBudgets>();
    for (const b of versionBudgets) {
      const key = b.budgetCode || b.parentId || "sem-codigo";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }
    // Dentro da pasta: da mais recente (criada/editada) para a mais antiga.
    for (const versions of groups.values()) {
      versions.sort((a, b) => editTime(b) - editTime(a));
    }
    return groups;
  }, [versionBudgets]);

  // Pastas ordenadas pela edição mais recente do grupo (topo = mexido por último).
  const versionGroupList = useMemo(
    () =>
      Array.from(versionGroups.entries()).sort(
        (a, b) => groupEditTime(b[1]) - groupEditTime(a[1]),
      ),
    [versionGroups],
  );

  const originalsPageCount = Math.max(
    1,
    Math.ceil(originalBudgets.length / PAGE_SIZE),
  );
  const safeOriginalsPage = Math.min(currentPage, originalsPageCount);
  const paginatedOriginals = originalBudgets.slice(
    (safeOriginalsPage - 1) * PAGE_SIZE,
    safeOriginalsPage * PAGE_SIZE,
  );

  const foldersPageCount = Math.max(
    1,
    Math.ceil(versionGroupList.length / PAGE_SIZE),
  );
  const safeFoldersPage = Math.min(currentPage, foldersPageCount);
  const paginatedFolders = versionGroupList.slice(
    (safeFoldersPage - 1) * PAGE_SIZE,
    safeFoldersPage * PAGE_SIZE,
  );

  const currentSelectableIds = useMemo<string[]>(() => {
    if (activeTab === "originals") return originalBudgets.map((b) => b.id);
    if (activeTab === "archived") return archivedBudgets.map((b) => b.id);
    if (activeTab === "versions") {
      if (selectedVersionCode) {
        return (versionGroups.get(selectedVersionCode) ?? []).map((b) => b.id);
      }
      return [];
    }
    return [];
  }, [
    activeTab,
    originalBudgets,
    archivedBudgets,
    versionGroups,
    selectedVersionCode,
  ]);

  const allCurrentSelected =
    currentSelectableIds.length > 0 &&
    currentSelectableIds.every((id) => selectedIds.has(id));

  const selectAllCurrent = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of currentSelectableIds) next.add(id);
      return next;
    });
  };
  const deselectAllCurrent = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of currentSelectableIds) next.delete(id);
      return next;
    });
  };

  const renderCardCheckbox = (budget: Budget) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleSelected(budget.id);
      }}
      title={selectedIds.has(budget.id) ? "Desmarcar" : "Selecionar"}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        marginRight: 8,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
      }}
    >
      {selectedIds.has(budget.id) ? (
        <CheckSquare size={20} color="var(--color-primary)" />
      ) : (
        <Square size={20} color="var(--color-text-secondary)" />
      )}
    </button>
  );

  const handleCreateNew = () => {
    if (!canCreateBudget) return;
    setIsBudgetCityModalOpen(true);
  };

  const handleSelectBudgetCity = (city: BudgetCity) => {
    setIsBudgetCityModalOpen(false);
    navigate("/budgets/create", { state: { budgetCity: city } });
  };

  const handlePrint = (e: React.MouseEvent, budget: Budget) => {
    e.stopPropagation();
    setPrintModal({ open: true, budget });
  };

  // Gera (ou reaproveita) o link público read-only do demonstrativo e abre o
  // modal para copiar/enviar ao cliente.
  const handleShare = async (e: React.MouseEvent, budget: Budget) => {
    e.stopPropagation();
    setShareCopied(false);
    setShareModal({ open: true, loading: true, link: "", budget });
    try {
      const res = await budgetsApi.share(budget.id);
      if (!res.ok || !res.data?.token) {
        throw new Error(res.message || "Não foi possível gerar o link");
      }
      const link = `${window.location.origin}/demonstrativo/${res.data.token}`;
      setShareModal({ open: true, loading: false, link, budget });
    } catch (err) {
      setShareModal({ open: false, loading: false, link: "", budget: null });
      toast.error(
        err instanceof Error ? err.message : "Erro ao gerar o link do cliente",
      );
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareModal.link) return;
    try {
      await navigator.clipboard.writeText(shareModal.link);
      setShareCopied(true);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Copie manualmente.");
    }
  };

  const handleDelete = (e: React.MouseEvent, budget: Budget) => {
    e.stopPropagation();
    setDeleteModal({ open: true, budget });
  };

  const handleCopyId = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      toast.success("ID copiado!");
    } catch {
      toast.error("Não foi possível copiar o ID");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.budget) return;
    try {
      await deleteBudgetMutation.mutateAsync(deleteModal.budget.id);
      setDeleteModal({ open: false, budget: null });
    } catch {
      // handled by mutation feedback
    }
  };

  // Passo 1 do modal: escolhida a visão, avança para a escolha do modelo.
  const selectPrintView = (view: BudgetPrintView) => {
    setPrintModal((prev) => ({ ...prev, view }));
  };

  const handlePrintView = async (
    view: BudgetPrintView,
    mode: BudgetPrintMode,
  ) => {
    if (!printModal.budget) return;

    const popup = openBudgetPrintShell();
    if (!popup) {
      toast.error("O navegador bloqueou a janela de impressão");
      return;
    }

    setIsPrinting(true);
    try {
      const res = await budgetsApi.getById(printModal.budget.id);
      if (!res.ok || !res.data) {
        throw new Error(
          res.message ||
            "Não foi possível carregar os dados completos do orçamento",
        );
      }

      const detailedBudget = mapBudget(res.data);
      renderBudgetPrintWindow(popup, detailedBudget, view, budgetEvents, mode);
      setPrintModal({ open: false, budget: null });
    } catch (err) {
      popup.close();
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao preparar a impressão do orçamento",
      );
    } finally {
      setIsPrinting(false);
    }
  };

  // URL atual da lista (aba/pasta/pagina) — o editor usa para voltar ao lugar certo.
  const listUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/budgets?${qs}` : "/budgets";
  }, [searchParams]);

  const openBudget = useCallback(
    (id: string) => navigate(`/budgets/${id}`, { state: { from: listUrl } }),
    [navigate, listUrl],
  );

  // ---- Anexo contratual (somente adm, somente orçamento aprovado) ----
  const { data: annexes = [] } = useAnnexesQuery(isAdmin);
  const { createMutation: createAnnexMutation } = useAnnexMutations();

  // Indexa por id do orçamento E por código da família: o anexo é único por
  // família e pode estar apontando para outra versão.
  const annexByBudget = useMemo(() => {
    const map = new Map<string, string>();
    for (const annex of annexes) {
      map.set(annex.budget_id, annex.id);
      if (annex.budget_code) map.set(`code:${annex.budget_code}`, annex.id);
    }
    return map;
  }, [annexes]);

  const findAnnexId = (budget: Budget) =>
    annexByBudget.get(budget.id) ??
    (budget.budgetCode ? annexByBudget.get(`code:${budget.budgetCode}`) : undefined);

  const canUseAnnex = (budget: Budget) => isAdmin && budget.status === "APPROVED";

  const handleAnnex = async (e: React.MouseEvent, budget: Budget) => {
    e.stopPropagation();
    const existing = findAnnexId(budget);
    if (existing) {
      navigate(`/annexes/${existing}`);
      return;
    }
    const res = await createAnnexMutation.mutateAsync({
      budget_id: budget.id,
      budget_code: budget.budgetCode ?? null,
      title: budget.instituicao,
      signature_date: null,
      signature_names: ["", "", ""],
    });
    const created = res?.data;
    if (created?.id) navigate(`/annexes/${created.id}`);
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    openBudget(id);
  };

  const handleOpenArchiveModal = (
    e: React.MouseEvent,
    budget: Budget,
    mode: "archive" | "unarchive",
  ) => {
    e.stopPropagation();
    setArchiveModal({ open: true, budget, mode });
  };

  const handleConfirmArchive = async () => {
    if (!archiveModal.budget) return;
    const archiving = archiveModal.mode === "archive";
    try {
      await archiveBudgetMutation.mutateAsync({
        id: archiveModal.budget.id,
        archived: archiving,
      });
      toast.success(
        archiving ? "Orçamento arquivado!" : "Orçamento desarquivado!",
      );
      setArchiveModal({ open: false, budget: null, mode: "archive" });
    } catch {
      // toast já vem do onError da mutation
    }
  };

  const handlePreviewBudget = async (e: React.MouseEvent, budget: Budget) => {
    e.stopPropagation();
    setIsLoadingPreview(true);
    try {
      const res = await budgetsApi.getById(budget.id);
      if (!res.ok || !res.data) {
        throw new Error(res.message || "Não foi possível carregar os dados completos do orçamento");
      }
      setPreviewBudget(mapBudget(res.data));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar visualização do orçamento",
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmitEditRequest = () => {
    if (!editRequestModal.budget) return;
    if (!editReason.trim()) {
      toast.error("Informe o motivo da solicitação de edição.");
      return;
    }

    const budget = editRequestModal.budget;
    const clientTitle = `${budget.instituicao || ""} - ${budget.curso || ""} - ${budget.comissao || "Cliente"}`;

    const existing = editRequests
      .filter((r) => r.budgetId === budget.id)
      .find((r) => r.status === "PENDING");
    if (existing) {
      toast.warning(
        "Já existe uma solicitação de edição pendente para este orçamento.",
      );
      setEditRequestModal({ open: false, budget: null });
      return;
    }

    createEditRequestMutation.mutate({
      budgetId: budget.id,
      clientName: clientTitle,
      requestedBy: user?.name || "UsuÃ¡rio",
      reason: editReason,
      status: "PENDING",
    });

    toast.success("Solicitação de edição enviada para aprovação!");
    setEditRequestModal({ open: false, budget: null });
  };

  const isBudgetLocked = (budget: Budget) => {
    if (isAdmin) return false;
    return budget.status !== "PENDING";
  };

  const getBudgetDisplayCode = (budget: Budget) =>
    budget.budgetCode || budget.parentId || budget.id;

  const allStatusOptions: Array<{ value: Budget["status"]; label: string }> = useMemo(
    () => [
      { value: "PENDING", label: "Pendente" },
      { value: "SENT_FOR_APPROVAL", label: "Enviado para Aprovação" },
      { value: "APPROVED", label: "Aprovado" },
      { value: "CANCELLED", label: "Cancelado" },
    ],
    [],
  );

  // ADM_ORCAMENTO só pode enviar para aprovação (PENDING → SENT_FOR_APPROVAL)
  const getStatusOptionsForBudget = (budget: Budget) => {
    if (isAdmin) return allStatusOptions;
    if (budget.status === "PENDING") {
      return allStatusOptions.filter((o) => o.value === "PENDING" || o.value === "SENT_FOR_APPROVAL");
    }
    // Demais status não podem ser alterados pelo usuário de orçamento
    return allStatusOptions.filter((o) => o.value === budget.status);
  };

  const getStatusLabel = (status: Budget["status"]) =>
    allStatusOptions.find((option) => option.value === status)?.label ?? "Pendente";

  const renderDiscountBadges = (budget: Budget) => {
    const approvedItemDiscountCount = Object.values(budget.approvedItemDiscounts ?? {}).filter(
      (value) => Number(value) > 0,
    ).length;
    const globalDiscountPercent = Number(budget.discountPercent) || 0;
    // Um desconto em reais pode existir com percentual zerado (orcamento sem
    // base na hora em que foi salvo), por isso olha os dois.
    const globalDiscountAmount = Number(budget.discountAmount) || 0;
    const temDescontoGeral = globalDiscountPercent > 0 || globalDiscountAmount > 0;

    if (approvedItemDiscountCount === 0 && !temDescontoGeral) return null;

    return (
      <div className={styles.cardBadges}>
        {approvedItemDiscountCount > 0 && (
          <span className={`${styles.badge} ${styles.discountBadge} ${styles.discountBadgeItem}`}>
            {approvedItemDiscountCount === 1
              ? "1 item com desconto"
              : `${approvedItemDiscountCount} itens com desconto`}
          </span>
        )}
        {temDescontoGeral && (
          <span className={`${styles.badge} ${styles.discountBadge} ${styles.discountBadgeGlobal}`}>
            Desconto geral {formatAppliedDiscount(budget)}
          </span>
        )}
      </div>
    );
  };

  const handleStatusSelectChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
    budget: Budget,
  ) => {
    e.stopPropagation();
    const nextStatus = e.target.value as Budget["status"];
    setPendingStatusByBudgetId((prev) => {
      if (nextStatus === budget.status) {
        if (!(budget.id in prev)) return prev;
        const next = { ...prev };
        delete next[budget.id];
        return next;
      }
      return { ...prev, [budget.id]: nextStatus };
    });
  };

  const openStatusConfirmModal = (
    budget: Budget,
    nextStatus: Budget["status"],
  ) => {
    setStatusConfirmModal({ open: true, budget, nextStatus });
  };

  const closeStatusConfirmModal = () => {
    setStatusConfirmModal({ open: false, budget: null, nextStatus: null });
  };

  const handleConfirmStatusChange = async () => {
    if (!statusConfirmModal.budget || !statusConfirmModal.nextStatus) return;
    const { budget, nextStatus } = statusConfirmModal;
    await updateBudgetStatusMutation.mutateAsync({
      id: budget.id,
      status: nextStatus,
    });
    setPendingStatusByBudgetId((prev) => {
      if (!(budget.id in prev)) return prev;
      const next = { ...prev };
      delete next[budget.id];
      return next;
    });
    toast.success(
      nextStatus === "APPROVED"
        ? "Status atualizado para Aprovado. Orçamento bloqueado automaticamente."
        : "Status do orçamento atualizado com sucesso!",
    );
    closeStatusConfirmModal();
  };

  const StatusBadge = ({ status }: { status: Budget["status"] }) => {
    const map: Record<Budget["status"], { label: string; class: string }> = {
      APPROVED: { label: "Aprovado", class: styles.approved },
      PENDING: { label: "Pendente", class: styles.pending },
      CANCELLED: { label: "Cancelado", class: styles.cancelled },
      SENT_FOR_APPROVAL: { label: "Enviado para Aprovação", class: styles.sentForApproval },
    };
    const current = map[status] ?? map.PENDING;
    return (
      <span className={`${styles.badge} ${current.class}`}>
        {current.label}
      </span>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{"Orçamentos"}</h1>
          <p className={styles.subtitle}>
            Gerencie todas as propostas comerciais
          </p>
        </div>
        {canCreateBudget && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button onClick={handleCreateNew} leftIcon={<Plus size={20} />}>
              {"Novo Orçamento"}
            </Button>
            {/* Proposta de locacao do Aurora Hall: outro produto, outro
                fluxo. So o ponto de entrada fica junto. */}
            <Button
              variant="outline"
              onClick={() => navigate("/venue-proposals/new")}
              leftIcon={<Plus size={20} />}
              title="Proposta de locação do Centro de Eventos Aurora Hall"
            >
              {"Aurora Hall"}
            </Button>
          </div>
        )}
      </header>

      {!isLoading && !isError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            padding: "12px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "10px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                position: "relative",
                flex: "1 1 240px",
                minWidth: "200px",
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "10px",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-secondary)",
                }}
              />
              <input
                type="text"
                placeholder="Buscar instituição, curso, comissão, código…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 32px 8px 30px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  background: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontSize: "13px",
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: "8px",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    display: "flex",
                  }}
                  title="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                }}
              >
                De
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                style={{
                  padding: "6px 8px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  background: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontSize: "13px",
                }}
              />
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                }}
              >
                até
              </label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                min={filterStartDate || undefined}
                style={{
                  padding: "6px 8px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  background: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontSize: "13px",
                }}
              />
            </div>

            <select
              value={filterCreatedBy}
              onChange={(e) => setFilterCreatedBy(e.target.value)}
              style={{
                padding: "7px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                background: "var(--color-background)",
                color: "var(--color-text-main)",
                fontSize: "13px",
                minWidth: "160px",
              }}
            >
              <option value="">Todos os criadores</option>
              {createdByOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  background: "var(--color-bg-tertiary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--color-text-main)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                marginRight: "4px",
              }}
            >
              Status:
            </span>
            {(
              [
                { value: "PENDING", label: "Pendente" },
                { value: "SENT_FOR_APPROVAL", label: "Enviado p/ aprovação" },
                { value: "APPROVED", label: "Aprovado" },
                { value: "CANCELLED", label: "Cancelado" },
              ] as Array<{ value: Budget["status"]; label: string }>
            ).map((opt) => {
              const active = statusFilters.has(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleStatusFilter(opt.value)}
                  style={{
                    padding: "4px 10px",
                    border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: "999px",
                    background: active
                      ? "var(--color-primary)"
                      : "var(--color-background)",
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
        </div>
      )}

      {selectedIds.size > 0 && (() => {
        const barBtnStyle: React.CSSProperties = {
          padding: "6px 12px",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
        };
        const dangerBtnStyle: React.CSSProperties = {
          ...barBtnStyle,
          background: "#dc2626",
          borderColor: "#dc2626",
        };
        return (
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
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <CheckSquare size={18} />
              <strong>{selectedIds.size}</strong>
              <span>orçamento(s) selecionado(s)</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {currentSelectableIds.length > 0 && (
                <button
                  type="button"
                  style={barBtnStyle}
                  onClick={
                    allCurrentSelected ? deselectAllCurrent : selectAllCurrent
                  }
                >
                  {allCurrentSelected
                    ? `Desmarcar todos (${currentSelectableIds.length})`
                    : `Marcar todos (${currentSelectableIds.length})`}
                </button>
              )}
              {canArchive && activeTab !== "archived" && (
                <button
                  type="button"
                  style={barBtnStyle}
                  onClick={() =>
                    setBulkModal({ open: true, action: "archive" })
                  }
                >
                  Arquivar
                </button>
              )}
              {canArchive && activeTab === "archived" && (
                <button
                  type="button"
                  style={barBtnStyle}
                  onClick={() =>
                    setBulkModal({ open: true, action: "unarchive" })
                  }
                >
                  Desarquivar
                </button>
              )}
              {canDeleteBudget && (
                <button
                  type="button"
                  style={dangerBtnStyle}
                  onClick={() => setBulkModal({ open: true, action: "delete" })}
                >
                  Excluir
                </button>
              )}
              <button type="button" style={barBtnStyle} onClick={clearSelection}>
                Limpar
              </button>
            </div>
          </div>
        );
      })()}

      {isLoading && <LoadingStatePanel message={"Carregando orçamentos..."} />}

      {isError && (
        <ErrorStatePanel
          title={"Erro ao carregar orçamentos"}
          message={error instanceof Error ? error.message : "Tente novamente."}
          actions={
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {!isLoading && !isError && (
        <div
          style={{
            display: "flex",
            gap: "20px",
            marginBottom: "20px",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "1px",
          }}
        >
          <button
            onClick={() => {
              setActiveTab("originals");
            }}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color:
                activeTab === "originals"
                  ? "var(--color-primary)"
                  : "var(--color-text-secondary)",
              border: "none",
              background: "none",
              borderBottom:
                activeTab === "originals"
                  ? "2px solid var(--color-primary)"
                  : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {"Orçamentos Originais"} ({originalBudgets.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("versions");
            }}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color:
                activeTab === "versions"
                  ? "var(--color-primary)"
                  : "var(--color-text-secondary)",
              border: "none",
              background: "none",
              borderBottom:
                activeTab === "versions"
                  ? "2px solid var(--color-primary)"
                  : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {"Versões de Orçamento"} ({versionBudgets.length})
          </button>
          {canArchive && (
            <button
              onClick={() => {
                setActiveTab("archived");
              }}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color:
                  activeTab === "archived"
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                border: "none",
                background: "none",
                borderBottom:
                  activeTab === "archived"
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Archive size={14} />
              {"Arquivados"} ({archivedBudgets.length})
            </button>
          )}
        </div>
      )}

      {!isLoading &&
        !isError &&
        activeTab === "versions" &&
        versionGroups.size === 0 && (
          <EmptyStatePanel
            message={"Nenhuma versão de orçamento encontrada."}
          />
        )}

      {!isLoading &&
        !isError &&
        activeTab === "originals" &&
        originalBudgets.length === 0 && (
          <EmptyStatePanel message={"Nenhum orçamento original encontrado."} />
        )}
      {!isLoading &&
        !isError &&
        activeTab === "versions" &&
        versionGroups.size > 0 &&
        !selectedVersionCode && (
          <div className={styles.gridContainer}>
            {paginatedFolders.map(([code, versions]) => {
              const ref = versions[0];
              return (
                <div
                  key={code}
                  className={styles.budgetCard}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedVersionCode(code)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "10px",
                      padding: "6px 10px",
                      background: "var(--color-bg-tertiary)",
                      borderRadius: "8px",
                      margin: "0 0 12px 0",
                    }}
                  >
                    <FolderOpen
                      size={16}
                      style={{ color: "var(--color-primary)", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "12px",
                        fontFamily: "monospace",
                        letterSpacing: "0.5px",
                        color: "var(--color-primary)",
                      }}
                    >
                      {code}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: "#dbeafe",
                        color: "#1e40af",
                        padding: "2px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      {versions.length} {"versão(ões)"}
                    </span>
                  </div>

                  <div
                    className={styles.cardHeader}
                    style={{ marginBottom: "8px" }}
                  >
                    <div className={styles.cardTitleBlock}>
                      <h3 className={styles.cardTitle}>
                        {ref.comissao || ref.instituicao}
                      </h3>
                      <span className={styles.cardSubtitle}>
                        {ref.instituicao} - {ref.curso}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cardBody}>
                    {ref.data?.eventStartDate && (
                      <div className={styles.infoRow}>
                        <Calendar size={14} />
                        <span>
                          {formatDateBR(ref.data.eventStartDate)}
                          {ref.data.eventEndDate
                            ? ` - ${formatDateBR(ref.data.eventEndDate)}`
                            : ""}
                        </span>
                      </div>
                    )}
                    <div className={styles.infoRow}>
                      <GraduationCap size={14} />
                      <span>{getBudgetStudentsCount(ref.data)} formandos</span>
                    </div>
                    <div className={styles.infoRow}>
                      <Users size={14} />
                      <span>{ref.comissao || "-"}</span>
                    </div>
                    {renderDiscountBadges(ref)}
                    {ref.createdByName && (
                      <div className={styles.createdBlock}>
                        <span>
                          Criado por: <strong>{ref.createdByName}</strong>
                        </span>
                      </div>
                    )}
                    <div className={styles.valueRow}>
                      <span className={styles.valueLabel}>
                        {"Versão mais recente"}
                      </span>
                      <span className={styles.totalValue}>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(getCardDisplayValues(versions[0]).total)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ gridColumn: "1 / -1" }}>
              <Pager
                page={safeFoldersPage}
                pageCount={foldersPageCount}
                onChange={setPage}
              />
            </div>
          </div>
        )}
      {!isLoading &&
        !isError &&
        activeTab === "versions" &&
        selectedVersionCode &&
        (() => {
          const familyVersions = versionGroups.get(selectedVersionCode) ?? [];
          const ref = familyVersions[0];
          const familyPageCount = Math.max(
            1,
            Math.ceil(familyVersions.length / PAGE_SIZE),
          );
          const safeFamilyPage = Math.min(currentPage, familyPageCount);
          const paginatedFamily = familyVersions.slice(
            (safeFamilyPage - 1) * PAGE_SIZE,
            safeFamilyPage * PAGE_SIZE,
          );
          return (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <button
                  onClick={() => setSelectedVersionCode(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-surface)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--color-text-main)",
                  }}
                >
                  {"Voltar"}
                </button>
                <div>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <FolderOpen
                      size={14}
                      style={{ color: "var(--color-primary)" }}
                    />
                    <span
                      style={{
                        fontWeight: 700,
                        fontFamily: "monospace",
                        color: "var(--color-primary)",
                      }}
                    >
                      {selectedVersionCode}
                    </span>
                    <span>-</span>
                    <span>
                      {ref?.comissao || ref?.instituicao} - {ref?.instituicao} -{" "}
                      {ref?.curso}
                    </span>
                  </span>
                </div>
              </div>

              <div className={styles.gridContainer}>
                {paginatedFamily.map((budget) => {
                  const locked = isBudgetLocked(budget);
                  const selectedStatus =
                    pendingStatusByBudgetId[budget.id] ?? budget.status;
                  const hasPendingStatusChange =
                    selectedStatus !== budget.status;
                  const isSavingStatus =
                    updateBudgetStatusMutation.isPending &&
                    updateBudgetStatusMutation.variables?.id === budget.id;

                  return (
                    <div
                      key={budget.id}
                      className={styles.budgetCard}
                      onClick={() =>
                        !isBudgetAnalyst &&
                        !locked &&
                        openBudget(budget.id)
                      }
                      style={{
                        position: "relative",
                        cursor: !isBudgetAnalyst && !locked ? "pointer" : "default",
                        opacity: locked ? 0.9 : 1,
                        outline: selectedIds.has(budget.id)
                          ? "2px solid var(--color-primary)"
                          : undefined,
                      }}
                    >
                      {locked && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            margin: "0 0 8px 0",
                            backgroundColor: budget.status === "SENT_FOR_APPROVAL" ? "#eff6ff" : "#fef3c7",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: budget.status === "SENT_FOR_APPROVAL" ? "#1e40af" : "#92400e",
                            fontWeight: 500,
                          }}
                        >
                          <Lock size={12} />
                          {budget.status === "SENT_FOR_APPROVAL"
                            ? "Aguardando aprovação do coordenador"
                            : budget.status === "APPROVED"
                            ? "Orçamento aprovado"
                            : "Orçamento cancelado"}
                        </div>
                      )}

                      <div className={styles.cardHeader}>
                        {renderCardCheckbox(budget)}
                        <div className={styles.cardTitleBlock}>
                          <h3 className={styles.cardTitle}>
                            {budget.instituicao}
                            <span
                              style={{
                                marginLeft: "8px",
                                fontSize: "11px",
                                backgroundColor: "#dbeafe",
                                color: "#1e40af",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                verticalAlign: "middle",
                              }}
                            >
                              V.{budget.version}
                            </span>
                            {wasEditedByAnnex(budget) && (
                              <span
                                title="Valores alterados pelo anexo contratual"
                                style={{
                                  marginLeft: "8px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  verticalAlign: "middle",
                                  whiteSpace: "nowrap",
                                  display: "inline-block",
                                }}
                              >
                                Editado via anexo
                              </span>
                            )}
                          </h3>
                          <span className={styles.cardSubtitle}>
                            {budget.curso}
                          </span>
                        </div>
                        <StatusBadge status={budget.status} />
                      </div>

                      <div className={styles.cardBody}>
                        {canChangeBudgetStatus && (
                          <div
                            className={styles.statusEditor}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <label
                              className={styles.statusEditorLabel}
                              htmlFor={`v-status-${budget.id}`}
                            >
                              {"Status do orçamento"}
                            </label>
                            <select
                              id={`v-status-${budget.id}`}
                              className={styles.statusEditorSelect}
                              value={selectedStatus}
                              onChange={(e) =>
                                handleStatusSelectChange(e, budget)
                              }
                              disabled={isSavingStatus}
                            >
                              {getStatusOptionsForBudget(budget).map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className={styles.infoRow}>
                          <Calendar size={14} />
                          <span>
                            {budget.data?.eventStartDate
                              ? formatDateBR(budget.data.eventStartDate)
                              : "Data não definida"}
                            {" - "}
                            {budget.data?.eventEndDate
                              ? formatDateBR(budget.data.eventEndDate)
                              : ""}
                          </span>
                        </div>

                        <div className={styles.infoRow}>
                          <GraduationCap size={14} />
                          <span>
                            {getBudgetStudentsCount(budget.data)} formandos
                          </span>
                        </div>

                        {budget.comissao && (
                          <div className={styles.infoRow}>
                            <Users size={14} />
                            <span>{budget.comissao}</span>
                          </div>
                        )}

                        {budget.telefone && (
                          <div className={styles.infoRow}>
                            <Phone size={14} />
                            <span>{budget.telefone}</span>
                          </div>
                        )}

                        {budget.controle && (
                          <div className={styles.infoRow}>
                            <Hash size={14} />
                            <span>{budget.controle}</span>
                          </div>
                        )}

                        <div className={styles.infoRow}>
                          <Hash size={14} />
                          <span>
                            <span className={styles.label}>ID:</span>{" "}
                            <span className={styles.monoValue}>
                              {getBudgetDisplayCode(budget)}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={styles.copyIdButton}
                            title="Copiar ID"
                            onClick={(e) =>
                              handleCopyId(e, getBudgetDisplayCode(budget))
                            }
                          >
                            <Copy size={13} />
                          </button>
                        </div>

                        {renderDiscountBadges(budget)}

                        <div className={styles.createdBlock}>
                          <span>
                            {budget.createdByName ? (
                              <>
                                Criado por:{" "}
                                <strong>{budget.createdByName}</strong> em{" "}
                              </>
                            ) : (
                              "Criado em "
                            )}
                            {new Date(budget.createdAt).toLocaleDateString(
                              "pt-BR",
                            )}
                          </span>
                        </div>

                        {(() => {
                          const cardValues = getCardDisplayValues(budget);
                          return (
                            <div className={styles.valueRow}>
                              <span className={styles.valueLabel}>Valor Total</span>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                }}
                              >
                                {cardValues.original &&
                                  cardValues.original > cardValues.total && (
                                    <span
                                      style={{
                                        fontSize: "0.75rem",
                                        textDecoration: "line-through",
                                        color: "#9ca3af",
                                        lineHeight: 1,
                                      }}
                                    >
                                      {new Intl.NumberFormat("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      }).format(cardValues.original)}
                                    </span>
                                  )}
                                <span className={styles.totalValue}>
                                  {new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  }).format(cardValues.total)}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {budget.observation && (
                          <div className={styles.observationBlock}>
                            <strong>Obs:</strong> {budget.observation}
                          </div>
                        )}
                      </div>

                      <div className={styles.cardFooter}>
                        <div className={styles.cardFooterLeft}>
                          {canChangeBudgetStatus && hasPendingStatusChange && (
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={isSavingStatus}
                              onClick={(e) => {
                                e.stopPropagation();
                                openStatusConfirmModal(budget, selectedStatus);
                              }}
                            >
                              Salvar
                            </Button>
                          )}
                        </div>
                        <div className={styles.cardFooterActions}>
                          {canEditBudget && (isAdmin || !locked) && (
                            <button
                              className={styles.iconButton}
                              title="Editar"
                              onClick={(e) => handleEdit(e, budget.id)}
                            >
                              <Pencil size={18} />
                            </button>
                          )}

                          {isBudgetAnalyst && (
                            <button
                              className={styles.iconButton}
                              title="Visualizar"
                              onClick={(e) => void handlePreviewBudget(e, budget)}
                            >
                              <Eye size={18} />
                            </button>
                          )}

                          <button
                            className={styles.iconButton}
                            title="Devolutivas"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReviewBudget(budget);
                            }}
                          >
                            <MessageSquareText size={18} />
                          </button>
                          <button
                            className={styles.iconButton}
                            title="Imprimir"
                            onClick={(e) => handlePrint(e, budget)}
                          >
                            <Printer size={18} />
                          </button>
                          {canUseAnnex(budget) && (
                            <button
                              className={styles.iconButton}
                              title={
                                annexByBudget.get(budget.id)
                                  ? "Ver anexo contratual"
                                  : "Gerar anexo contratual"
                              }
                              onClick={(e) => void handleAnnex(e, budget)}
                            >
                              <FileSpreadsheet size={18} />
                            </button>
                          )}
                          <button
                            className={styles.iconButton}
                            title="Enviar demonstrativo para o cliente"
                            onClick={(e) => handleShare(e, budget)}
                          >
                            <Send size={18} />
                          </button>

                          {canDeleteBudget && (
                            <button
                              className={`${styles.iconButton} ${styles.danger}`}
                              title="Excluir"
                              onClick={(e) => handleDelete(e, budget)}
                            >
                              <Trash2 size={18} />
                            </button>
                          )}

                          {canArchive && (
                            <button
                              className={styles.iconButton}
                              title="Arquivar"
                              onClick={(e) =>
                                handleOpenArchiveModal(e, budget, "archive")
                              }
                            >
                              <Archive size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pager
                page={safeFamilyPage}
                pageCount={familyPageCount}
                onChange={setPage}
              />
            </>
          );
        })()}

      {/* ---- Aba Originais: grid de cards individual ---- */}
      <div
        className={styles.gridContainer}
        style={{ display: activeTab === "originals" ? undefined : "none" }}
      >
        {paginatedOriginals.map((budget) => {
          const locked = isBudgetLocked(budget);
          const selectedStatus =
            pendingStatusByBudgetId[budget.id] ?? budget.status;
          const hasPendingStatusChange = selectedStatus !== budget.status;
          const isSavingStatus =
            updateBudgetStatusMutation.isPending &&
            updateBudgetStatusMutation.variables?.id === budget.id;

          return (
            <div
              key={budget.id}
              className={styles.budgetCard}
              onClick={() =>
                !isBudgetAnalyst &&
                !locked &&
                openBudget(budget.id)
              }
              style={{
                position: "relative",
                cursor: !isBudgetAnalyst && !locked ? "pointer" : "default",
                opacity: locked ? 0.9 : 1,
                outline: selectedIds.has(budget.id)
                  ? "2px solid var(--color-primary)"
                  : undefined,
              }}
            >
              {locked && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    margin: "0 0 8px 0",
                    backgroundColor: budget.status === "SENT_FOR_APPROVAL" ? "#eff6ff" : "#fef3c7",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: budget.status === "SENT_FOR_APPROVAL" ? "#1e40af" : "#92400e",
                    fontWeight: 500,
                  }}
                >
                  <Lock size={12} />
                  {budget.status === "SENT_FOR_APPROVAL"
                    ? "Aguardando aprovação do coordenador"
                    : budget.status === "APPROVED"
                    ? "Orçamento aprovado"
                    : "Orçamento cancelado"}
                </div>
              )}

              <div className={styles.cardHeader}>
                {renderCardCheckbox(budget)}
                <div className={styles.cardTitleBlock}>
                  <h3 className={styles.cardTitle}>
                    {budget.instituicao}
                    {budget.version && budget.version > 1 && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "11px",
                          backgroundColor: "#dbeafe",
                          color: "#1e40af",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          verticalAlign: "middle",
                        }}
                      >
                        V.{budget.version}
                      </span>
                    )}
                    {wasEditedByAnnex(budget) && (
                      <span
                        title="Valores alterados pelo anexo contratual"
                        style={{
                          marginLeft: "8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                          display: "inline-block",
                        }}
                      >
                        Editado via anexo
                      </span>
                    )}
                  </h3>
                  <span className={styles.cardSubtitle}>{budget.curso}</span>
                </div>
                <StatusBadge status={budget.status} />
              </div>

              <div className={styles.cardBody}>
                {canChangeBudgetStatus && (
                  <div
                    className={styles.statusEditor}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label
                      className={styles.statusEditorLabel}
                      htmlFor={`budget-status-${budget.id}`}
                    >
                      {"Status do orçamento"}
                    </label>
                    <select
                      id={`budget-status-${budget.id}`}
                      className={styles.statusEditorSelect}
                      value={selectedStatus}
                      onChange={(e) => handleStatusSelectChange(e, budget)}
                      disabled={isSavingStatus}
                    >
                      {getStatusOptionsForBudget(budget).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.infoRow}>
                  <Calendar size={14} />
                  <span>
                    {budget.data?.eventStartDate
                      ? formatDateBR(budget.data.eventStartDate)
                      : "Data não definida"}{" "}
                    -{" "}
                    {budget.data?.eventEndDate
                      ? formatDateBR(budget.data.eventEndDate)
                      : ""}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <GraduationCap size={14} />
                  <span>{getBudgetStudentsCount(budget.data)} formandos</span>
                </div>

                {budget.comissao && (
                  <div className={styles.infoRow}>
                    <Users size={14} />
                    <span>{budget.comissao}</span>
                  </div>
                )}

                {budget.telefone && (
                  <div className={styles.infoRow}>
                    <Phone size={14} />
                    <span>{budget.telefone}</span>
                  </div>
                )}

                {budget.controle && (
                  <div className={styles.infoRow}>
                    <Hash size={14} />
                    <span>{budget.controle}</span>
                  </div>
                )}

                <div className={styles.infoRow}>
                  <Hash size={14} />
                  <span>
                    <span className={styles.label}>ID:</span>{" "}
                    <span className={styles.monoValue}>
                      {getBudgetDisplayCode(budget)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.copyIdButton}
                    title="Copiar ID"
                    onClick={(e) => handleCopyId(e, getBudgetDisplayCode(budget))}
                  >
                    <Copy size={13} />
                  </button>
                </div>

                {renderDiscountBadges(budget)}

                <div className={styles.createdBlock}>
                  <span>
                    {budget.createdByName || budget.createdBy ? (
                      <>
                        Criado por:{" "}
                        <strong>
                          {budget.createdByName || budget.createdBy}
                        </strong>{" "}
                        em{" "}
                      </>
                    ) : (
                      "Criado em "
                    )}
                    {new Date(budget.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {(() => {
                  const cardValues = getCardDisplayValues(budget);
                  return (
                    <div className={styles.valueRow}>
                      <span className={styles.valueLabel}>Valor Total</span>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        {cardValues.original &&
                          cardValues.original > cardValues.total && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                textDecoration: "line-through",
                                color: "#9ca3af",
                                lineHeight: 1,
                              }}
                            >
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(cardValues.original)}
                            </span>
                          )}
                        <span className={styles.totalValue}>
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(cardValues.total)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {budget.observation && (
                  <div className={styles.observationBlock}>
                    <strong>Obs:</strong> {budget.observation}
                  </div>
                )}
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.cardFooterLeft}>
                  {canChangeBudgetStatus && hasPendingStatusChange && (
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={isSavingStatus}
                      onClick={(e) => {
                        e.stopPropagation();
                        openStatusConfirmModal(budget, selectedStatus);
                      }}
                    >
                      Salvar
                    </Button>
                  )}
                </div>
                <div className={styles.cardFooterActions}>
                  {canEditBudget && (isAdmin || !locked) && (
                    <button
                      className={styles.iconButton}
                      title="Editar"
                      onClick={(e) => handleEdit(e, budget.id)}
                    >
                      <Pencil size={18} />
                    </button>
                  )}

                  {isBudgetAnalyst && (
                    <button
                      className={styles.iconButton}
                      title="Visualizar"
                      onClick={(e) => void handlePreviewBudget(e, budget)}
                    >
                      <Eye size={18} />
                    </button>
                  )}

                  <button
                    className={styles.iconButton}
                    title="Devolutivas"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReviewBudget(budget);
                    }}
                  >
                    <MessageSquareText size={18} />
                  </button>
                  <button
                    className={styles.iconButton}
                    title="Imprimir"
                    onClick={(e) => handlePrint(e, budget)}
                  >
                    <Printer size={18} />
                  </button>
                  {canUseAnnex(budget) && (
                    <button
                      className={styles.iconButton}
                      title={
                        annexByBudget.get(budget.id)
                          ? "Ver anexo contratual"
                          : "Gerar anexo contratual"
                      }
                      onClick={(e) => void handleAnnex(e, budget)}
                    >
                      <FileSpreadsheet size={18} />
                    </button>
                  )}
                  <button
                    className={styles.iconButton}
                    title="Enviar demonstrativo para o cliente"
                    onClick={(e) => handleShare(e, budget)}
                  >
                    <Send size={18} />
                  </button>

                  {canDeleteBudget && (
                    <button
                      className={`${styles.iconButton} ${styles.danger}`}
                      title="Excluir"
                      onClick={(e) => handleDelete(e, budget)}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}

                  {canArchive && (
                    <button
                      className={styles.iconButton}
                      title="Arquivar"
                      onClick={(e) =>
                        handleOpenArchiveModal(e, budget, "archive")
                      }
                    >
                      <Archive size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {activeTab === "originals" && (
        <Pager
          page={safeOriginalsPage}
          pageCount={originalsPageCount}
          onChange={setPage}
        />
      )}

      {/* ---- Aba Arquivados ---- */}
      {canArchive && activeTab === "archived" && (
        <>
          {archivedBudgets.length === 0 ? (
            <EmptyStatePanel message={"Nenhum orçamento arquivado."} />
          ) : (
            <div className={styles.gridContainer}>
              {archivedBudgets.map((budget) => (
                <div
                  key={budget.id}
                  className={styles.budgetCard}
                  style={{
                    position: "relative",
                    cursor: "default",
                    opacity: 0.85,
                    outline: selectedIds.has(budget.id)
                      ? "2px solid var(--color-primary)"
                      : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      margin: "0 0 8px 0",
                      backgroundColor: "#f3f4f6",
                      borderRadius: "6px",
                      fontSize: "12px",
                      color: "#374151",
                      fontWeight: 500,
                    }}
                  >
                    <Archive size={12} />
                    {"Arquivado"}
                    {budget.archivedByName ? ` por ${budget.archivedByName}` : ""}
                    {budget.archivedAt
                      ? ` em ${new Date(budget.archivedAt).toLocaleDateString("pt-BR")}`
                      : ""}
                  </div>

                  <div className={styles.cardHeader}>
                    {renderCardCheckbox(budget)}
                    <div className={styles.cardTitleBlock}>
                      <h3 className={styles.cardTitle}>{budget.instituicao}</h3>
                      <span className={styles.cardSubtitle}>{budget.curso}</span>
                    </div>
                    <StatusBadge status={budget.status} />
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.infoRow}>
                      <Calendar size={14} />
                      <span>
                        {budget.data?.eventStartDate
                          ? formatDateBR(budget.data.eventStartDate)
                          : "Data não definida"}
                      </span>
                    </div>

                    <div className={styles.infoRow}>
                      <GraduationCap size={14} />
                      <span>{getBudgetStudentsCount(budget.data)} formandos</span>
                    </div>

                    {budget.comissao && (
                      <div className={styles.infoRow}>
                        <Users size={14} />
                        <span>{budget.comissao}</span>
                      </div>
                    )}

                    <div className={styles.infoRow}>
                      <Hash size={14} />
                      <span>
                        <span className={styles.label}>ID:</span>{" "}
                        <span className={styles.monoValue}>
                          {getBudgetDisplayCode(budget)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={styles.copyIdButton}
                        title="Copiar ID"
                        onClick={(e) =>
                          handleCopyId(e, getBudgetDisplayCode(budget))
                        }
                      >
                        <Copy size={13} />
                      </button>
                    </div>

                    {renderDiscountBadges(budget)}

                    <div className={styles.createdBlock}>
                      <span>
                        {budget.createdByName || budget.createdBy ? (
                          <>
                            Criado por:{" "}
                            <strong>
                              {budget.createdByName || budget.createdBy}
                            </strong>{" "}
                            em{" "}
                          </>
                        ) : (
                          "Criado em "
                        )}
                        {new Date(budget.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    <div className={styles.valueRow}>
                      <span className={styles.valueLabel}>Valor Total</span>
                      <span className={styles.totalValue}>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(getCardDisplayValues(budget).total)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.cardFooterLeft} />
                    <div className={styles.cardFooterActions}>
                      <button
                        className={styles.iconButton}
                        title="Devolutivas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewBudget(budget);
                        }}
                      >
                        <MessageSquareText size={18} />
                      </button>
                      <button
                        className={styles.iconButton}
                        title="Imprimir"
                        onClick={(e) => handlePrint(e, budget)}
                      >
                        <Printer size={18} />
                      </button>
                      <button
                        className={styles.iconButton}
                        title="Enviar demonstrativo para o cliente"
                        onClick={(e) => handleShare(e, budget)}
                      >
                        <Send size={18} />
                      </button>
                      <button
                        className={styles.iconButton}
                        title="Desarquivar"
                        onClick={(e) =>
                          handleOpenArchiveModal(e, budget, "unarchive")
                        }
                      >
                        <ArchiveRestore size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {statusConfirmModal.open &&
        statusConfirmModal.budget &&
        statusConfirmModal.nextStatus && (
          <ModalShell
            onBackdropClick={closeStatusConfirmModal}
            maxWidth="520px"
            zIndex={160}
            panelStyle={{ padding: "2rem" }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                  {"Confirmar alteração de status"}
                </h3>
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "var(--color-text-secondary)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>{statusConfirmModal.budget.instituicao}</strong>
                  {" - "}
                  {statusConfirmModal.budget.curso}
                </p>
              </div>

              <div
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  padding: "12px",
                  background: "var(--color-bg-tertiary)",
                  fontSize: "0.9rem",
                  color: "var(--color-text-main)",
                }}
              >
                Status atual:{" "}
                <strong>
                  {getStatusLabel(statusConfirmModal.budget.status)}
                </strong>
                <br />
                Novo status:{" "}
                <strong>{getStatusLabel(statusConfirmModal.nextStatus)}</strong>
              </div>

              {statusConfirmModal.nextStatus === "APPROVED" && (
                <div
                  style={{
                    border: "1px solid #fcd34d",
                    background: "#fffbeb",
                    color: "#92400e",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "0.875rem",
                    lineHeight: 1.45,
                  }}
                >
                  {"Ao aprovar, o orçamento será bloqueado automaticamente. O"}
                  {
                    "desbloqueio continuarÁ ocorrendo somente por solicitação de"
                  }
                  {"edição aprovada."}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <Button variant="outline" onClick={closeStatusConfirmModal}>
                  Cancelar
                </Button>
                <Button
                  isLoading={updateBudgetStatusMutation.isPending}
                  onClick={() => void handleConfirmStatusChange()}
                >
                  Confirmar e salvar
                </Button>
              </div>
            </div>
          </ModalShell>
        )}

      {bulkModal.open && bulkModal.action && (
        <ModalShell
          onBackdropClick={() =>
            !isBulkRunning && setBulkModal({ open: false, action: null })
          }
          maxWidth="520px"
          zIndex={185}
          panelStyle={{ overflow: "hidden" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {bulkModal.action === "delete"
                  ? "Excluir orçamentos selecionados"
                  : bulkModal.action === "archive"
                    ? "Arquivar orçamentos selecionados"
                    : "Desarquivar orçamentos selecionados"}
              </h3>
              <p className={styles.modalDescription}>
                {selectedIds.size} orçamento(s) serão{" "}
                {bulkModal.action === "delete"
                  ? "permanentemente excluídos"
                  : bulkModal.action === "archive"
                    ? "arquivados (saem das listagens e métricas)"
                    : "desarquivados (voltam às listagens e métricas)"}
                .
              </p>
            </div>

            {bulkModal.action === "delete" && (
              <div className={styles.modalSection}>
                <div className={styles.dangerNotice}>
                  Esta operação não pode ser desfeita.
                </div>
              </div>
            )}

            <div className={styles.modalActions}>
              <Button
                variant="outline"
                onClick={() => setBulkModal({ open: false, action: null })}
                disabled={isBulkRunning}
              >
                Cancelar
              </Button>
              <Button
                isLoading={isBulkRunning}
                onClick={() => void handleBulkConfirm()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {archiveModal.open && archiveModal.budget && (
        <ModalShell
          onBackdropClick={() =>
            !archiveBudgetMutation.isPending &&
            setArchiveModal({ open: false, budget: null, mode: "archive" })
          }
          maxWidth="520px"
          zIndex={178}
          panelStyle={{ overflow: "hidden" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {archiveModal.mode === "archive"
                  ? "Arquivar orçamento"
                  : "Desarquivar orçamento"}
              </h3>
              <p className={styles.modalDescription}>
                <strong>{archiveModal.budget.instituicao}</strong>
                {" - "}
                {archiveModal.budget.curso}
              </p>
            </div>

            <div className={styles.modalSection}>
              <div
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  padding: "12px",
                  background: "var(--color-bg-tertiary)",
                  fontSize: "0.9rem",
                  color: "var(--color-text-main)",
                  lineHeight: 1.5,
                }}
              >
                {archiveModal.mode === "archive"
                  ? "Ao arquivar, o orçamento sairá das listagens principais e suas métricas serão ocultadas do dashboard. É possível desarquivar a qualquer momento."
                  : "O orçamento voltará às listagens principais e as métricas dele voltarão a contar no dashboard."}
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button
                variant="outline"
                onClick={() =>
                  setArchiveModal({ open: false, budget: null, mode: "archive" })
                }
                disabled={archiveBudgetMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                isLoading={archiveBudgetMutation.isPending}
                onClick={() => void handleConfirmArchive()}
              >
                {archiveModal.mode === "archive"
                  ? "Arquivar orçamento"
                  : "Desarquivar orçamento"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {printModal.open && printModal.budget && (
        <ModalShell
          onBackdropClick={() =>
            !isPrinting && setPrintModal({ open: false, budget: null })
          }
          maxWidth="520px"
          zIndex={170}
          panelStyle={{ overflow: "hidden" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {printModal.view
                  ? "Escolha o modelo de impressão"
                  : "Escolha a visão para impressão"}
              </h3>
              <p className={styles.modalDescription}>
                <strong>{printModal.budget.instituicao}</strong>
                {" - "}
                {printModal.budget.curso}
              </p>
            </div>

            <div className={styles.modalSection}>
              {!printModal.view ? (
                <div className={styles.printChoiceGrid}>
                  <button
                    type="button"
                    onClick={() => selectPrintView("TEAM")}
                    disabled={isPrinting}
                    className={styles.printChoiceButton}
                  >
                    <div className={styles.printChoiceTitle}>
                      {"Visão da Equipe"}
                    </div>
                    <div className={styles.printChoiceText}>
                      Exibe dados do evento, itens com quantidades, valores
                      detalhados e resumo completo.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectPrintView("CLIENT")}
                    disabled={isPrinting}
                    className={styles.printChoiceButton}
                  >
                    <div className={styles.printChoiceTitle}>
                      {"Visão do Cliente"}
                    </div>
                    <div className={styles.printChoiceText}>
                      Exibe dados do evento, quantidades e apenas os valores
                      finais para apresentação ao cliente.
                    </div>
                  </button>
                </div>
              ) : (
                <div className={styles.printChoiceGrid}>
                  <button
                    type="button"
                    onClick={() =>
                      void handlePrintView(printModal.view!, "LEGACY")
                    }
                    disabled={isPrinting}
                    className={styles.printChoiceButton}
                  >
                    <div className={styles.printChoiceTitle}>
                      {"Modelo Legado"}
                    </div>
                    <div className={styles.printChoiceText}>
                      Layout atual, o mesmo utilizado hoje.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handlePrintView(printModal.view!, "NEW")}
                    disabled={isPrinting}
                    className={styles.printChoiceButton}
                  >
                    <div className={styles.printChoiceTitle}>
                      {"Modelo Novo"}
                    </div>
                    <div className={styles.printChoiceText}>
                      Novo design Orça Eventos, apresentação premium para o
                      cliente.
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              {printModal.view && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setPrintModal((prev) => ({ ...prev, view: undefined }))
                  }
                  disabled={isPrinting}
                >
                  Voltar
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setPrintModal({ open: false, budget: null })}
                disabled={isPrinting}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {shareModal.open && (
        <ModalShell
          onBackdropClick={() =>
            setShareModal({ open: false, loading: false, link: "", budget: null })
          }
          maxWidth="540px"
          zIndex={170}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Demonstrativo para o cliente</h3>
              {shareModal.budget && (
                <p className={styles.modalDescription}>
                  <strong>{shareModal.budget.instituicao}</strong>
                  {" - "}
                  {shareModal.budget.curso}
                </p>
              )}
            </div>

            <div className={styles.modalSection}>
              {shareModal.loading ? (
                <p className={styles.modalDescription}>Gerando link seguro…</p>
              ) : (
                <>
                  <p className={styles.modalDescription}>
                    Link seguro (somente leitura). O cliente navega pelo
                    orçamento de forma interativa, mas não consegue alterar nada.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <input
                      readOnly
                      value={shareModal.link}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        color: "var(--color-text)",
                        fontSize: 13,
                        minWidth: 0,
                      }}
                    />
                    <Button onClick={handleCopyShareLink}>
                      <Copy size={16} /> {shareCopied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className={styles.modalActions}>
              {!shareModal.loading && shareModal.link && (
                <Button
                  variant="outline"
                  onClick={() => window.open(shareModal.link, "_blank")}
                >
                  Abrir
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  setShareModal({
                    open: false,
                    loading: false,
                    link: "",
                    budget: null,
                  })
                }
              >
                Fechar
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {previewBudget && (
        <ModalShell
          onBackdropClick={() => !isLoadingPreview && setPreviewBudget(null)}
          maxWidth="1100px"
          zIndex={172}
          panelStyle={{ overflow: "hidden", maxHeight: "90vh" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Visualizar orçamento</h3>
              <p className={styles.modalDescription}>
                {[previewBudget.instituicao, previewBudget.curso, previewBudget.comissao]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>

            <div className={styles.modalSection} style={{ overflowY: "auto", maxHeight: "70vh" }}>
              <BudgetPreviewContent budget={previewBudget} budgetEvents={budgetEvents} />
            </div>

            <div className={styles.modalActions}>
              <Button variant="outline" onClick={() => setPreviewBudget(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {reviewBudget && (
        <BudgetReviewModal budget={reviewBudget} onClose={() => setReviewBudget(null)} />
      )}

      {deleteModal.open && deleteModal.budget && (
        <ModalShell
          onBackdropClick={() =>
            !deleteBudgetMutation.isPending &&
            setDeleteModal({ open: false, budget: null })
          }
          maxWidth="520px"
          zIndex={175}
          panelStyle={{ overflow: "hidden" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{"Excluir orçamento"}</h3>
              <p className={styles.modalDescription}>
                Esta ação remove permanentemente o orçamento selecionado.
              </p>
            </div>

            <div className={styles.modalSection}>
            <div className={styles.modalInfoBox}>
              <div className={styles.modalInfoRow}>
                <span className={styles.modalInfoLabel}>{"Instituição"}</span>
                <span className={styles.modalInfoValue}>
                  {deleteModal.budget.instituicao}
                </span>
              </div>
              <div className={styles.modalInfoRow}>
                <span className={styles.modalInfoLabel}>Curso</span>
                <span className={styles.modalInfoValue}>
                  {deleteModal.budget.curso}
                </span>
              </div>
              <div className={styles.modalInfoRow}>
                <span className={styles.modalInfoLabel}>
                  {"ID do orçamento"}
                </span>
                <span
                  className={`${styles.modalInfoValue} ${styles.monoValue}`}
                >
                  {getBudgetDisplayCode(deleteModal.budget)}
                </span>
              </div>
            </div>

            <div className={styles.dangerNotice}>
              Confirme a exclusão apenas se tiver certeza. Essa operação não
              pode ser desfeita.
            </div>
            </div>

            <div className={styles.modalActions}>
              <Button
                variant="outline"
                onClick={() => setDeleteModal({ open: false, budget: null })}
                disabled={deleteBudgetMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                isLoading={deleteBudgetMutation.isPending}
                onClick={() => void handleConfirmDelete()}
              >
                {"Excluir orçamento"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {false && editRequestModal.open && editRequestModal.budget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              padding: "28px",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                marginBottom: "8px",
                color: "var(--color-text-main)",
              }}
            >
              {"Solicitar Edição do Orçamento"}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                marginBottom: "16px",
              }}
            >
              <strong>{editRequestModal.budget?.instituicao}</strong> -{" "}
              {editRequestModal.budget?.curso}
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "6px",
                }}
              >
                {"Motivo da Solicitação (Obrigatório)"}
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Explique o que precisa ser alterado e por quê..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <Button
                variant="outline"
                onClick={() =>
                  setEditRequestModal({ open: false, budget: null })
                }
              >
                Cancelar
              </Button>
              <Button onClick={handleSubmitEditRequest}>
                {"Enviar Solicitação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editRequestModal.open && editRequestModal.budget && (
        <ModalShell
          onBackdropClick={() =>
            setEditRequestModal({ open: false, budget: null })
          }
          maxWidth="520px"
          zIndex={180}
          panelStyle={{ overflow: "hidden" }}
        >
          <div className={styles.modalStack}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {"Solicitar Edição do Orçamento"}
              </h3>
              <p className={styles.modalDescription}>
                <strong>{editRequestModal.budget!.instituicao}</strong> -{" "}
                {editRequestModal.budget!.curso}
              </p>
            </div>

            <div className={styles.modalSection}>
              <div className={styles.modalField}>
                <label className={styles.modalFieldLabel}>
                  {"Motivo da Solicitação (Obrigatório)"}
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explique o que precisa ser alterado e por quê..."
                  rows={4}
                  className={styles.modalTextarea}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button
                variant="outline"
                onClick={() =>
                  setEditRequestModal({ open: false, budget: null })
                }
              >
                Cancelar
              </Button>
              <Button onClick={handleSubmitEditRequest}>
                {"Enviar Solicitação"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      <BudgetCitySelectionModal
        isOpen={isBudgetCityModalOpen}
        onSelect={handleSelectBudgetCity}
        onCancel={() => setIsBudgetCityModalOpen(false)}
      />
    </div>
  );
}



