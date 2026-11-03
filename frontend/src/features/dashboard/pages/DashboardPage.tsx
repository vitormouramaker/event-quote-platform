import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  FileText,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../../../components/Button/Button";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import { BudgetCitySelectionModal } from "../../budgets/components/BudgetCitySelectionModal";
import { useDashboardSummaryQuery } from "../queries/useDashboardSummaryQuery";
import { useBudgetsQuery } from "../../budgets/queries/useBudgetsQuery";
import type {
  DashboardStatusFilterDto,
  DashboardSummaryFiltersDto,
  DashboardMonthlyBudgetsDto,
  DashboardRecentBudgetDto,
  DashboardStatusBreakdownDto,
} from "../../../services/api";
import type { Budget } from "../../../store/budgetStore";
import { useVenueProposalsQuery } from "../../venueProposals/queries/useVenueProposalQueries";
import { resolveVenueStatus } from "../../venueProposals/domain/venueStatus";
import { groupVenueVersions } from "../../venueProposals/domain/venueVersions";
import type { BudgetCity } from "../../budgets/data/budgetCatalog";
import styles from "../styles/DashboardPage.module.css";

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const integer = new Intl.NumberFormat("pt-BR");
const shortDate = new Intl.DateTimeFormat("pt-BR");

type BudgetStatusKey = "PENDING" | "SENT_FOR_APPROVAL" | "APPROVED" | "CANCELLED";

const STATUS_META: Record<BudgetStatusKey, { label: string; color: string }> = {
  PENDING: { label: "Pendentes", color: "#f59e0b" },
  SENT_FOR_APPROVAL: { label: "Enviados p/ Aprovação", color: "#3b82f6" },
  APPROVED: { label: "Aprovados", color: "#22c55e" },
  CANCELLED: { label: "Cancelados", color: "#ef4444" },
};

function normalizeStatusBreakdown(rows: DashboardStatusBreakdownDto[]) {
  const map = new Map(rows.map((row) => [row.status, toNumber(row.count)]));
  return (Object.keys(STATUS_META) as BudgetStatusKey[]).map((status) => ({
    status,
    label: STATUS_META[status].label,
    color: STATUS_META[status].color,
    count: map.get(status) ?? 0,
  }));
}

function formatRecentBudgetTitle(item: DashboardRecentBudgetDto) {
  const parts = [item.instituicao, item.curso].filter(Boolean);
  return parts.join(" - ") || "Orçamento";
}

function statusBadgeClass(status: BudgetStatusKey) {
  if (status === "APPROVED")
    return `${styles.statusBadge} ${styles.badgeApproved}`;
  if (status === "CANCELLED")
    return `${styles.statusBadge} ${styles.badgeCancelled}`;
  if (status === "SENT_FOR_APPROVAL")
    return `${styles.statusBadge} ${styles.badgeSentForApproval}`;
  return `${styles.statusBadge} ${styles.badgePending}`;
}

function getPeriodLabel(
  preset: NonNullable<DashboardSummaryFiltersDto["preset"]>,
  startDate?: string,
  endDate?: string,
) {
  if (preset === "today") return "Hoje";
  if (preset === "3m") return "Últimos 3 meses";
  if (preset === "6m") return "Últimos 6 meses";
  if (preset === "custom") {
    if (startDate && endDate) {
      return `${shortDate.format(new Date(`${startDate}T00:00:00`))} a ${shortDate.format(new Date(`${endDate}T00:00:00`))}`;
    }
    return "Intervalo personalizado";
  }
  return "PerÃ­odo selecionado";
}

function getStatusFilterLabel(status: StatusFilterValue) {
  if (status === "PENDING") return "Pendente";
  if (status === "APPROVED") return "Aprovado";
  if (status === "CANCELLED") return "Cancelado";
  if (status === "ARCHIVED") return "Arquivados";
  return "Todos";
}

