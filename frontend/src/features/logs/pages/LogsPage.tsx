import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import { useAuditLogsQuery } from "../queries/useAuditLogsQuery";
import type { AuditLogsFiltersDto, AuditLogRowDto } from "../../../services/api";
import styles from "../styles/LogsPage.module.css";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

function prettyJson(value: unknown) {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function methodBadgeClass(method?: string | null) {
  const upper = String(method || "").toUpperCase();
  if (upper === "POST") return `${styles.badge} ${styles.badgeInfo}`;
  if (upper === "PUT" || upper === "PATCH") return `${styles.badge} ${styles.badgeWarn}`;
  if (upper === "DELETE") return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeNeutral}`;
}

function successBadgeClass(success?: boolean | null) {
  if (success === true) return `${styles.badge} ${styles.badgeSuccess}`;
  if (success === false) return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeNeutral}`;
}

type LogsViewMode = "direct" | "deep";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPercentLabel(value: number | null) {
  if (value == null) return "";
  return `${String(value).replace(".", ",")}%`;
}

function extractBudgetLabel(item: AuditLogRowDto) {
  const before = asRecord(item.before_data);
  const after = asRecord(item.after_data);
  const req = asRecord(item.request_body);

  const instituicao =
    readString(after, "instituicao") ||
    readString(before, "instituicao") ||
    readString(req, "instituicao") ||
    readString(req, "clientName");

  const curso =
    readString(after, "curso") ||
    readString(before, "curso") ||
    readString(req, "curso");

  if (instituicao && curso) return `${instituicao} - ${curso}`;
  if (instituicao) return instituicao;
  return item.entity_id ? `orcamento ${item.entity_id}` : "orcamento";
}

