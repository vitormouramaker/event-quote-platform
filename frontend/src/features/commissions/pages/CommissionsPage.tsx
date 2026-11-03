import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Trophy } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../../../components/Button/Button";
import { useBudgetsQuery } from "../../budgets/queries/useBudgetsQuery";
import { useVenueProposalsQuery } from "../../venueProposals/queries/useVenueProposalQueries";
import { groupVenueVersions } from "../../venueProposals/domain/venueVersions";
import type { Budget } from "../../../store/budgetStore";
import styles from "../../dashboard/styles/DashboardPage.module.css";
import tableStyles from "../styles/CommissionsPage.module.css";

// Comissão do consultor, por tipo de venda (percentuais fictícios de demonstração).
// Fixos no código: mudar aqui muda a tela inteira.
const COMMISSION_RATE = 0.03;
const VENUE_COMMISSION_RATE = 0.015;

/** Uma venda comissionável, venha de um orçamento ou de uma locacão. */
type Venda = {
  id: string;
  consultant: string;
  label: string;
  value: number;
  approvedAt: Date | null;
  /** A taxa vale por venda: orçamento e locacão comissionam diferente. */
  rate: number;
  origin: "Orçamento" | "Locação";
};

type DatePreset = "today" | "3m" | "6m" | "custom";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const integer = new Intl.NumberFormat("pt-BR");

const DATE_PRESET_OPTIONS: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "custom", label: "Data específica" },
];

function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function matchesPeriod(
  createdAt: Date,
  preset: DatePreset,
  startDate: string,
  endDate: string,
): boolean {
  if (preset === "today") return dateKey(createdAt) === dateKey(new Date());
  if (preset === "3m") return createdAt >= addMonths(startOfLocalDay(new Date()), -3);
  if (preset === "6m") return createdAt >= addMonths(startOfLocalDay(new Date()), -6);
  if (preset === "custom") {
    if (!startDate || !endDate) return true;
    const start = new Date(`${startDate}T00:00:00`);
    const endExclusive = addDays(new Date(`${endDate}T00:00:00`), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime()))
      return true;
    return createdAt >= start && createdAt < endExclusive;
  }
  return true;
}

function sellerName(budget: Budget): string {
  return budget.createdByName || budget.createdBy || "Sem consultor";
}

// Data que define a comissão = data de aprovação. Fallback p/ criação apenas em
// registros antigos sem approved_at (backfill usou updated_at no backend).
function approvalDate(budget: Budget): Date | null {
  return safeParseDate(budget.approvedAt ?? budget.createdAt);
}

function formatDateBR(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR");
}

type RankingRow = {
  consultant: string;
  approvedCount: number;
  approvedValue: number;
  commission: number;
};