function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function getDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function matchesDashboardBudgetFilters(
  budget: Budget,
  filters: DashboardSummaryFiltersDto,
) {
  const archivedMode = filters.archived ?? "exclude";
  if (archivedMode === "exclude" && budget.archivedAt) return false;
  if (archivedMode === "only" && !budget.archivedAt) return false;

  const status = filters.status ?? "ALL";
  if (status !== "ALL" && budget.status !== status) return false;

  if (filters.seller && (budget.createdByName || budget.createdBy) !== filters.seller)
    return false;

  const createdAt = safeParseDate(budget.createdAt);
  if (!createdAt) return false;

  const preset = filters.preset ?? "6m";
  if (preset === "today") {
    return getDateKeyLocal(createdAt) === getDateKeyLocal(new Date());
  }

  if (preset === "3m") {
    const threshold = addMonths(startOfLocalDay(new Date()), -3);
    return createdAt >= threshold;
  }

  if (preset === "6m") {
    const threshold = addMonths(startOfLocalDay(new Date()), -6);
    return createdAt >= threshold;
  }

  if (preset === "custom" && filters.startDate && filters.endDate) {
    const start = new Date(`${filters.startDate}T00:00:00`);
    const endExclusive = addDays(new Date(`${filters.endDate}T00:00:00`), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime()))
      return false;
    return createdAt >= start && createdAt < endExclusive;
  }

  return true;
}

// Gráficos/lista derivados no cliente a partir dos orçamentos filtrados — assim
// TUDO adapta ao filtro de consultor sem depender do backend atualizado.
function buildStatusCounts(
  budgets: Budget[],
): DashboardStatusBreakdownDto[] {
  const map = new Map<Budget["status"], number>();
  for (const b of budgets) map.set(b.status, (map.get(b.status) ?? 0) + 1);
  return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
}