function formatAuditDirectMessage(item: AuditLogRowDto) {
  const actor = item.actor_name || "Sistema";
  const when = dateTime.format(new Date(item.created_at));
  const method = String(item.http_method || "").toUpperCase();
  const route = item.route_path || "";
  const req = asRecord(item.request_body);
  const metadata = asRecord(item.metadata);
  const successLabel =
    item.success === false ? " (falha)" : "";

  if (item.action === "auth.login" || route === "/web/auth/login") {
    return {
      title:
        item.success === false
          ? `${actor} tentou entrar no sistema${successLabel}.`
          : `${actor} fez login no sistema.`,
      subtitle: `Em ${when}`,
    };
  }

  if (item.action === "auth.logout" || route === "/web/auth/logout") {
    return {
      title: `${actor} fez logout do sistema.`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/discounts/items/status") {
    const status = readString(req, "status").toUpperCase();
    const itemName = readString(req, "itemName") || readString(metadata, "itemName") || readString(req, "itemId") || "item";
    const pct = readNumber(req, "newDiscountPercent") ?? readNumber(req, "requestedPercentage");
    const pctLabel = toPercentLabel(pct);
    const verb =
      status === "APPROVED"
        ? "aprovou"
        : status === "REJECTED"
          ? "reprovou"
          : "atualizou";
    const actionLabel =
      pctLabel && status === "APPROVED"
        ? `${verb} um desconto de ${pctLabel} no item ${itemName}`
        : `${verb} a solicitacao de desconto do item ${itemName}`;
    return {
      title: `${actor} ${actionLabel}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/discounts/items" && method === "POST") {
    const itemName = readString(req, "itemName") || readString(req, "itemId") || "item";
    const pct = readNumber(req, "requestedPercentage");
    const pctLabel = toPercentLabel(pct);
    return {
      title: `${actor} solicitou desconto${pctLabel ? ` de ${pctLabel}` : ""} no item ${itemName}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/discounts/:id/status") {
    const status = readString(req, "status").toUpperCase();
    const pct = readNumber(req, "newDiscountPercent");
    const pctLabel = toPercentLabel(pct);
    const verb =
      status === "APPROVED"
        ? "aprovou"
        : status === "REJECTED"
          ? "reprovou"
          : "atualizou";
    return {
      title: `${actor} ${verb} uma solicitacao de desconto geral${pctLabel ? ` (${pctLabel})` : ""}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/discounts" && method === "POST") {
    const pct = readNumber(req, "discountPercent");
    const pctLabel = toPercentLabel(pct);
    return {
      title: `${actor} solicitou desconto geral${pctLabel ? ` de ${pctLabel}` : ""}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/edits" && method === "POST") {
    return {
      title: `${actor} solicitou liberacao para editar um orcamento.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/edits/:id/status") {
    const status = readString(req, "status").toUpperCase();
    const verb =
      status === "APPROVED"
        ? "aprovou"
        : status === "REJECTED"
          ? "reprovou"
          : "atualizou";
    return {
      title: `${actor} ${verb} uma solicitacao de edicao de orcamento.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/budgets" && method === "POST") {
    return {
      title: `${actor} criou o ${extractBudgetLabel(item)}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/budgets/:id/status") {
    const status = readString(req, "status").toUpperCase();
    const statusLabel =
      status === "APPROVED" ? "Aprovado" :
      status === "CANCELLED" ? "Cancelado" :
      status === "PENDING" ? "Pendente" :
      status || "Atualizado";
    return {
      title: `${actor} alterou o status do ${extractBudgetLabel(item)} para ${statusLabel}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/budgets/:id/lock") {
    const isLocked = req?.isLocked === true;
    return {
      title: `${actor} ${isLocked ? "bloqueou" : "desbloqueou"} um orcamento.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/budgets/:id" && method === "PUT") {
    return {
      title: `${actor} atualizou o ${extractBudgetLabel(item)}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/budgets/:id" && method === "DELETE") {
    return {
      title: `${actor} excluiu um orcamento.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/users" && method === "POST") {
    const targetName = readString(req, "name");
    return {
      title: `${actor} criou ${targetName ? `o usuario ${targetName}` : "um usuario"}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/users/:id" && method === "PUT") {
    const targetName = readString(req, "name");
    return {
      title: `${actor} atualizou ${targetName ? `o usuario ${targetName}` : "um usuario"}.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  if (route === "/web/users/:id" && method === "DELETE") {
    return {
      title: `${actor} excluiu um usuario.${successLabel}`,
      subtitle: `Em ${when}`,
    };
  }

  return {
    title: `${actor} executou ${method || "acao"} em ${route || item.action}.${successLabel}`,
    subtitle: `Em ${when}`,
  };
}

function DirectLogRow({ item }: { item: AuditLogRowDto }) {
  const msg = formatAuditDirectMessage(item);
  const changedFields = Array.isArray(item.changes) ? item.changes : [];

  return (
    <article className={styles.directCard}>
      <div className={styles.directHead}>
        <div>
          <h3 className={styles.directTitle}>{msg.title}</h3>
          <p className={styles.directSubtitle}>{msg.subtitle}</p>
        </div>
        <div className={styles.badgesWrap}>
          <span className={methodBadgeClass(item.http_method)}>{item.http_method || "N/A"}</span>
          <span className={successBadgeClass(item.success)}>
            {item.success === true ? "Sucesso" : item.success === false ? "Falha" : "Indef."}
          </span>
        </div>
      </div>

      <div className={styles.directMetaRow}>
        <span><strong>Rota:</strong> {item.route_path || "-"}</span>
        <span><strong>Status HTTP:</strong> {item.status_code ?? "-"}</span>
        <span><strong>Duracao:</strong> {item.duration_ms != null ? `${item.duration_ms}ms` : "-"}</span>
        {item.actor_role ? <span><strong>Perfil:</strong> {item.actor_role}</span> : null}
      </div>

      {changedFields.length > 0 && (
        <div className={styles.changedFields}>
          <strong>Campos alterados:</strong>
          <div className={styles.changedFieldList}>
            {changedFields.map((change, idx) => (
              <span key={`${item.id}-${change.field}-${idx}`} className={styles.fieldPill}>
                {change.field}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function LogRow({ item }: { item: AuditLogRowDto }) {
  const changedFields = Array.isArray(item.changes) ? item.changes : [];

  return (
    <article className={styles.logCard}>
      <div className={styles.logHead}>
        <div>
          <h3 className={styles.logTitle}>{item.description || item.action}</h3>
          <p className={styles.logMeta}>
            <span><strong>Quem:</strong> {item.actor_name || "Sistema"}</span>
            <span><strong>Quando:</strong> {dateTime.format(new Date(item.created_at))}</span>
            {item.entity_type ? <span><strong>Entidade:</strong> {item.entity_type}</span> : null}
            {item.entity_id ? <span><strong>ID:</strong> {item.entity_id}</span> : null}
          </p>
        </div>
        <div className={styles.badgesWrap}>
          <span className={methodBadgeClass(item.http_method)}>{item.http_method || "N/A"}</span>
          <span className={successBadgeClass(item.success)}>
            {item.success === true ? "Sucesso" : item.success === false ? "Falha" : "Indef."}
          </span>
        </div>
      </div>

      <div className={styles.logBody}>
        <div className={styles.infoGrid}>
          <div><strong>O que fez:</strong> {item.action}</div>
          <div><strong>Rota:</strong> {item.route_path || "-"}</div>
          <div><strong>Status HTTP:</strong> {item.status_code ?? "-"}</div>
          <div><strong>Duração:</strong> {item.duration_ms != null ? `${item.duration_ms}ms` : "-"}</div>
          <div><strong>Perfil:</strong> {item.actor_role || "-"}</div>
          <div><strong>IP:</strong> {item.ip_address || "-"}</div>
        </div>

        {changedFields.length > 0 && (
          <div className={styles.changedFields}>
            <strong>Campos alterados:</strong>
            <div className={styles.changedFieldList}>
              {changedFields.map((change, idx) => (
                <span key={`${item.id}-${change.field}-${idx}`} className={styles.fieldPill}>
                  {change.field}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.diffGrid}>
          <details className={styles.payloadPanel}>
            <summary>Antes</summary>
            <pre>{prettyJson(item.before_data) || "Sem snapshot anterior"}</pre>
          </details>
          <details className={styles.payloadPanel}>
            <summary>Depois</summary>
            <pre>{prettyJson(item.after_data) || "Sem snapshot posterior"}</pre>
          </details>
        </div>

        <div className={styles.diffGrid}>
          <details className={styles.payloadPanel}>
            <summary>Requisição (sanitizada)</summary>
            <pre>{prettyJson(item.request_body) || "Sem body"}</pre>
          </details>
          <details className={styles.payloadPanel}>
            <summary>Metadados</summary>
            <pre>{prettyJson(item.metadata) || "Sem metadados"}</pre>
          </details>
        </div>
      </div>
    </article>
  );
}

export function LogsPage() {
  const [viewMode, setViewMode] = useState<LogsViewMode>("direct");
  const [filters, setFilters] = useState<AuditLogsFiltersDto>({
    page: 1,
    pageSize: 20,
    search: "",
    actor: "",
    action: "",
    entityType: "",
    method: "",
    success: "",
    startDate: "",
    endDate: "",
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLogsQuery(filters);

  const totalPages = useMemo(() => {
    const total = Number(data?.total || 0);
    const pageSize = Number(filters.pageSize || 20);
    return Math.max(Math.ceil(total / pageSize), 1);
  }, [data?.total, filters.pageSize]);

  const updateFilter = <K extends keyof AuditLogsFiltersDto>(key: K, value: AuditLogsFiltersDto[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Logs</h1>
          <p className={styles.subtitle}>
            Trilhas de auditoria de todas as ações executadas no sistema.
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} />}
          onClick={() => void refetch()}
        >
          {isFetching ? "Atualizando..." : "Atualizar"}
        </Button>
      </header>

      <section className={styles.filtersPanel}>
        <div className={styles.filtersGrid}>
          <label className={styles.filterField}>
            <span>Busca geral</span>
            <input
              value={filters.search || ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="ação, descrição, entidade, id..."
            />
          </label>
          <label className={styles.filterField}>
            <span>Quem fez</span>
            <input
              value={filters.actor || ""}
              onChange={(e) => updateFilter("actor", e.target.value)}
              placeholder="nome do usuário"
            />
          </label>
          <label className={styles.filterField}>
            <span>O que fez</span>
            <input
              value={filters.action || ""}
              onChange={(e) => updateFilter("action", e.target.value)}
              placeholder="budget.status_update"
            />
          </label>
          <label className={styles.filterField}>
            <span>Entidade</span>
            <input
              value={filters.entityType || ""}
              onChange={(e) => updateFilter("entityType", e.target.value)}
              placeholder="budget, user..."
            />
          </label>
          <label className={styles.filterField}>
            <span>Método</span>
            <select
              value={filters.method || ""}
              onChange={(e) => updateFilter("method", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Resultado</span>
            <select
              value={filters.success || ""}
              onChange={(e) => updateFilter("success", e.target.value as AuditLogsFiltersDto["success"])}
            >
              <option value="">Todos</option>
              <option value="true">Sucesso</option>
              <option value="false">Falha</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Data inicial</span>
            <input
              type="date"
              value={filters.startDate || ""}
              onChange={(e) => updateFilter("startDate", e.target.value)}
            />
          </label>
          <label className={styles.filterField}>
            <span>Data final</span>
            <input
              type="date"
              value={filters.endDate || ""}
              onChange={(e) => updateFilter("endDate", e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className={styles.tabsRow}>
        <button
          type="button"
          className={`${styles.tabPill} ${viewMode === "direct" ? styles.tabPillActive : ""}`}
          onClick={() => setViewMode("direct")}
        >
          Dados diretos
        </button>
        <button
          type="button"
          className={`${styles.tabPill} ${viewMode === "deep" ? styles.tabPillActive : ""}`}
          onClick={() => setViewMode("deep")}
        >
          Dados profundos
        </button>
      </div>

      {isLoading && <LoadingStatePanel message="Carregando logs..." />}

      {isError && (
        <ErrorStatePanel
          title="Erro ao carregar logs"
          message={error instanceof Error ? error.message : "Tente novamente."}
          actions={
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {!isLoading && !isError && (data?.items?.length ?? 0) === 0 && (
        <EmptyStatePanel message="Nenhum log encontrado para os filtros aplicados." />
      )}

      {!isLoading && !isError && (data?.items?.length ?? 0) > 0 && (
        <>
          <div className={styles.summaryRow}>
            <span className={styles.resultsCount}>
              Exibindo {data?.items.length} de {data?.total} registros
            </span>
          </div>

          <section className={styles.logsList}>
            {data?.items.map((item) => (
              viewMode === "direct" ? (
                <DirectLogRow key={String(item.id)} item={item} />
              ) : (
                <LogRow key={String(item.id)} item={item} />
              )
            ))}
          </section>

          <div className={styles.paginationFooter}>
            <div className={styles.pagination}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max((prev.page || 1) - 1, 1) }))}
                disabled={(filters.page || 1) <= 1}
              >
                Anterior
              </Button>
              <span className={styles.pageIndicator}>
                {"P\u00e1gina"} {filters.page || 1} de {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.min((prev.page || 1) + 1, totalPages),
                  }))
                }
                disabled={(filters.page || 1) >= totalPages}
              >
                {"Pr\u00f3xima"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