export function CommissionsPage() {
  const navigate = useNavigate();
  const { data: allBudgets = [], isLoading } = useBudgetsQuery();
  const { data: venueProposals = [] } = useVenueProposalsQuery();

  const [datePreset, setDatePreset] = useState<DatePreset>("6m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");

  // Base: vendas APROVADAS (comissão só é creditada quando aprova). Orçamento
  // arquivado fica de fora para versão antiga não contar em dobro.
  const approvedSales = useMemo<Venda[]>(() => {
    const deOrcamentos: Venda[] = allBudgets
      .filter((budget) => budget.status === "APPROVED" && !budget.archivedAt)
      .map((budget) => ({
        id: `budget:${budget.id}`,
        consultant: sellerName(budget),
        label: [budget.instituicao, budget.curso].filter(Boolean).join(" — "),
        value: Number(budget.totalValue) || 0,
        approvedAt: approvalDate(budget),
        rate: COMMISSION_RATE,
        origin: "Orçamento",
      }));

    // Só a versão vigente comissiona: v1 e v2 aprovadas são a mesma venda.
    const deLocacoes: Venda[] = groupVenueVersions(venueProposals)
      .map((familia) => familia.latest)
      .filter((row) => row.status === "APPROVED")
      .map((row) => ({
        id: `venue:${row.id}`,
        consultant: row.created_by_name || "Sem consultor",
        label: [row.client_name, row.event_type].filter(Boolean).join(" — "),
        value: Number(row.total_value) || 0,
        // Proposta antiga sem data de aprovação cai na de criação, como no
        // orçamento.
        approvedAt: safeParseDate(row.approved_at ?? row.created_at),
        rate: VENUE_COMMISSION_RATE,
        origin: "Locação",
      }));

    return [...deOrcamentos, ...deLocacoes];
  }, [allBudgets, venueProposals]);

  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const venda of approvedSales) set.add(venda.consultant);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [approvedSales]);

  const filteredSales = useMemo(
    () =>
      approvedSales.filter((venda) => {
        if (!venda.approvedAt) return false;
        if (!matchesPeriod(venda.approvedAt, datePreset, customStartDate, customEndDate))
          return false;
        if (sellerFilter && venda.consultant !== sellerFilter) return false;
        return true;
      }),
    [approvedSales, datePreset, customStartDate, customEndDate, sellerFilter],
  );

  const commissionOf = (venda: Venda) => venda.value * venda.rate;

  const totalCommission = useMemo(
    () => filteredSales.reduce((sum, venda) => sum + commissionOf(venda), 0),
    [filteredSales],
  );
  const totalApprovedValue = useMemo(
    () => filteredSales.reduce((sum, venda) => sum + venda.value, 0),
    [filteredSales],
  );
  const approvedCount = filteredSales.length;
  const venueCount = filteredSales.filter((v) => v.origin === "Locação").length;
  const commissionedConsultants = useMemo(
    () => new Set(filteredSales.map((venda) => venda.consultant)).size,
    [filteredSales],
  );

  // Ranking por consultor, ordenado por comissão desc.
  const ranking = useMemo<RankingRow[]>(() => {
    const map = new Map<string, RankingRow>();
    for (const venda of filteredSales) {
      const row =
        map.get(venda.consultant) ??
        { consultant: venda.consultant, approvedCount: 0, approvedValue: 0, commission: 0 };
      row.approvedCount += 1;
      row.approvedValue += venda.value;
      row.commission += commissionOf(venda);
      map.set(venda.consultant, row);
    }
    return Array.from(map.values()).sort((a, b) => b.commission - a.commission);
  }, [filteredSales]);

  // Evolução mensal das comissões.
  const monthlyData = useMemo(() => {
    const map = new Map<string, { key: string; label: string; commission: number }>();
    for (const venda of filteredSales) {
      const dt = venda.approvedAt;
      if (!dt) continue;
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const key = `${y}-${m}`;
      const label = `${m}/${y}`;
      const cur = map.get(key) ?? { key, label, commission: 0 };
      cur.commission += commissionOf(venda);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({ month: r.label, commission: r.commission }));
  }, [filteredSales]);

  const consultantChartData = useMemo(
    () =>
      ranking
        .slice(0, 8)
        .map((row) => ({ name: row.consultant, commission: row.commission })),
    [ranking],
  );

  // Detalhamento por venda (fechamento): cada aprovada com sua data.
  const detailRows = useMemo(
    () =>
      [...filteredSales]
        .sort(
          (a, b) =>
            (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0),
        )
        .map((venda) => ({
          ...venda,
          commission: commissionOf(venda),
        })),
    [filteredSales],
  );

  const isCustomIncomplete =
    datePreset === "custom" && (!customStartDate || !customEndDate);

  const kpis = [
    {
      title: "Total em comissões",
      value: currency.format(totalCommission),
      hint: `${integer.format(approvedCount)} venda(s) aprovada(s)`,
    },
    {
      title: "Valor aprovado (base)",
      value: currency.format(totalApprovedValue),
      hint: "Soma dos valores finais aprovados",
    },
    {
      title: "Vendas aprovadas",
      value: integer.format(approvedCount),
      hint: `${integer.format(approvedCount - venueCount)} orçamento(s) · ${integer.format(
        venueCount,
      )} locação(ões)`,
    },
    {
      title: "Consultores comissionados",
      value: integer.format(commissionedConsultants),
      hint: "Com ao menos 1 venda aprovada",
    },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Comissões</h1>
          <p className={styles.subtitle}>
            Acompanhe o comissionamento do time ·{" "}
            {(COMMISSION_RATE * 100).toLocaleString("pt-BR")}% sobre orçamento
            aprovado e {(VENUE_COMMISSION_RATE * 100).toLocaleString("pt-BR")}% sobre
            locação aprovada · recorte pela{" "}
            <strong>data de aprovação</strong>.
          </p>

          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel} htmlFor="commissions-period">
                Período
              </label>
              <select
                id="commissions-period"
                className={styles.filterControl}
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              >
                {DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel} htmlFor="commissions-start">
                Data inicial
              </label>
              <input
                id="commissions-start"
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
              <label className={styles.filterLabel} htmlFor="commissions-end">
                Data final
              </label>
              <input
                id="commissions-end"
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

            {sellerOptions.length > 0 && (
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="commissions-seller">
                  Consultor
                </label>
                <select
                  id="commissions-seller"
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

            {isCustomIncomplete && (
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
            onClick={() => navigate("/budgets")}
            leftIcon={<FileText size={16} />}
          >
            Ver Orçamentos
          </Button>
        </div>
      </header>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div key={kpi.title} className={styles.kpiCard}>
            <span className={styles.kpiLabel}>{kpi.title}</span>
            <span className={styles.kpiValue}>{kpi.value}</span>
            <span className={styles.kpiHint}>{kpi.hint}</span>
          </div>
        ))}
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Comissões por mês</div>
              <div className={styles.panelSubtitle}>
                Evolução do comissionamento no recorte filtrado
              </div>
            </div>
          </div>
          <div className={styles.panelBody}>
            {monthlyData.length === 0 ? (
              <p className={styles.subtitle}>Nenhuma comissão no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(v) => currency.format(Number(v) || 0)}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v) => currency.format(Number(v) || 0)}
                  />
                  <Bar dataKey="commission" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Comissão por consultor</div>
              <div className={styles.panelSubtitle}>Top consultores no período</div>
            </div>
          </div>
          <div className={styles.panelBody}>
            {consultantChartData.length === 0 ? (
              <p className={styles.subtitle}>Nenhuma comissão no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={consultantChartData}
                  layout="vertical"
                  margin={{ left: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={12}
                    tickFormatter={(v) => currency.format(Number(v) || 0)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={12}
                    width={130}
                  />
                  <Tooltip formatter={(v) => currency.format(Number(v) || 0)} />
                  <Bar dataKey="commission" fill="#6366f1" radius={[0, 6, 6, 0]}>
                    <LabelList
                      dataKey="commission"
                      position="right"
                      formatter={(v) => currency.format(Number(v) || 0)}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.spanTwo}`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIcon}>
              <Trophy size={18} />
            </div>
            <div>
              <div className={styles.panelTitle}>Ranking de consultores</div>
              <div className={styles.panelSubtitle}>
                Ordenado pela comissão acumulada no período
              </div>
            </div>
          </div>
          <div className={styles.panelBody}>
            {ranking.length === 0 ? (
              <p className={styles.subtitle}>
                {isLoading
                  ? "Carregando..."
                  : "Nenhum orçamento aprovado no recorte filtrado."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className={tableStyles.commissionTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th>Consultor</th>
                      <th style={{ textAlign: "right" }}>Aprovados</th>
                      <th style={{ textAlign: "right" }}>Valor aprovado</th>
                      <th style={{ textAlign: "right" }}>Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((row, index) => (
                      <tr key={row.consultant}>
                        <td>{index + 1}</td>
                        <td>{row.consultant}</td>
                        <td style={{ textAlign: "right" }}>
                          {integer.format(row.approvedCount)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {currency.format(row.approvedValue)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: "var(--color-primary)",
                          }}
                        >
                          {currency.format(row.commission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.spanTwo}`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIcon}>
              <FileText size={18} />
            </div>
            <div>
              <div className={styles.panelTitle}>Detalhamento por orçamento</div>
              <div className={styles.panelSubtitle}>
                Cada orçamento aprovado no período e sua data de aprovação
              </div>
            </div>
          </div>
          <div className={styles.panelBody}>
            {detailRows.length === 0 ? (
              <p className={styles.subtitle}>
                Nenhum orçamento aprovado no recorte filtrado.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className={tableStyles.commissionTable}>
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      <th>Venda</th>
                      <th>Origem</th>
                      <th style={{ textAlign: "right" }}>Valor</th>
                      <th>Data de aprovação</th>
                      <th style={{ textAlign: "right" }}>Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.consultant}</td>
                        <td>{row.label || "—"}</td>
                        <td>
                          {row.origin}{" "}
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            ({(row.rate * 100).toLocaleString("pt-BR")}%)
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {currency.format(row.value)}
                        </td>
                        <td>{formatDateBR(row.approvedAt)}</td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: "var(--color-primary)",
                          }}
                        >
                          {currency.format(row.commission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
