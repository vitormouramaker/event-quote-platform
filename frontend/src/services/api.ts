// ================================================================
//  api.ts — Cliente HTTP centralizado para o Orça Eventos API
//  Responsabilidades:
//  - Adicionar Authorization Bearer em todas as requisições
//  - Decodificar respostas JWT { payload }
//  - Expor funções tipadas para cada endpoint
// ================================================================

import { API_BASE_URL } from "../config/env";
// `API_BASE_URL` ja resolve a VITE_API_URL. Ler a variavel de novo aqui com
// `??` era uma armadilha: build arg nao informado vira string VAZIA, que nao
// e nullish, entao a base virava "" e as chamadas iam para a origem do front.
const CONFIGURED_API_URL = API_BASE_URL.replace(/\/+$/, "");
const API_DISCOVERY_TTL_MS = 10_000;
let activeApiUrl = CONFIGURED_API_URL;
let apiUrlDiscoveryPromise: Promise<string> | null = null;
let lastApiUrlDiscoveryAt = 0;
let lastDiscoveryWasHealthy = false;
let isApiDiscoveryInFlight = false;
let apiRequestSequence = 0;
type TokenProvider = () => string | null;
let apiTokenProvider: TokenProvider | null = null;

type ApiLogLevel = "debug" | "info" | "warn" | "error";

function isApiDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.localStorage.getItem("app:api-debug");
    if (flag != null) return flag === "1" || flag.toLowerCase() === "true";
  } catch {
    // ignore
  }
  return false;
}

function apiLog(level: ApiLogLevel, message: string, meta?: Record<string, unknown>) {
  const shouldLog = isApiDebugEnabled();
  if (!shouldLog) return;

  const ts = new Date().toISOString();
  const prefix = `[api][${ts}] ${message}`;
  const payload = meta && Object.keys(meta).length > 0 ? meta : undefined;

  if (level === "error") {
    console.error(prefix, payload ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(prefix, payload ?? "");
    return;
  }
  if (level === "info") {
    console.info(prefix, payload ?? "");
    return;
  }
  console.debug(prefix, payload ?? "");
}

function isLocalhostApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function buildApiCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const candidates = new Set<string>([normalized]);

  if (isLocalhostApiUrl(normalized)) {
    try {
      const parsed = new URL(normalized);
      const basePort = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
      if (Number.isFinite(basePort) && basePort > 0) {
        for (let offset = 1; offset <= 5; offset += 1) {
          const next = new URL(normalized);
          next.port = String(basePort + offset);
          candidates.add(next.toString().replace(/\/+$/, ""));
        }
      }
    } catch {
      // ignore parsing issues and keep configured URL only
    }
  }

  return [...candidates];
}