function buildRecentBudgets(budgets: Budget[]): DashboardRecentBudgetDto[] {
  return [...budgets]
    .sort(
      (a, b) =>
        (safeParseDate(b.createdAt)?.getTime() ?? 0) -
        (safeParseDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, 50)
    .map((b) => ({
      id: b.id,
      instituicao: b.instituicao,
      curso: b.curso,
      comissao: b.comissao ?? null,
      status: b.status,
      is_locked: b.isLocked ?? null,
      total_value: b.totalValue ?? null,
      created_at: b.createdAt,
      created_by_name: b.createdByName ?? b.createdBy ?? null,
    }));
}

function isShortCustomRange(filters: DashboardSummaryFiltersDto): boolean {
  if (filters.preset !== "custom" || !filters.startDate || !filters.endDate)
    return false;
  const start = new Date(`${filters.startDate}T00:00:00`);
  const end = new Date(`${filters.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diffDays > 0 && diffDays <= 31;
}

function buildMonthlyRows(
  budgets: Budget[],
  filters: DashboardSummaryFiltersDto,
): DashboardMonthlyBudgetsDto[] {
  const bucketByDay = filters.preset === "today" || isShortCustomRange(filters);
  const map = new Map<
    string,
    { key: string; label: string; count: number; total: number }
  >();
  for (const b of budgets) {
    const dt = safeParseDate(b.createdAt);
    if (!dt) continue;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const key = bucketByDay ? `${y}-${m}-${d}` : `${y}-${m}`;
    const label = bucketByDay ? `${d}/${m}/${y}` : `${m}/${y}`;
    const cur = map.get(key) ?? { key, label, count: 0, total: 0 };
    cur.count += 1;
    cur.total += toNumber(b.totalValue ?? b.originalTotalValue ?? 0);
    map.set(key, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({
      month_key: r.key,
      month_label: r.label,
      budget_count: r.count,
      total_value: r.total,
    }));
}

const DATE_PRESET_OPTIONS: Array<{
  value: NonNullable<DashboardSummaryFiltersDto["preset"]>;
  label: string;
}> = [
  { value: "today", label: "Hoje" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "custom", label: "Data específica" },
];

type StatusFilterValue = DashboardStatusFilterDto | "ARCHIVED";

const STATUS_FILTER_OPTIONS: Array<{
  value: StatusFilterValue;
  label: string;
}> = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "ARCHIVED", label: "Arquivados" },
];

function ChartPanel({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          <p className={styles.panelSubtitle}>{subtitle}</p>
        </div>
        {icon ? <div className={styles.panelIcon}>{icon}</div> : null}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function MeasuredChartContainer({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const updateReady = () => {
      const rect = node.getBoundingClientRect();
      setIsReady(rect.width > 0 && rect.height > 0);
    };

    // Defer initial check so the browser finishes layout before Recharts measures
    const raf = window.requestAnimationFrame(updateReady);

    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(raf);
    }

    const observer = new ResizeObserver(() => updateReady());
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={hostRef} className={className}>
      {isReady ? children : null}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [isBudgetCityModalOpen, setIsBudgetCityModalOpen] = useState(false);
  const [datePreset, setDatePreset] =
    useState<NonNullable<DashboardSummaryFiltersDto["preset"]>>("6m");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilterValue>("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");

  const isCustomReady =
    datePreset !== "custom" ||
    (Boolean(customStartDate) && Boolean(customEndDate));
  const dashboardFilters: DashboardSummaryFiltersDto = {
    preset: datePreset,
    status: statusFilter === "ARCHIVED" ? "ALL" : statusFilter,
    archived: statusFilter === "ARCHIVED" ? "only" : "exclude",
    ...(sellerFilter ? { seller: sellerFilter } : {}),
    ...(datePreset === "custom" && isCustomReady
      ? { startDate: customStartDate, endDate: customEndDate }
      : {}),
  };

  const { data: allBudgets = [] } = useBudgetsQuery();

  // Opções de consultor: nomes distintos de created_by dos orçamentos visíveis.
  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const budget of allBudgets) {
      const name = budget.createdByName || budget.createdBy;
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allBudgets]);
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDashboardSummaryQuery(dashboardFilters, { enabled: isCustomReady });
  const { data: venueProposals = [] } = useVenueProposalsQuery();

  const metrics = data?.metrics;

  // Orçamentos visíveis filtrados no cliente (período/status/consultor). Base de
  // TODAS as métricas de orçamento, gráficos e lista → adaptam ao consultor mesmo
  // sem backend atualizado. Só descontos/edições pendentes vêm do servidor.
  const filteredBudgets = allBudgets.filter((budget) =>
    matchesDashboardBudgetFilters(budget, dashboardFilters),
  );

  // Locação é venda como qualquer outra: entra nos números gerais da
  // plataforma. Passa pelo mesmo filtro de período, status e consultor, com a
  // proposta adaptada ao formato que o filtro lê.
  // Só a versão vigente de cada proposta conta: com v1 aprovada e v2 também
  // aprovada, a mesma venda entraria duas vezes no total.
  const venueVigentes = groupVenueVersions(venueProposals).map((f) => f.latest);
  const filteredVenueProposals = venueVigentes.filter((row) =>
    matchesDashboardBudgetFilters(
      {
        status: resolveVenueStatus(row.status),
        createdByName: row.created_by_name ?? undefined,
        createdAt: row.created_at,
      } as Budget,
      dashboardFilters,
    ),
  );
  const approvedVenueProposals = filteredVenueProposals.filter(
    (row) => resolveVenueStatus(row.status) === "APPROVED",
  );
  const approvedVenueValue = approvedVenueProposals.reduce(
    (sum, row) => sum + toNumber(row.total_value ?? 0),
    0,
  );

  const statusBreakdown = normalizeStatusBreakdown(
    buildStatusCounts(filteredBudgets),
  );
  const recentBudgets = buildRecentBudgets(filteredBudgets);
  const monthlyRows = buildMonthlyRows(filteredBudgets, dashboardFilters);
  const [recentPage, setRecentPage] = useState(1);
  const recentPageSize = 5;
  const recentPageCount = Math.max(
    1,
    Math.ceil(recentBudgets.length / recentPageSize),
  );
  const safeRecentPage = Math.min(recentPage, recentPageCount);

  const handleSelectBudgetCity = (city: BudgetCity) => {
    setIsBudgetCityModalOpen(false);
    navigate("/budgets/create", { state: { budgetCity: city } });
  };
  const paginatedRecentBudgets = recentBudgets.slice(
    (safeRecentPage - 1) * recentPageSize,
    safeRecentPage * recentPageSize,
  );

  const totalBudgets = filteredBudgets.length;
  const pendingBudgets = filteredBudgets.filter(
    (b) => b.status === "PENDING",
  ).length;
  const approvedBudgets = filteredBudgets.filter(
    (b) => b.status === "APPROVED",
  ).length;
  const lockedBudgets = filteredBudgets.filter((b) => b.isLocked).length;
  const approvedBudgetValue = filteredBudgets
    .filter((b) => b.status === "APPROVED")
    .reduce(
      (sum, b) => sum + toNumber(b.totalValue ?? b.originalTotalValue ?? 0),
      0,
    );
  const pendingBudgetValue = allBudgets
    .filter((budget) => budget.status === "PENDING")
    .filter((budget) => matchesDashboardBudgetFilters(budget, dashboardFilters))
    .reduce(
      (sum, budget) =>
        sum + toNumber(budget.totalValue ?? budget.originalTotalValue ?? 0),
      0,
    );
  const pendingDiscounts = toNumber(metrics?.pending_discount_requests);
  const pendingItemDiscounts = toNumber(
    metrics?.pending_item_discount_requests,
  );
  const pendingEdits = toNumber(metrics?.pending_edit_requests);
  const pendingBudgetApprovals = allBudgets
    .filter((budget) => budget.status === "SENT_FOR_APPROVAL")
    .filter((budget) => matchesDashboardBudgetFilters(budget, dashboardFilters))
    .length;

  useEffect(() => {
    setRecentPage(1);
  }, [
    recentBudgets.length,
    datePreset,
    statusFilter,
    customStartDate,
    customEndDate,
  ]);

  const pendingRequestsData = [
    {
      name: "Descontos",
      value: pendingDiscounts + pendingItemDiscounts,
      color: "#f59e0b",
    },
    {
      name: "Orçamentos",
      value: pendingBudgetApprovals,
      color: "#3b82f6",
    },
    { name: "Edições", value: pendingEdits, color: "#8b5cf6" },
  ];

  const monthlyChartData = monthlyRows.map((row) => ({
    month: row.month_label,
    count: toNumber(row.budget_count),
    total: toNumber(row.total_value),
  }));

  const kpis = [
    {
      title: "Total de Orçamentos",
      value: integer.format(totalBudgets),
      hint: `Pendentes: ${integer.format(pendingBudgets)}`,
      tooltip:
        "Quantidade total de orçamentos dentro do período e status selecionados.",
    },
    {
      title: "Valor total em orçamentos pendentes",
      value: currency.format(pendingBudgetValue),
      hint: `Pendentes: ${integer.format(pendingBudgets)}`,
      tooltip:
        "Soma dos valores finais dos orçamentos pendentes dentro dos filtros aplicados.",
    },
    {
      title: "Valor total aprovado",
      value: currency.format(approvedBudgetValue + approvedVenueValue),
      hint: `Orçamentos: ${integer.format(approvedBudgets)} · ${currency.format(
        approvedBudgetValue,
      )} | Locações: ${integer.format(
        approvedVenueProposals.length,
      )} · ${currency.format(approvedVenueValue)}`,
      tooltip:
        "Soma dos valores finais aprovados dentro dos filtros aplicados, somando os orçamentos de formatura e as propostas de locação do Aurora Hall.",
    },
    {
      title: "Aprovações Pendentes",
      value: integer.format(
        pendingDiscounts + pendingItemDiscounts + pendingEdits,
      ),
      hint: `Desc.: ${pendingDiscounts + pendingItemDiscounts} | Edição: ${pendingEdits}`,
      tooltip:
        "Total de solicitações pendentes de descontos e edições aguardando análise.",
    },
    {
      title: "Orçamentos Bloqueados",
      value: integer.format(lockedBudgets),
      hint: `Aprovados: ${integer.format(approvedBudgets)}`,
      tooltip:
        "Quantidade de orçamentos bloqueados para edição dentro do recorte atual.",
    },
  ];
  const selectedPeriodLabel = getPeriodLabel(
    datePreset,
    customStartDate,
    customEndDate,
  );
  const selectedStatusLabel = getStatusFilterLabel(statusFilter);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Visão consolidada de orçamentos, pendências e produção recente.
          </p>
          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel} htmlFor="dashboard-period">
                Período
              </label>
              <select
                id="dashboard-period"
                className={styles.filterControl}
                value={datePreset}
                onChange={(e) =>
                  setDatePreset(
                    e.target
                      .value as NonNullable<DashboardSummaryFiltersDto["preset"]>,
                  )
                }
              >
                {DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label
                className={styles.filterLabel}
                htmlFor="dashboard-start-date"
              >
                Data inicial
              </label>
              <input
                id="dashboard-start-date"
                type="date"
                className={styles.filterControl}
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setDatePreset("custom");
                }}
              />
            </div>

            <div className={styles.filterGroup}>
              <label
                className={styles.filterLabel}
                htmlFor="dashboard-end-date"
              >
                Data final
              </label>
              <input
                id="dashboard-end-date"
                type="date"
                className={styles.filterControl}
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setDatePreset("custom");
                }}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel} htmlFor="dashboard-status">
                Status
              </label>
              <select
                id="dashboard-status"
                className={styles.filterControl}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilterValue)
                }
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {sellerOptions.length > 0 && (
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="dashboard-seller">
                  Consultor
                </label>
                <select
                  id="dashboard-seller"
                  className={styles.filterControl}
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                >
                  <option value="">Todos os consultores</option>
                  {sellerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {datePreset === "custom" && !isCustomReady && (
              <div
                className={styles.filterNotice}
                style={{ alignSelf: "flex-end" }}
              >
                Selecione data inicial e final para aplicar o filtro.
              </div>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            leftIcon={<RefreshCw size={16} />}
          >
            {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/budgets")}
            leftIcon={<FileText size={16} />}
          >
            Ver Orçamentos
          </Button>
            <Button
              onClick={() => setIsBudgetCityModalOpen(true)}
              leftIcon={<Plus size={16} />}
            >
              Novo Orçamento
            </Button>
        </div>
      </header>

      {isLoading && <LoadingStatePanel message="Carregando dashboard..." />}

      {isError && (
        <ErrorStatePanel
          title="Erro ao carregar dashboard"
          message={error instanceof Error ? error.message : "Tente novamente."}
          actions={
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          }
        />
        )}

        <BudgetCitySelectionModal
          isOpen={isBudgetCityModalOpen}
          onSelect={handleSelectBudgetCity}
          onCancel={() => setIsBudgetCityModalOpen(false)}
        />

      {!isLoading && !isError && data && (
        <>
          <section className={styles.kpiGrid}>
            {kpis.map((kpi) => (
              <article key={kpi.title} className={styles.kpiCard}>
                <div className={styles.kpiLabelRow}>
                  <span className={styles.kpiLabel}>{kpi.title}</span>
                  <span className={styles.helpTooltip}>
                    <button
                      type="button"
                      className={styles.helpTrigger}
                      aria-label={`Ajuda sobre ${kpi.title}`}
                    >
                      <CircleHelp size={14} />
                    </button>
                    <span className={styles.tooltipBubble}>{kpi.tooltip}</span>
                  </span>
                </div>
                <strong className={styles.kpiValue}>{kpi.value}</strong>
                <span className={styles.kpiHint}>{kpi.hint}</span>
              </article>
            ))}
          </section>

          <section className={styles.dashboardGrid}>
            <div className={`${styles.spanTwo} ${styles.evolutionCardsGrid}`}>
              <ChartPanel
                title={`Quantidade de orçamentos de ${selectedPeriodLabel}`}
                subtitle={`Volume mensal (${selectedStatusLabel.toLowerCase()})`}
                icon={<BarChart3 size={16} />}
                className={styles.evolutionPanel}
              >
                {monthlyChartData.length === 0 ? (
                  <EmptyStatePanel message={"Sem dados no período."} />
                ) : (
                  <div className={styles.evolutionChartBlock}>
                    <div className={styles.evolutionChartLabelRow}>
                      <span className={styles.evolutionChartLabel}>
                        Quantidade de orçamentos
                      </span>
                      <strong className={styles.evolutionChartValue}>Volume</strong>
                    </div>
                    <MeasuredChartContainer className={styles.chartAreaEvolution}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyChartData}
                          margin={{ top: 12, right: 20, left: 12, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(148, 163, 184, 0.15)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                            width={72}
                            tickFormatter={(value) => integer.format(toNumber(value))}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow:
                                "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                              fontSize: "13px",
                            }}
                            formatter={(value: number | string | undefined) => [
                              integer.format(toNumber(value)),
                              "Quantidade",
                            ]}
                            labelFormatter={(label) => `Mês: ${String(label)}`}
                            cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                          />
                          <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                            <LabelList
                              dataKey="count"
                              position="top"
                              formatter={(value) =>
                                integer.format(
                                  toNumber(value as number | string | null | undefined),
                                )
                              }
                              fill="#0f172a"
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </MeasuredChartContainer>
                  </div>
                )}
              </ChartPanel>

              <ChartPanel
                title={`Valor total de orçamentos de ${selectedPeriodLabel}`}
                subtitle={`Receita mensal (${selectedStatusLabel.toLowerCase()})`}
                icon={<FileText size={16} />}
                className={styles.evolutionPanel}
              >
                {monthlyChartData.length === 0 ? (
                  <EmptyStatePanel message={"Sem dados no período."} />
                ) : (
                  <div className={styles.evolutionChartBlock}>
                    <div className={styles.evolutionChartLabelRow}>
                      <span className={styles.evolutionChartLabel}>
                        Valor total dos orçamentos
                      </span>
                      <strong className={styles.evolutionChartValue}>BRL</strong>
                    </div>
                    <MeasuredChartContainer className={styles.chartAreaEvolution}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyChartData}
                          margin={{ top: 12, right: 20, left: 12, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(148, 163, 184, 0.15)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            width={92}
                            tickFormatter={(value) => currency.format(toNumber(value))}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow:
                                "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                              fontSize: "13px",
                            }}
                            formatter={(value: number | string | undefined) => [
                              currency.format(toNumber(value)),
                              "Valor Total",
                            ]}
                            labelFormatter={(label) => `Mês: ${String(label)}`}
                            cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                          />
                          <Bar dataKey="total" fill="#0f172a" radius={[8, 8, 0, 0]}>
                            <LabelList
                              dataKey="total"
                              position="top"
                              formatter={(value) =>
                                currency.format(
                                  toNumber(value as number | string | null | undefined),
                                )
                              }
                              fill="#0f172a"
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </MeasuredChartContainer>
                  </div>
                )}
              </ChartPanel>
            </div>

            <ChartPanel
              title={`Orçamentos por status de ${selectedPeriodLabel}`}
              subtitle={"Distribuição da base conforme filtros aplicados"}
              icon={<PieChartIcon size={16} />}
              className={styles.equalHalfPanel}
            >
              <div className={styles.statusChartWrap}>
                <MeasuredChartContainer className={styles.donutChart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        formatter={(value: number | string | undefined) =>
                          integer.format(toNumber(value))
                        }
                      />
                      <Pie
                        data={statusBreakdown}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={55}
                        outerRadius={82}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {statusBreakdown.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </MeasuredChartContainer>

                <div className={styles.legendList}>
                  {statusBreakdown.map((entry) => (
                    <div key={entry.status} className={styles.legendItem}>
                      <span
                        className={styles.legendDot}
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className={styles.legendLabel}>{entry.label}</span>
                      <strong className={styles.legendValue}>
                        {integer.format(entry.count)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </ChartPanel>

            <ChartPanel
              title={`Pendências por tipo de ${selectedPeriodLabel}`}
              subtitle={"Fila de aprovação dentro do recorte filtrado"}
              icon={<CheckCircle2 size={16} />}
              className={styles.equalHalfPanel}
            >
              <MeasuredChartContainer className={styles.chartAreaCompact}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pendingRequestsData}
                    layout="vertical"
                    margin={{ left: 10, right: 12, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="rgba(148, 163, 184, 0.15)"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#0f172a" }}
                      width={72}
                    />
                    <Tooltip
                      formatter={(value: number | string | undefined) =>
                        integer.format(toNumber(value))
                      }
                    />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {pendingRequestsData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </MeasuredChartContainer>
            </ChartPanel>

            <ChartPanel
              title={`Produção recente de ${selectedPeriodLabel}`}
              subtitle={"Últimos orçamentos gravados no recorte filtrado"}
              icon={<FileText size={16} />}
              className={styles.spanTwo}
            >
              {recentBudgets.length === 0 ? (
                <EmptyStatePanel
                  message={"Nenhum orçamento disponível ainda."}
                />
              ) : (
                <>
                  <div className={styles.recentList}>
                    {paginatedRecentBudgets.map((item) => {
                      const status = item.status as BudgetStatusKey;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.recentItem}
                          onClick={() => navigate(`/budgets/${item.id}`)}
                        >
                          <div className={styles.recentLeft}>
                            <p className={styles.recentTitle}>
                              {formatRecentBudgetTitle(item)}
                            </p>
                            <p className={styles.recentMeta}>
                              <span>
                                {new Date(item.created_at).toLocaleDateString(
                                  "pt-BR",
                                )}
                              </span>
                              {item.comissao ? (
                                <span>{item.comissao}</span>
                              ) : null}
                              {item.created_by_name ? (
                                <span>{item.created_by_name}</span>
                              ) : null}
                              <span>
                                {item.is_locked ? "Bloqueado" : "Editável"}
                              </span>
                            </p>
                          </div>

                          <div className={styles.recentRight}>
                            <span className={statusBadgeClass(status)}>
                              {(STATUS_META[status] ?? STATUS_META.PENDING).label}
                            </span>
                            <span className={styles.recentValue}>
                              {currency.format(toNumber(item.total_value))}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {recentPageCount > 1 && (
                    <div className={styles.recentPagination}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          setRecentPage((page) => Math.max(1, page - 1))
                        }
                        disabled={safeRecentPage === 1}
                      >
                        Anterior
                      </button>

                      <div className={styles.paginationDots}>
                        {Array.from({ length: recentPageCount }, (_, index) => {
                          const page = index + 1;
                          return (
                            <button
                              key={page}
                              type="button"
                              className={`${styles.paginationButton} ${page === safeRecentPage ? styles.paginationButtonActive : ""}`}
                              onClick={() => setRecentPage(page)}
                              aria-label={`Ir para página ${page}`}
                              aria-current={
                                page === safeRecentPage ? "page" : undefined
                              }
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          setRecentPage((page) =>
                            Math.min(recentPageCount, page + 1),
                          )
                        }
                        disabled={safeRecentPage === recentPageCount}
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
            </ChartPanel>
          </section>
        </>
      )}
    </div>
  );
}
