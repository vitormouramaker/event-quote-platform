import {
  budgetsApi,
  discountsApi,
  editRequestsApi,
  type BudgetRowDto,
  type DashboardArchivedModeDto,
  type DashboardDatePresetDto,
  type DashboardMonthlyBudgetsDto,
  type DashboardRecentBudgetDto,
  type DashboardStatusBreakdownDto,
  type DashboardStatusFilterDto,
  type DashboardSummaryDto,
  type DashboardSummaryFiltersDto,
  type ItemDiscountRequestRowDto,
} from "../../../services/api";

type NormalizedFilters = {
  preset: DashboardDatePresetDto;
  status: DashboardStatusFilterDto;
  archived: DashboardArchivedModeDto;
  startDate?: string;
  endDate?: string;
  seller?: string;
};

const VALID_PRESETS = new Set<DashboardDatePresetDto>(["today", "3m", "6m", "custom"]);
const VALID_STATUSES = new Set<DashboardStatusFilterDto>(["ALL", "PENDING", "APPROVED", "CANCELLED"]);
const VALID_ARCHIVED = new Set<DashboardArchivedModeDto>(["exclude", "only", "include"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFilters(filters?: DashboardSummaryFiltersDto): NormalizedFilters {
  const preset = VALID_PRESETS.has(filters?.preset ?? "6m") ? (filters?.preset ?? "6m") : "6m";
  const status = VALID_STATUSES.has(filters?.status ?? "ALL") ? (filters?.status ?? "ALL") : "ALL";
  const archived = VALID_ARCHIVED.has(filters?.archived ?? "exclude")
    ? (filters?.archived ?? "exclude")
    : "exclude";
  const startDate =
    preset === "custom" && typeof filters?.startDate === "string" && DATE_PATTERN.test(filters.startDate)
      ? filters.startDate
      : undefined;
  const endDate =
    preset === "custom" && typeof filters?.endDate === "string" && DATE_PATTERN.test(filters.endDate)
      ? filters.endDate
      : undefined;

  const seller =
    typeof filters?.seller === "string" && filters.seller.trim()
      ? filters.seller.trim()
      : undefined;

  return { preset, status, archived, startDate, endDate, seller };
}

function getDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${y}`;
}

function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
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

function shouldUseDailyBucket(filters: NormalizedFilters): boolean {
  if (filters.preset === "today") return true;
  if (filters.preset !== "custom" || !filters.startDate || !filters.endDate) return false;
  const start = new Date(`${filters.startDate}T00:00:00`);
  const end = new Date(`${filters.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diffDays > 0 && diffDays <= 31;
}

function matchesBudgetFilters(budget: BudgetRowDto, filters: NormalizedFilters): boolean {
  if (filters.archived === "exclude" && budget.archived_at) return false;
  if (filters.archived === "only" && !budget.archived_at) return false;
  if (filters.status !== "ALL" && budget.status !== filters.status) return false;
  if (filters.seller && (budget.created_by_name ?? "") !== filters.seller) return false;

  const createdAt = safeParseDate(budget.created_at);
  if (!createdAt) return false;

  if (filters.preset === "today") {
    return getDateKeyLocal(createdAt) === getDateKeyLocal(new Date());
  }

  if (filters.preset === "3m") {
    const threshold = addMonths(startOfLocalDay(new Date()), -3);
    return createdAt >= threshold;
  }

  if (filters.preset === "6m") {
    const threshold = addMonths(startOfLocalDay(new Date()), -6);
    return createdAt >= threshold;
  }

  if (filters.preset === "custom" && filters.startDate && filters.endDate) {
    const start = new Date(`${filters.startDate}T00:00:00`);
    const endExclusive = addDays(new Date(`${filters.endDate}T00:00:00`), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return false;
    return createdAt >= start && createdAt < endExclusive;
  }

  return true;
}

function buildStatusBreakdown(filteredBudgets: BudgetRowDto[]): DashboardStatusBreakdownDto[] {
  const counts = new Map<string, number>();
  for (const budget of filteredBudgets) {
    counts.set(budget.status, (counts.get(budget.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status: status as DashboardStatusBreakdownDto["status"], count }))
    .sort((a, b) => a.status.localeCompare(b.status));
}

function buildMonthlyBudgets(
  filteredBudgets: BudgetRowDto[],
  filters: NormalizedFilters,
): DashboardMonthlyBudgetsDto[] {
  const dailyBuckets = shouldUseDailyBucket(filters);
  const map = new Map<string, { key: string; label: string; count: number; total: number; sort: number }>();

  for (const budget of filteredBudgets) {
    const createdAt = safeParseDate(budget.created_at);
    if (!createdAt) continue;

    const key = dailyBuckets ? getDateKeyLocal(createdAt) : formatMonthKey(createdAt);
    const label = dailyBuckets ? formatDayLabel(createdAt) : formatMonthLabel(createdAt);
    const sort = dailyBuckets
      ? startOfLocalDay(createdAt).getTime()
      : new Date(createdAt.getFullYear(), createdAt.getMonth(), 1).getTime();
    const current = map.get(key) ?? { key, label, count: 0, total: 0, sort };
    current.count += 1;
    current.total += toNumber(budget.total_value);
    map.set(key, current);
  }

  return Array.from(map.values())
    .sort((a, b) => a.sort - b.sort)
    .map((item) => ({
      month_key: item.key,
      month_label: item.label,
      budget_count: item.count,
      total_value: item.total,
    }));
}

function buildRecentBudgets(filteredBudgets: BudgetRowDto[]): DashboardRecentBudgetDto[] {
  return [...filteredBudgets]
    .sort((a, b) => {
      const aTs = safeParseDate(a.created_at)?.getTime() ?? 0;
      const bTs = safeParseDate(b.created_at)?.getTime() ?? 0;
      return bTs - aTs;
    })
    .slice(0, 50)
    .map((budget) => ({
      id: budget.id,
      instituicao: budget.instituicao,
      curso: budget.curso,
      comissao: budget.comissao ?? null,
      status: budget.status,
      is_locked: budget.is_locked ?? null,
      total_value: budget.total_value ?? null,
      created_at: budget.created_at,
      created_by_name: budget.created_by_name ?? null,
    }));
}

async function getPendingItemDiscountCount(filteredBudgetIds: string[]): Promise<number> {
  if (filteredBudgetIds.length === 0) return 0;

  let pendingCount = 0;
  const batchSize = 10;

  for (let index = 0; index < filteredBudgetIds.length; index += batchSize) {
    const batch = filteredBudgetIds.slice(index, index + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((budgetId) => discountsApi.getItemsByBudget(budgetId)),
    );

    for (const result of batchResults) {
      if (result.status !== "fulfilled") continue;
      if (!result.value.ok) continue;
      const rows = result.value.data as ItemDiscountRequestRowDto[];
      for (const row of rows) {
        if (row.status === "PENDING") pendingCount += 1;
      }
    }
  }

  return pendingCount;
}

export async function buildDashboardSummaryFallback(
  filters?: DashboardSummaryFiltersDto,
): Promise<DashboardSummaryDto> {
  const normalized = normalizeFilters(filters);

  const [budgetsRes, discountsRes, editsRes] = await Promise.all([
    budgetsApi.getAll(),
    discountsApi.getAll(),
    editRequestsApi.getAll(),
  ]);

  if (!budgetsRes.ok) {
    throw new Error(budgetsRes.message || "Erro ao carregar orçamentos para fallback do dashboard");
  }
  if (!discountsRes.ok) {
    throw new Error(discountsRes.message || "Erro ao carregar descontos para fallback do dashboard");
  }
  if (!editsRes.ok) {
    throw new Error(editsRes.message || "Erro ao carregar edições para fallback do dashboard");
  }

  const filteredBudgets = budgetsRes.data.filter((budget) => matchesBudgetFilters(budget, normalized));
  const filteredBudgetIds = new Set(filteredBudgets.map((budget) => budget.id));

  const pendingDiscountRequests = discountsRes.data.filter(
    (row) => row.status === "PENDING" && (!!row.budget_id ? filteredBudgetIds.has(row.budget_id) : false),
  ).length;

  const pendingEditRequests = editsRes.data.filter(
    (row) => row.status === "PENDING" && filteredBudgetIds.has(row.budget_id),
  ).length;

  const pendingItemDiscountRequests = await getPendingItemDiscountCount([...filteredBudgetIds]);

  const totalBudgets = filteredBudgets.length;
  const pendingBudgets = filteredBudgets.filter((budget) => budget.status === "PENDING").length;
  const approvedBudgets = filteredBudgets.filter((budget) => budget.status === "APPROVED").length;
  const cancelledBudgets = filteredBudgets.filter((budget) => budget.status === "CANCELLED").length;
  const lockedBudgets = filteredBudgets.filter((budget) => budget.is_locked === true).length;
  const totalBudgetValue = filteredBudgets.reduce((sum, budget) => sum + toNumber(budget.total_value), 0);
  const approvedBudgetValue = filteredBudgets
    .filter((budget) => budget.status === "APPROVED")
    .reduce(
      (sum, budget) =>
        sum + toNumber(budget.total_value ?? budget.original_total_value ?? 0),
      0,
    );
  const avgBudgetValue = totalBudgets > 0 ? totalBudgetValue / totalBudgets : 0;

  return {
    filters_applied: normalized,
    metrics: {
      total_budgets: totalBudgets,
      pending_budgets: pendingBudgets,
      approved_budgets: approvedBudgets,
      cancelled_budgets: cancelledBudgets,
      locked_budgets: lockedBudgets,
      total_budget_value: totalBudgetValue,
      approved_budget_value: approvedBudgetValue,
      avg_budget_value: avgBudgetValue,
      pending_discount_requests: pendingDiscountRequests,
      pending_item_discount_requests: pendingItemDiscountRequests,
      pending_edit_requests: pendingEditRequests,
      active_users: null,
    },
    status_breakdown: buildStatusBreakdown(filteredBudgets),
    monthly_budgets: buildMonthlyBudgets(filteredBudgets, normalized),
    recent_budgets: buildRecentBudgets(filteredBudgets),
  };
}