async function probeApiHealth(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1200);
  const startedAt = performance.now();

  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) {
      apiLog("debug", "Health probe falhou (status)", {
        baseUrl,
        status: res.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return false;
    }
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    const ok = body?.status === "ok";
    apiLog("debug", "Health probe concluido", {
      baseUrl,
      ok,
      durationMs: Math.round(performance.now() - startedAt),
      body,
    });
    return ok;
  } catch (error) {
    apiLog("debug", "Health probe falhou (erro de rede)", {
      baseUrl,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function discoverApiUrl(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && apiUrlDiscoveryPromise) {
    if (isApiDiscoveryInFlight) {
      apiLog("debug", "Reutilizando discovery em andamento", { activeApiUrl });
      return apiUrlDiscoveryPromise;
    }
    if (lastDiscoveryWasHealthy && now - lastApiUrlDiscoveryAt < API_DISCOVERY_TTL_MS) {
      apiLog("debug", "Usando cache de discovery", {
        activeApiUrl,
        ageMs: now - lastApiUrlDiscoveryAt,
      });
      return apiUrlDiscoveryPromise;
    }
  }

  lastApiUrlDiscoveryAt = now;
  isApiDiscoveryInFlight = true;
  apiUrlDiscoveryPromise = (async () => {
    const candidates = buildApiCandidates(activeApiUrl);
    apiLog("info", "Iniciando discovery de backend", {
      forceRefresh,
      activeApiUrl,
      configuredApiUrl: CONFIGURED_API_URL,
      candidates,
    });

    for (const candidate of candidates) {
      // If not localhost, trust the configured URL and skip probing alternates.
      if (!isLocalhostApiUrl(candidate)) {
        activeApiUrl = candidate;
        lastDiscoveryWasHealthy = true;
        apiLog("info", "Discovery usando URL configurada nao-local", {
          selectedApiUrl: activeApiUrl,
        });
        return activeApiUrl;
      }

      if (await probeApiHealth(candidate)) {
        if (activeApiUrl !== candidate) {
          // descoberta bem-sucedida; logs detalhados via apiLog quando habilitado
        }
        activeApiUrl = candidate;
        lastDiscoveryWasHealthy = true;
        apiLog("info", "Discovery selecionou backend saudavel", {
          selectedApiUrl: activeApiUrl,
        });
        return activeApiUrl;
      }
    }

    lastDiscoveryWasHealthy = false;
    apiLog("warn", "Discovery nao encontrou backend saudavel; mantendo URL atual", {
      activeApiUrl,
      candidates,
    });
    return activeApiUrl;
  })().finally(() => {
    isApiDiscoveryInFlight = false;
  });

  return apiUrlDiscoveryPromise;
}

export function setApiTokenProvider(provider: TokenProvider | null) {
  apiTokenProvider = provider;
}

export type UserRoleDto =
  | "ADM_MASTER"
  | "ADM_GERENTE"
  | "ADM_ORCAMENTO"
  | "ADM_ANALISTA_ORCAMENTO";
export type BudgetStatusDto = "PENDING" | "SENT_FOR_APPROVAL" | "APPROVED" | "CANCELLED";
export type RequestStatusDto = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type EditRequestStatusDto = "PENDING" | "APPROVED" | "REJECTED";

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  message: string;
}

interface BackendJwtResponse<T> {
  boleano: boolean;
  obj: T;
  mensagem: string;
}

interface PayloadWrapper {
  payload?: string;
}

// ---- AUTH DTOs ----
export interface AuthLoginResponseDto {
  token: string;
  id: string;
  name: string;
  login: string;
  role: UserRoleDto;
  perm_create_budget: boolean;
  perm_edit_budget: boolean;
  perm_delete_budget: boolean;
  perm_view_all_budgets: boolean;
  perm_approve_discounts: boolean;
  perm_approve_edit_requests: boolean;
  perm_manage_users: boolean;
  perm_view_dashboard?: boolean;
  perm_view_logs?: boolean;
}

// ---- USERS DTOs ----
export interface UserRowDto {
  id: string;
  name: string;
  login: string;
  role: UserRoleDto;
  active: boolean;
  created_at: string;
  perm_create_budget: boolean;
  perm_edit_budget: boolean;
  perm_delete_budget: boolean;
  perm_view_all_budgets: boolean;
  perm_approve_discounts: boolean;
  perm_approve_edit_requests: boolean;
  perm_manage_users: boolean;
  perm_view_dashboard: boolean;
  perm_view_logs: boolean;
}

export interface UserPermissionsPayload {
  createBudget: boolean;
  editBudget: boolean;
  deleteBudget: boolean;
  viewAllBudgets: boolean;
  approveDiscounts: boolean;
  approveEditRequests: boolean;
  manageUsers: boolean;
  viewDashboard: boolean;
  viewLogs: boolean;
}

export interface UserWriteDto {
  name?: string;
  login?: string;
  password?: string;
  role?: UserRoleDto;
  active?: boolean;
  permissions?: UserPermissionsPayload;
}

// ---- BUDGETS DTOs ----
export interface BudgetRowDto {
  id: string;
  instituicao: string;
  curso: string;
  comissao?: string | null;
  telefone?: string | null;
  controle?: string | null;
  observation?: string | null;
  created_by_name?: string | null;
  discount_percent?: number | string | null;
  /** "FIXED" quando o desconto geral foi pedido em reais. */
  discount_mode?: string | null;
  discount_amount?: number | string | null;
  original_total_value?: number | string | null;
  is_locked?: boolean | null;
  created_at: string;
  updated_at?: string | null;
  approved_at?: string | null;
  status: BudgetStatusDto;
  total_value?: number | string | null;
  deficit_value?: number | string | null;
  form_data?: unknown;
  approved_item_discounts?: Record<string, number> | null;
  approved_item_discount_amounts?: Record<string, number> | null;
  budget_code?: string | null;
  archived_at?: string | null;
  archived_by_user_id?: string | null;
  archived_by_name?: string | null;
}

export interface BudgetWriteDto {
  instituicao?: string;
  curso?: string;
  comissao?: string;
  telefone?: string;
  controle?: string;
  observation?: string;
  totalValue?: number;
  originalTotalValue?: number;
  deficitValue?: number;
  discountPercent?: number;
  approvedItemDiscounts?: Record<string, number>;
  /** Desconto de item pedido em reais, por chave `eventoId-itemId`. */
  approvedItemDiscountAmounts?: Record<string, number>;
  /** "FIXED" quando o desconto geral foi pedido em reais. */
  discountMode?: string;
  discountAmount?: number;
  formData?: unknown;
  status?: BudgetStatusDto;
  isLocked?: boolean;
  createdByName?: string;
  budgetCode?: string;
}

// ---- DASHBOARD DTOs ----
export interface DashboardSummaryMetricsDto {
  total_budgets: number | string | null;
  pending_budgets: number | string | null;
  approved_budgets: number | string | null;
  cancelled_budgets: number | string | null;
  locked_budgets: number | string | null;
  total_budget_value: number | string | null;
  approved_budget_value?: number | string | null;
  avg_budget_value: number | string | null;
  pending_discount_requests: number | string | null;
  pending_item_discount_requests: number | string | null;
  pending_edit_requests: number | string | null;
  active_users?: number | string | null;
}

export type DashboardDatePresetDto = "today" | "3m" | "6m" | "custom";
export type DashboardStatusFilterDto = "ALL" | BudgetStatusDto;
export type DashboardArchivedModeDto = "exclude" | "only" | "include";

export interface DashboardSummaryFiltersDto {
  preset?: DashboardDatePresetDto;
  startDate?: string;
  endDate?: string;
  status?: DashboardStatusFilterDto;
  archived?: DashboardArchivedModeDto;
  // Filtro por consultor/vendedor (created_by_name). Faz todas as métricas do
  // dashboard refletirem apenas os orçamentos daquele consultor.
  seller?: string;
}

export interface DashboardStatusBreakdownDto {
  status: BudgetStatusDto;
  count: number | string;
}

export interface DashboardMonthlyBudgetsDto {
  month_key: string;
  month_label: string;
  budget_count: number | string;
  total_value: number | string;
}

export interface DashboardRecentBudgetDto {
  id: string;
  instituicao: string;
  curso: string;
  comissao?: string | null;
  status: BudgetStatusDto;
  is_locked?: boolean | null;
  total_value?: number | string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface DashboardSummaryDto {
  filters_applied?: DashboardSummaryFiltersDto;
  metrics: DashboardSummaryMetricsDto;
  status_breakdown: DashboardStatusBreakdownDto[];
  monthly_budgets: DashboardMonthlyBudgetsDto[];
  recent_budgets: DashboardRecentBudgetDto[];
}

// ---- AUDIT LOGS DTOs ----
export interface AuditLogRowDto {
  id: number | string;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: UserRoleDto | string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  http_method?: string | null;
  route_path?: string | null;
  status_code?: number | null;
  success?: boolean | null;
  duration_ms?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  changes?: Array<{ field: string; before: unknown; after: unknown }> | null;
  metadata?: Record<string, unknown> | null;
  request_body?: unknown;
  query_params?: Record<string, unknown> | null;
}

export interface AuditLogsListDto {
  items: AuditLogRowDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditLogsFiltersDto {
  page?: number;
  pageSize?: number;
  search?: string;
  actor?: string;
  action?: string;
  entityType?: string;
  method?: string;
  success?: "true" | "false" | "";
  startDate?: string;
  endDate?: string;
}

// ---- DISCOUNTS DTOs ----
export interface DiscountRequestRowDto {
  id: string;
  budget_id?: string | null;
  client_name: string;
  total_value?: number | string | null;
  /** "FIXED" quando o desconto foi pedido em reais. */
  discount_mode?: string | null;
  /** Valor em reais pedido; só vem preenchido no modo FIXED. */
  requested_amount?: number | string | null;
  new_discount_value?: number | string | null;
  discount_percent?: number | string | null;
  original_discount_percent?: number | string | null;
  discount_value?: number | string | null;
  final_value?: number | string | null;
  requested_by: string;
  requested_at: string;
  status: RequestStatusDto;
  approved_by?: string | null;
  approved_at?: string | null;
  observation?: string | null;
  request_observation?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
}

export interface CreateDiscountRequestDto {
  budgetId?: string;
  clientName: string;
  totalValue: number;
  discountMode?: string;
  requestedAmount?: number;
  discountPercent: number;
  discountValue: number;
  finalValue: number;
  requestedBy: string;
  requestObservation: string;
  status?: RequestStatusDto;
  approvedBy?: string;
  approvedAt?: string;
  observation?: string;
}

export interface ItemDiscountRequestRowDto {
  id: string;
  budget_id: string;
  client_name: string;
  event_id: string;
  item_id: string;
  item_name: string;
  original_unit_price?: number | string | null;
  requested_percentage?: number | string | null;
  /** "FIXED" quando o desconto do item foi pedido em reais. */
  discount_mode?: string | null;
  requested_amount?: number | string | null;
  new_discount_amount?: number | string | null;
  requested_by: string;
  requested_at: string;
  reason?: string | null;
  status: RequestStatusDto;
  approved_by?: string | null;
  approved_at?: string | null;
  observation?: string | null;
  new_discount_percent?: number | string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
}

export interface CreateItemDiscountRequestDto {
  budgetId: string;
  clientName: string;
  eventId: string;
  itemId: string;
  itemName: string;
  originalUnitPrice: number;
  requestedPercentage: number;
  discountMode?: string;
  requestedAmount?: number;
  requestedBy: string;
  reason: string;
  status?: RequestStatusDto;
}

export interface UpdateItemDiscountStatusDto {
  budgetId: string;
  eventId: string;
  itemId: string;
  status: "APPROVED" | "REJECTED";
  observation: string;
  newDiscountPercent?: number;
  /** Valor aprovado em reais, quando o pedido era de valor fixo. */
  newDiscountAmount?: number;
}

// ---- EDIT REQUESTS DTOs ----
export interface EditRequestRowDto {
  id: string;
  budget_id: string;
  client_name: string;
  requested_by: string;
  requested_at: string;
  reason?: string | null;
  status: EditRequestStatusDto;
  approved_by?: string | null;
  approved_at?: string | null;
  observation?: string | null;
}

export interface CreateEditRequestDto {
  budgetId: string;
  clientName: string;
  requestedBy: string;
  reason: string;
  status?: EditRequestStatusDto;
}

// ---- ITEMS & EVENTS DTOs ----
export interface SubItemDto {
  id: string;
  name: string;
  created_at: string;
}

export interface SubItemWriteDto {
  name: string;
}

export interface ItemSubItemDto {
  id?: string;
  name: string;
}

export interface ItemVariationDto {
  id: string;
  name: string;
  unit_price: number;
  default_quantity: number;
}

export interface BaseItemDto {
  id: string;
  db_id?: string;
  legacy_item_id?: string | null;
  slug?: string | null;
  name: string;
  description?: string | null;
  unit_price: number | string;
  default_quantity: number | string;
  editable: boolean;
  dynamic_by_students: boolean;
  has_subitems: boolean;
  subitems: ItemSubItemDto[];
  variations?: ItemVariationDto[];
  item_kind?: string | null;
  category?: string | null;
  has_additional?: boolean | null;
  additional_quantity?: number | string | null;
  has_multiplier?: boolean | null;
  multiplier_quantity?: number | string | null;
  value_visible_to_client?: boolean | null;
  created_at: string;
  updated_at?: string;
}

export interface ItemWriteDto {
  name: string;
  unit_price: number;
  default_quantity: number;
  editable: boolean;
  dynamic_by_students: boolean;
  has_subitems: boolean;
  subitems: ItemSubItemDto[];
  variations?: ItemVariationDto[];
  has_additional?: boolean;
  additional_quantity?: number;
  has_multiplier?: boolean;
  multiplier_quantity?: number;
  value_visible_to_client?: boolean;
}

export interface EventTemplateDto {
  id: string;
  db_id?: string;
  legacy_event_id?: string | null;
  slug?: string | null;
  name: string;
  city: string;
  type: "Pago" | "Cortesia";
  value?: number | null;
  has_administration?: boolean;
  unit_price_editable?: boolean;
  requires_min_events?: boolean;
  /**
   * Evento que fecha um quadro próprio no "Resumo Final · Condições de
   * Pagamento" do orçamento (ex.: o baile, que vem depois do valor total até a
   * colação). Ver `domain/summaryBlocks`.
   */
  closes_summary_block?: boolean;
  /** Rótulo do quadro: "até o baile". Vazio usa o nome do evento. */
  summary_block_label?: string | null;
  // Família multi-cidade: eventos com o mesmo group_id são o "mesmo" evento em
  // cidades diferentes (abas por cidade na tela do evento).
  group_id?: string | null;
  items: BaseItemDto[];
  event_item_configs?: EventTemplateItemConfigDto[];
  summary_rules?: EventTemplateSummaryRuleDto[];
  created_at: string;
  updated_at?: string;
}

export interface EventTemplateItemConfigDto {
  item_id: string;
  item_db_id?: string | number;
  item_legacy_id?: string | null;
  item_slug?: string | null;
  sort_order?: number;
  is_group_header?: boolean;
  group_title?: string | null;
  display_value?: string | null;
  fixed_qty?: number | null;
  quantity_editable?: boolean;
  price_editable?: boolean;
  dynamic_by_students?: boolean;
  derived_rule_mode?: "fixed" | "same" | "add" | "multiply" | null;
  derived_rule_value?: number | null;
  /**
   * O item como ele é NESTE evento. Nulo herda o cadastro do item, que é o
   * padrão. Preenchido pela tela do item, nas abas por evento.
   */
  unit_price?: number | null;
  default_quantity?: number | null;
  value_visible_to_client?: boolean | null;
  has_subitems?: boolean | null;
  subitems?: ItemSubItemDto[] | null;
  has_additional?: boolean | null;
  additional_quantity?: number | null;
  has_multiplier?: boolean | null;
  multiplier_quantity?: number | null;
  variations?: ItemVariationDto[] | null;
  item_role?: "standard" | "container" | "selector" | "computed_reference" | null;
  summary_group?: string | null;
  selector_slug?: string | null;
  selector_options?: Array<{ slug: string; label: string; value?: number }>;
  include_in_financial_sum?: boolean;
  display_only?: boolean;
  formula_slug?: string | null;
  participant_source?: "participants" | null;
}

export interface EventTemplateSummaryRuleDto {
  slug: string;
  label: string;
  type:
    | "sum"
    | "percentage_of"
    | "division"
    | "fixed_value"
    | "display_included"
    | "display_dash"
    | "display_participants"
    | "same_value_of";
  percentage?: number | null;
  sources?: string[];
  numerator?: string | null;
  denominator?: string | null;
  value?: number | null;
  source?: string | null;
}

export interface CatalogSelectorDto {
  slug: string;
  label: string;
  options: Array<{ slug: string; label: string; value?: number }>;
}

export interface LegacyAliasDto {
  alias_type: "event" | "item";
  legacy_key: string;
  canonical_slug: string;
  notes?: string | null;
}

export interface EventTemplateWriteDto {
  name: string;
  city: string;
  type: "Pago" | "Cortesia";
  value?: number | null;
  has_administration?: boolean;
  unit_price_editable?: boolean;
  requires_min_events?: boolean;
  closes_summary_block?: boolean;
  summary_block_label?: string | null;
  group_id?: string | null;
  item_ids: string[];
  event_item_configs?: EventTemplateItemConfigDto[];
}

export interface EventTemplateCloneDto {
  city: string;
  name?: string;
  // true = duplicar como evento separado (família nova, não vira aba).
  new_family?: boolean;
}

export interface EventTemplateRuntimeCatalogDto {
  items: BaseItemDto[];
  selectors: CatalogSelectorDto[];
  eventTemplates: EventTemplateDto[];
  legacyAliases: LegacyAliasDto[];
}

export interface AuditoriumDto {
  id: string;
  name: string;
  slug: string;
  price: number;
  allow_budget_edit?: boolean;
  // Cidade do auditorio. null/vazio = disponivel em todas as cidades.
  city?: string | null;
}

export interface AuditoriumWriteDto {
  name: string;
  slug: string;
  price: number;
  allow_budget_edit?: boolean;
  city?: string | null;
}

export interface ContractDto {
  id: string;
  title: string;
  variables: Record<string, string>;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContractWriteDto {
  title: string;
  variables: Record<string, string>;
}

export interface ContractAnnexDto {
  id: string;
  budget_id: string;
  budget_code?: string | null;
  title: string;
  signature_date?: string | null;
  signature_names: string[];
  /** Eventos incluidos como cortesia so no anexo (nao mexem no orcamento). */
  courtesy_event_ids?: string[];
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  // Vem do JOIN com o orçamento (só leitura).
  instituicao?: string;
  curso?: string;
  budget_status?: BudgetStatusDto;
}

export interface ContractAnnexWriteDto {
  budget_id?: string;
  budget_code?: string | null;
  title: string;
  signature_date?: string | null;
  signature_names: string[];
  courtesy_event_ids?: string[];
}

export interface CityDto {
  id: string;
  name: string;
}

export interface CityWriteDto {
  name: string;
}

export type BudgetReviewKind = "devolutiva" | "resposta" | "aprovacao";
export type BudgetReviewStatus = "NONE" | "PENDING_CREATOR" | "PENDING_ANALYST" | "APPROVED";

export interface BudgetReviewDto {
  id: string;
  budget_id: string;
  author_user_id: string | null;
  author_name: string | null;
  author_role: string | null;
  kind: BudgetReviewKind;
  message: string | null;
  created_at: string;
}

export interface BudgetReviewThreadDto {
  reviews: BudgetReviewDto[];
  status: BudgetReviewStatus;
}

export interface BudgetReviewWriteDto {
  budget_id: string;
  kind: BudgetReviewKind;
  message?: string;
}

// JWT decode sem verificação de assinatura (padrão browser)
function decodeBase64UrlUtf8(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeJWT<T>(token: string): T {
  const base64 = token.split(".")[1];
  if (!base64) {
    throw new Error("JWT inválido: payload ausente");
  }
  const json = decodeBase64UrlUtf8(base64);
  return JSON.parse(json) as T;
}

function getTokenFromPersistedAuthStorage(): string | null {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

function getToken(): string | null {
  try {
    const fromProvider = apiTokenProvider?.();
    if (fromProvider) return fromProvider;
  } catch {
    // fallback para compatibilidade legada
  }
  return getTokenFromPersistedAuthStorage();
}

function isPayloadWrapper(value: unknown): value is PayloadWrapper {
  return Boolean(value && typeof value === "object" && "payload" in value);
}

function normalizeMessageForMatch(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAuthFailureMessage(message: string): boolean {
  const normalized = normalizeMessageForMatch(message);
  return (
    normalized.includes("token invalido") ||
    normalized.includes("token expirado") ||
    normalized.includes("nao autorizado")
  );
}

function handleGlobalAuthFailure(message: string) {
  if (!isAuthFailureMessage(message)) return;
  apiLog("warn", "Falha global de autenticacao detectada", {
    message,
    currentPath: typeof window !== "undefined" ? window.location.pathname : "",
  });

  try {
    localStorage.removeItem("auth-storage");
  } catch {
    // noop
  }

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const requestId = ++apiRequestSequence;
  const apiUrl = await discoverApiUrl();
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const startedAt = performance.now();
  const requestUrl = `${apiUrl}${path}`;
  apiLog("info", "HTTP request inicio", {
    requestId,
    method,
    url: requestUrl,
    hasBody: body !== undefined,
    usingApiUrl: apiUrl,
  });

  let res: Response;
  try {
    res = await fetch(requestUrl, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    apiLog("warn", "HTTP request falhou (rede). Tentando rediscovery.", {
      requestId,
      method,
      url: requestUrl,
      error: networkError instanceof Error ? networkError.message : String(networkError),
    });

    const refreshedApiUrl = await discoverApiUrl(true);
    const retryUrl = `${refreshedApiUrl}${path}`;

    if (refreshedApiUrl !== apiUrl) {
      apiLog("info", "HTTP request retry apos rediscovery", {
        requestId,
        method,
        previousApiUrl: apiUrl,
        retryApiUrl: refreshedApiUrl,
        retryUrl,
      });
      res = await fetch(retryUrl, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } else {
      throw networkError;
    }
  }

  if (
    res.status === 404 &&
    path.startsWith("/web/") &&
    isLocalhostApiUrl(apiUrl)
  ) {
    const refreshedApiUrl = await discoverApiUrl(true);
    if (refreshedApiUrl !== apiUrl) {
      apiLog("warn", "HTTP 404 em rota /web; retry em backend rediscover", {
        requestId,
        method,
        path,
        previousApiUrl: apiUrl,
        retryApiUrl: refreshedApiUrl,
      });
      res = await fetch(`${refreshedApiUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  const rawBody = await parseResponseBody(res);
  apiLog("info", "HTTP request fim", {
    requestId,
    method,
    path,
    status: res.status,
    ok: res.ok,
    durationMs: Math.round(performance.now() - startedAt),
    servingApiUrl: res.url ? new URL(res.url).origin : apiUrl,
    backendPortHeader: res.headers.get("x-api-port"),
    backendRequestIdHeader: res.headers.get("x-request-id"),
  });

  if (!res.ok) {
    const message = extractApiErrorMessage(rawBody, `HTTP ${res.status}: ${res.statusText}`);
    apiLog("warn", "HTTP request erro", {
      requestId,
      method,
      path,
      status: res.status,
      message,
    });
    handleGlobalAuthFailure(message);
    throw new Error(message);
  }
  const raw: unknown = rawBody;

  if (isPayloadWrapper(raw) && typeof raw.payload === "string") {
    const decoded = decodeJWT<BackendJwtResponse<T>>(raw.payload);
    if (!decoded.boleano && typeof decoded.mensagem === "string") {
      handleGlobalAuthFailure(decoded.mensagem);
    }
    return {
      ok: decoded.boleano,
      data: decoded.obj,
      message: decoded.mensagem,
    };
  }

  return { ok: true, data: raw as T, message: "" };
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function extractApiErrorMessage(raw: unknown, fallback: string) {
  if (!raw) return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const direct =
      record.message ??
      record.mensagem ??
      record.error ??
      record.erro;
    if (typeof direct === "string" && direct.trim()) return direct;

    if (isPayloadWrapper(record) && typeof record.payload === "string") {
      try {
        const decoded = decodeJWT<BackendJwtResponse<unknown>>(record.payload);
        if (typeof decoded.mensagem === "string" && decoded.mensagem.trim()) {
          return decoded.mensagem;
        }
      } catch {
        // fallback
      }
    }
  }
  return fallback;
}

// ---- Helpers ----
const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);
const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

/** Envia multipart/form-data (para uploads de arquivo). Não define Content-Type — o browser faz isso. */
async function requestMultipart<T>(
  method: string,
  path: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  const requestId = ++apiRequestSequence;
  const apiUrl = await discoverApiUrl();
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const startedAt = performance.now();
  const requestUrl = `${apiUrl}${path}`;
  apiLog("info", "HTTP multipart request inicio", { requestId, method, url: requestUrl });

  let res: Response;
  try {
    res = await fetch(requestUrl, { method, headers, body: formData });
  } catch (networkError) {
    const refreshedApiUrl = await discoverApiUrl(true);
    if (refreshedApiUrl !== apiUrl) {
      res = await fetch(`${refreshedApiUrl}${path}`, { method, headers, body: formData });
    } else {
      throw networkError;
    }
  }

  const rawBody = await parseResponseBody(res);
  apiLog("info", "HTTP multipart request fim", {
    requestId, method, path,
    status: res.status, durationMs: Math.round(performance.now() - startedAt),
  });

  if (!res.ok) {
    const message = extractApiErrorMessage(rawBody, `HTTP ${res.status}: ${res.statusText}`);
    handleGlobalAuthFailure(message);
    throw new Error(message);
  }

  const raw: unknown = rawBody;
  if (isPayloadWrapper(raw) && typeof raw.payload === "string") {
    const decoded = decodeJWT<BackendJwtResponse<T>>(raw.payload);
    if (!decoded.boleano && typeof decoded.mensagem === "string") {
      handleGlobalAuthFailure(decoded.mensagem);
    }
    return { ok: decoded.boleano, data: decoded.obj, message: decoded.mensagem };
  }
  return { ok: true, data: raw as T, message: "" };
}

/** Constrói a URL completa para download de um anexo.
 *  Novos anexos já chegam como URL CDN absoluta (Bunny.net).
 *  Anexos legados (só filename) ainda são servidos pelo backend local. */
export function resolveAttachmentUrl(filenameOrUrl: string): string {
  if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) {
    return filenameOrUrl;
  }
  return `${activeApiUrl}/web/uploads/${filenameOrUrl}`;
}

// ================================================================
//  AUTH
// ================================================================
export const authApi = {
  login: (login: string, password: string) =>
    post<AuthLoginResponseDto>("/web/auth/login", { login, password }),
  logout: () => post<Record<string, never>>("/web/auth/logout", {}),
};

// ================================================================
//  USERS
// ================================================================
export const usersApi = {
  getAll: () => get<UserRowDto[]>("/web/users"),
  create: (data: UserWriteDto) => post<UserRowDto>("/web/users", data),
  update: (id: string, data: UserWriteDto) => put<UserRowDto>(`/web/users/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/users/${id}`),
};

// ================================================================
//  BUDGETS
// ================================================================
export const budgetsApi = {
  getAll: () => get<BudgetRowDto[]>("/web/budgets"),
  getById: (id: string) => get<BudgetRowDto>(`/web/budgets/${id}`),
  create: (data: BudgetWriteDto) => post<{ id?: string }>("/web/budgets", data),
  update: (id: string, data: BudgetWriteDto) => put<BudgetRowDto>(`/web/budgets/${id}`, data),
  setLock: (id: string, isLocked: boolean) =>
    patch<BudgetRowDto>(`/web/budgets/${id}/lock`, { isLocked }),
  setStatus: (id: string, status: BudgetStatusDto, observation?: string) =>
    patch<BudgetRowDto>(`/web/budgets/${id}/status`, { status, observation }),
  setArchive: (id: string, archived: boolean) =>
    patch<{ id: string; archived_at: string | null }>(`/web/budgets/${id}/archive`, { archived }),
  remove: (id: string) => del<Record<string, never>>(`/web/budgets/${id}`),
  // Gera/retorna o token do link público do demonstrativo do cliente.
  share: (id: string) => post<{ token: string | null }>(`/web/budgets/${id}/share`, {}),
};

// ================================================================
//  PÚBLICO (sem autenticação) — demonstrativo do cliente via token
// ================================================================
export interface PublicDemonstrativoDto {
  budget: BudgetRowDto;
  eventTemplates: EventTemplateDto[];
  runtimeCatalog: EventTemplateRuntimeCatalogDto;
}

export const publicApi = {
  getDemonstrativo: (token: string) =>
    get<PublicDemonstrativoDto>(
      `/public/demonstrativo/${encodeURIComponent(token)}`,
    ),
};

// ================================================================
//  DASHBOARD
// ================================================================
export const dashboardApi = {
  getSummary: (filters?: DashboardSummaryFiltersDto) => {
    const params = new URLSearchParams();
    if (filters?.preset) params.set("preset", filters.preset);
    if (filters?.status && filters.status !== "ALL") params.set("status", filters.status);
    if (filters?.archived) params.set("archived", filters.archived);
    if (filters?.seller) params.set("seller", filters.seller);
    if (filters?.preset === "custom") {
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return get<DashboardSummaryDto>(`/web/dashboard/summary${suffix}`);
  },
};

// ================================================================
//  AUDIT LOGS
// ================================================================
export const auditLogsApi = {
  getAll: (filters?: AuditLogsFiltersDto) => {
    const params = new URLSearchParams();
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.actor) params.set("actor", filters.actor);
    if (filters?.action) params.set("action", filters.action);
    if (filters?.entityType) params.set("entityType", filters.entityType);
    if (filters?.method) params.set("method", filters.method);
    if (filters?.success) params.set("success", filters.success);
    if (filters?.startDate) params.set("startDate", filters.startDate);
    if (filters?.endDate) params.set("endDate", filters.endDate);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return get<AuditLogsListDto>(`/web/logs${suffix}`);
  },
};

// ================================================================
//  DISCOUNT REQUESTS (Global)
// ================================================================
export const discountsApi = {
  getAll: () => get<DiscountRequestRowDto[]>("/web/discounts"),
  getByBudget: (budgetId: string) =>
    get<DiscountRequestRowDto[]>(`/web/discounts/budget/${budgetId}`),
  create: (data: CreateDiscountRequestDto, attachmentFile?: File | null) => {
    const fd = new FormData();
    (Object.entries(data) as [string, unknown][]).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    if (attachmentFile) fd.append("attachment", attachmentFile, attachmentFile.name);
    return requestMultipart<DiscountRequestRowDto>("POST", "/web/discounts", fd);
  },
  updateStatus: (
    id: string,
    status: string,
    observation: string,
    newDiscountPercent?: number,
    newDiscountValue?: number,
  ) =>
    patch<DiscountRequestRowDto>(`/web/discounts/${id}/status`, {
      status,
      observation,
      newDiscountPercent,
      newDiscountValue,
    }),

  getAllItems: () => get<ItemDiscountRequestRowDto[]>("/web/discounts/items"),
  getItemsByBudget: (budgetId: string) =>
    get<ItemDiscountRequestRowDto[]>(`/web/discounts/items/budget/${budgetId}`),
  createItem: (data: CreateItemDiscountRequestDto, attachmentFile?: File | null) => {
    const fd = new FormData();
    (Object.entries(data) as [string, unknown][]).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    if (attachmentFile) fd.append("attachment", attachmentFile, attachmentFile.name);
    return requestMultipart<ItemDiscountRequestRowDto>("POST", "/web/discounts/items", fd);
  },
  updateItemStatus: (data: UpdateItemDiscountStatusDto) =>
    patch<Record<string, never>>("/web/discounts/items/status", data),
  deleteItem: (budgetId: string, eventId: string, itemId: string) =>
    del<Record<string, never>>(
      `/web/discounts/items?budgetId=${budgetId}&eventId=${eventId}&itemId=${itemId}`,
    ),
};

// ================================================================
//  EDIT REQUESTS
// ================================================================
export const editRequestsApi = {
  getAll: () => get<EditRequestRowDto[]>("/web/edits"),
  getByBudget: (budgetId: string) => get<EditRequestRowDto[]>(`/web/edits/budget/${budgetId}`),
  create: (data: CreateEditRequestDto) => post<EditRequestRowDto>("/web/edits", data),
  updateStatus: (id: string, status: string, observation: string) =>
    patch<EditRequestRowDto>(`/web/edits/${id}/status`, { status, observation }),
};

// ================================================================
//  ITEMS BASE
// ================================================================
/**
 * A "lógica por evento" de um item: um registro por evento que usa o item,
 * sobre a mesma tabela que o evento já usa (`event_template_item_configs`).
 * O que vier nulo aqui faz o item valer o padrão do próprio cadastro.
 */
export interface ItemEventConfigDto {
  event_template_id: string;
  event_name: string;
  event_city: string;
  event_group_id?: string | null;
  /** Nulo = este evento ainda não tem versão própria; herda o item. */
  config_id?: string | null;
  sort_order?: number | null;
  // --- O item, como ele é NESTE evento. Nulo herda o cadastro do item. ---
  unit_price?: number | null;
  default_quantity?: number | null;
  quantity_editable?: boolean | null;
  price_editable?: boolean | null;
  dynamic_by_students?: boolean | null;
  value_visible_to_client?: boolean | null;
  has_subitems?: boolean | null;
  subitems?: ItemSubItemDto[] | null;
  has_additional?: boolean | null;
  additional_quantity?: number | null;
  has_multiplier?: boolean | null;
  multiplier_quantity?: number | null;
  variations?: ItemVariationDto[] | null;
}

/** O que a tela envia por evento — espelha os campos do cadastro do item. */
export interface ItemEventConfigWriteDto {
  event_template_id: string;
  unit_price: number | null;
  default_quantity: number | null;
  /** Vale para quantidade E valor, como no cadastro do item. */
  editable: boolean;
  dynamic_by_students: boolean;
  value_visible_to_client: boolean;
  has_subitems: boolean;
  subitems: ItemSubItemDto[];
  has_additional: boolean;
  additional_quantity: number;
  has_multiplier: boolean;
  multiplier_quantity: number;
  variations: ItemVariationDto[];
}

export const itemsApi = {
  getAll: () => get<BaseItemDto[]>("/web/items"),
  getById: (id: string) => get<BaseItemDto>(`/web/items/${id}`),
  create: (data: ItemWriteDto) => post<BaseItemDto>("/web/items", data),
  update: (id: string, data: ItemWriteDto) => put<BaseItemDto>(`/web/items/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/items/${id}`),
  getEventConfigs: (id: string) =>
    get<ItemEventConfigDto[]>(`/web/items/${id}/event-configs`),
  saveEventConfigs: (id: string, configs: ItemEventConfigWriteDto[]) =>
    put<ItemEventConfigDto[]>(`/web/items/${id}/event-configs`, { configs }),
  addToEvent: (id: string, eventTemplateId: string) =>
    post<ItemEventConfigDto[]>(`/web/items/${id}/events`, {
      event_template_id: eventTemplateId,
    }),
  removeFromEvent: (id: string, eventTemplateId: string) =>
    del<ItemEventConfigDto[]>(`/web/items/${id}/events/${eventTemplateId}`),
};

// ================================================================
//  SUB-ITEMS BASE
// ================================================================
export const subItemsApi = {
  getAll: () => get<SubItemDto[]>("/web/sub-items"),
  getById: (id: string) => get<SubItemDto>(`/web/sub-items/${id}`),
  create: (data: SubItemWriteDto) => post<SubItemDto>("/web/sub-items", data),
  update: (id: string, data: SubItemWriteDto) => put<SubItemDto>(`/web/sub-items/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/sub-items/${id}`),
};

// ================================================================
//  EVENT TEMPLATES
// ================================================================
export const eventTemplatesApi = {
  getAll: () => get<EventTemplateDto[]>("/web/event-templates"),
  getRuntimeCatalog: () => get<EventTemplateRuntimeCatalogDto>("/web/event-templates/runtime-catalog"),
  getById: (id: string) => get<EventTemplateDto>(`/web/event-templates/${id}`),
  create: (data: EventTemplateWriteDto) => post<EventTemplateDto>("/web/event-templates", data),
  update: (id: string, data: EventTemplateWriteDto) =>
    put<EventTemplateDto>(`/web/event-templates/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/event-templates/${id}`),
  // Cria o mesmo evento para outra cidade (mesma família), copiando configs.
  clone: (id: string, data: EventTemplateCloneDto) =>
    post<EventTemplateDto>(`/web/event-templates/${id}/clone`, data),
  // Sobrescreve os irmãos (outras cidades) com a config deste evento.
  applyToFamily: (id: string) =>
    post<{ applied_to: string[] }>(`/web/event-templates/${id}/apply-to-family`, {}),
};

// ================================================================
//  AUDITORIUMS
// ================================================================
export const auditoriumsApi = {
  getAll: () => get<AuditoriumDto[]>("/web/auditoriums"),
  getById: (id: string) => get<AuditoriumDto>(`/web/auditoriums/${id}`),
  create: (data: AuditoriumWriteDto) => post<AuditoriumDto>("/web/auditoriums", data),
  update: (id: string, data: AuditoriumWriteDto) => put<AuditoriumDto>(`/web/auditoriums/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/auditoriums/${id}`),
};

// ================================================================
//  CONTRACTS
// ================================================================
export const contractsApi = {
  getAll: () => get<ContractDto[]>("/web/contracts"),
  getById: (id: string) => get<ContractDto>(`/web/contracts/${id}`),
  create: (data: ContractWriteDto) => post<ContractDto>("/web/contracts", data),
  update: (id: string, data: ContractWriteDto) =>
    put<ContractDto>(`/web/contracts/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/contracts/${id}`),
};

// ================================================================
//  CONTRACT ANNEXES (Anexo Contratual)
// ================================================================
export const contractAnnexesApi = {
  getAll: () => get<ContractAnnexDto[]>("/web/contract-annexes"),
  getById: (id: string) => get<ContractAnnexDto>(`/web/contract-annexes/${id}`),
  create: (data: ContractAnnexWriteDto) =>
    post<ContractAnnexDto>("/web/contract-annexes", data),
  update: (id: string, data: ContractAnnexWriteDto) =>
    put<ContractAnnexDto>(`/web/contract-annexes/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/contract-annexes/${id}`),
};

export const citiesApi = {
  getAll: () => get<CityDto[]>("/web/cities"),
  getById: (id: string) => get<CityDto>(`/web/cities/${id}`),
  create: (data: CityWriteDto) => post<CityDto>("/web/cities", data),
  update: (id: string, data: CityWriteDto) => put<CityDto>(`/web/cities/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/cities/${id}`),
};

export const budgetReviewsApi = {
  getByBudget: (budgetId: string) =>
    get<BudgetReviewThreadDto>(`/web/budget-reviews/${budgetId}`),
  create: (data: BudgetReviewWriteDto) =>
    post<{ review: BudgetReviewDto; status: BudgetReviewStatus }>("/web/budget-reviews", data),
};

// ================================================================
//  VENUE PROPOSALS (Proposta de locação — Aurora Hall)
// ================================================================
export interface VenueProposalRowDto {
  id: string;
  proposal_code: string;
  client_name: string;
  event_type: string;
  guests?: number | string | null;
  event_date?: string | null;
  /** Fim do evento; igual ao início quando dura um dia só. */
  event_end_date?: string | null;
  event_time?: string | null;
  setup_days?: number | string | null;
  teardown_days?: number | string | null;
  entrance_id?: string | null;
  /** Snapshot do formulário, inclusive os preços usados. */
  data?: unknown;
  subtotal?: number | string | null;
  discount_mode?: string | null;
  discount_percent?: number | string | null;
  discount_amount?: number | string | null;
  discount_reason?: string | null;
  /** NONE | PENDING | APPROVED | REJECTED */
  discount_status?: string | null;
  discount_reviewed_by?: string | null;
  discount_reviewed_at?: string | null;
  discount_observation?: string | null;
  total_value?: number | string | null;
  valid_until?: string | null;
  /** PENDING | SENT_FOR_APPROVAL | APPROVED | CANCELLED */
  status?: string | null;
  /** Proposta enviada ou aprovada trava para o consultor. */
  is_locked?: boolean | null;
  approved_at?: string | null;
  approved_by?: string | null;
  /** Motivo da devolução, escrito pelo gestor. */
  status_observation?: string | null;
  /** Código da família: as versões de uma mesma proposta o compartilham. */
  family_code?: string | null;
  version?: number | string | null;
  parent_id?: string | null;
  observation?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface VenueProposalWriteDto {
  clientName: string;
  eventType: string;
  guests?: number | null;
  eventDate?: string;
  eventEndDate?: string;
  eventTime?: string;
  setupDays: number;
  teardownDays: number;
  entranceId: string;
  data: unknown;
  subtotal: number;
  discountMode?: string;
  discountPercent?: number;
  discountAmount?: number;
  discountReason?: string;
  discountStatus?: string;
  totalValue: number;
  validUntil?: string;
  status?: string;
  observation?: string;
}

export interface VenueSettingsRowDto {
  data?: unknown;
  updated_by_name?: string | null;
  updated_at?: string | null;
}

export const venueProposalsApi = {
  getAll: () => get<VenueProposalRowDto[]>("/web/venue-proposals"),
  getById: (id: string) => get<VenueProposalRowDto>(`/web/venue-proposals/${id}`),
  create: (data: VenueProposalWriteDto) =>
    post<VenueProposalRowDto>("/web/venue-proposals", data),
  update: (id: string, data: VenueProposalWriteDto) =>
    put<VenueProposalRowDto>(`/web/venue-proposals/${id}`, data),
  remove: (id: string) => del<Record<string, never>>(`/web/venue-proposals/${id}`),
  createVersion: (id: string, data: VenueProposalWriteDto) =>
    post<VenueProposalRowDto>(`/web/venue-proposals/${id}/versions`, data),
  updateStatus: (
    id: string,
    body: { status: string; observation?: string },
  ) => patch<VenueProposalRowDto>(`/web/venue-proposals/${id}/status`, body),

  reviewDiscount: (
    id: string,
    body: {
      status: "APPROVED" | "REJECTED";
      observation: string;
      discountPercent: number;
      discountAmount: number;
      totalValue: number;
    },
  ) => patch<VenueProposalRowDto>(`/web/venue-proposals/${id}/discount`, body),

  getSettings: () => get<VenueSettingsRowDto>("/web/venue-proposals/settings"),
  updateSettings: (data: unknown) =>
    put<VenueSettingsRowDto>("/web/venue-proposals/settings", { data }),
};
