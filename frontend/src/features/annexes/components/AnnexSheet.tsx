import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CurrencyInput } from "../../../components/CurrencyInput/CurrencyInput";
import type { Budget } from "../../../store/budgetStore";
import type {
  BudgetPrintDocument,
  BudgetPrintEvent,
  BudgetPrintRow,
} from "../../budgets/print/budgetPrint";
import { isItemEditedByAnnex } from "../data/annexBudgetWriteBack";
import letterhead from "../../contracts/data/letterhead.svg";
import styles from "../styles/AnnexPage.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("pt-BR");

/* Folha A4 a 96dpi. Mesma abordagem do contrato: páginas reais de tamanho fixo,
   cada uma com o timbrado de fundo e o conteúdo dentro da área segura (abaixo
   do cabeçalho e acima do rodapé impressos no papel). */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const CONTENT_TOP = 150;
const CONTENT_BOTTOM = 110;
const CONTENT_HEIGHT = PAGE_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM;
/* Espaco entre tabelas — casa com o margin-bottom de `.eventTable`. */
const TABLE_GAP = 10;

export type AnnexRowValues = { quantity: number; unitPrice: number };
export type AnnexEditsMap = Record<string, AnnexRowValues>;

export const annexEditKey = (eventId: string, itemId: string) =>
  eventId + "|" + itemId;

/** Linha da tabela do evento: item do orçamento ou linha de totais. */
type AnnexTableRow =
  | { kind: "print"; row: BudgetPrintRow }
  | { kind: "total"; label: string; value: string };

/** Pedaço de conteúdo colocado em uma página. */
type PageBlock =
  | { kind: "docHeader" }
  | { kind: "chunk"; eventIndex: number; from: number; to: number; first: boolean }
  | { kind: "summary" }
  | { kind: "signatures" };

function buildEventRows(
  event: BudgetPrintEvent,
  courtesy: boolean,
): AnnexTableRow[] {
  const administration = Math.max(event.finalTotal - event.subtotal, 0);
  const rows: AnnexTableRow[] = event.rows.map((row) => ({
    kind: "print" as const,
    row,
  }));

  // Evento cortesia nao entra em nenhuma conta: so o rodape dizendo que e
  // cortesia e a quantidade de formandos.
  if (courtesy) {
    rows.push({ kind: "total", label: "Total do evento", value: "Cortesia" });
    rows.push({
      kind: "total",
      label: "Quantidade de formandos",
      value: integer.format(event.participants),
    });
    return rows;
  }

  if (administration > 0) {
    rows.push({
      kind: "total",
      label: "Administração",
      value: currency.format(administration),
    });
  }
  rows.push({
    kind: "total",
    label: "Sub total",
    value: currency.format(event.subtotal),
  });
  rows.push({
    kind: "total",
    label: "Total geral",
    value: currency.format(event.finalTotal),
  });
  rows.push({
    kind: "total",
    label: "Quantidade de formandos",
    value: integer.format(event.participants),
  });
  rows.push({
    kind: "total",
    label: "Valor por formando",
    value: currency.format(event.valuePerStudent),
  });

  return rows;
}

type AnnexSheetProps = {
  budget: Budget;
  printDoc: BudgetPrintDocument;
  signatureNames: string[];
  view: "TEAM" | "CLIENT";
  /** Ids dos eventos que entram como cortesia (adicionados so no anexo). */
  courtesyEventIds?: string[];
  edits?: AnnexEditsMap;
  /** Sem callback a folha fica somente leitura (usada no modal de visualizar). */
  onEditChange?: (
    eventId: string,
    itemId: string,
    patch: Partial<AnnexRowValues>,
    fallback: AnnexRowValues,
  ) => void;
  onOpenChanges?: (eventId: string, itemId: string) => void;
};

export function AnnexSheet({
  budget,
  printDoc,
  signatureNames,
  view,
  courtesyEventIds = [],
  edits = {},
  onEditChange,
  onOpenChanges,
}: AnnexSheetProps) {
  const editable = Boolean(onEditChange);
  const measureRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // A paginacao e guardada junto com a lista de eventos que a gerou. Sem isso,
  // ao ligar/desligar um evento cortesia o render seguinte usava as paginas
  // antigas contra a lista nova e estourava em `events[block.eventIndex]`.
  const [layout, setLayout] = useState<{
    source: BudgetPrintEvent[];
    pages: PageBlock[][];
  } | null>(null);

  const events = printDoc.events;
  const courtesySet = useMemo(
    () => new Set(courtesyEventIds),
    [courtesyEventIds],
  );
  const eventRows = useMemo(
    () => events.map((event) => buildEventRows(event, courtesySet.has(event.eventId))),
    [events, courtesySet],
  );

  const docHeader = (
    <div className={styles.docHeader}>
      <h2 className={styles.docTitle}>ANEXO CONTRATUAL</h2>
      <div className={styles.docMeta}>
        <span>
          <strong>Instituição:</strong> {budget.instituicao}
        </span>
        <span>
          <strong>Curso:</strong> {budget.curso}
        </span>
        {budget.comissao ? (
          <span>
            <strong>Comissão:</strong> {budget.comissao}
          </span>
        ) : null}
        {budget.telefone ? (
          <span>
            <strong>Contato:</strong> {budget.telefone}
          </span>
        ) : null}
      </div>
    </div>
  );

  // Mesmo fechamento da impressão do orçamento: o anexo repete as condições de
  // pagamento para o contratante conferir sem precisar do orçamento ao lado.
  const summaryBlock = (
    <>
      {/* Com baile no orçamento são dois quadros: até a colação e o acumulado
          até o baile, com as mesmas parcelas. */}
      {printDoc.summaryBlocks.map((block) => (
        <table key={block.key} className={styles.eventTable}>
          <thead>
            <tr>
              <th colSpan={2} className={styles.eventTitle}>
                Resumo Final · Condições de Pagamento
              </th>
            </tr>
          </thead>
          <tbody>
            {block.caption ? (
              <tr>
                <td colSpan={2} className={styles.summaryCaption}>
                  {block.caption}
                </td>
              </tr>
            ) : null}
            <tr className={styles.totalRow}>
              <td>{block.totalLabel}</td>
              <td className={styles.num}>
                {currency.format(block.totalPerStudent)}
              </td>
            </tr>
            <tr>
              <td>Quantidade de parcelas</td>
              <td className={styles.num}>
                {integer.format(printDoc.installments)}
              </td>
            </tr>
            <tr>
              <td>Valor da parcela por formando</td>
              <td className={styles.num}>
                {currency.format(block.installmentPerStudent)}
              </td>
            </tr>
            <tr className={styles.totalRow}>
              <td>Valor da parcela com 10% de desconto</td>
              <td className={styles.num}>
                {currency.format(block.discountedInstallmentPerStudent)}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  );

  const signaturesBlock = (
    /* Data e assinaturas são preenchidas à mão no papel: aqui só saem as linhas
       em branco. O que é editável é quantas linhas existem. */
    <div className={styles.signatures}>
      <div className={styles.signatureDateRow}>
        <span>DATA: ____/____/______</span>
      </div>

      <div style={{ fontWeight: 700, marginBottom: "10px" }}>
        DE ACORDO ASSINO:
      </div>

      {signatureNames.map((_name, index) => (
        <div key={index} className={styles.signatureLine}>
          <div className={styles.signatureRule} />
          <div className={styles.signatureLabel}>NOME</div>
        </div>
      ))}
    </div>
  );

  const renderTableHead = (event: BudgetPrintEvent) => (
    <thead>
      <tr>
        <th colSpan={4} className={styles.eventTitle}>
          {event.title}
        </th>
      </tr>
      <tr>
        <th className={styles.colHead}>DESCRITIVO</th>
        <th className={styles.colHead + " " + styles.qty}>QUANT.</th>
        <th className={styles.colHead + " " + styles.num}>PR. UNIT.</th>
        <th className={styles.colHead + " " + styles.num}>PREÇO TOTAL</th>
      </tr>
    </thead>
  );

  const renderRow = (
    event: BudgetPrintEvent,
    entry: AnnexTableRow,
    key: number,
  ) => {
    if (entry.kind === "total") {
      return (
        <tr key={key} className={styles.totalRow}>
          <td colSpan={3}>{entry.label}</td>
          <td className={styles.num}>{entry.value}</td>
        </tr>
      );
    }

    const row = entry.row;
    if (row.kind === "header") {
      return (
        <tr key={key} className={styles.sectionRow}>
          <td colSpan={4}>{row.label}</td>
        </tr>
      );
    }

    const itemId = row.itemId;
    const fallback: AnnexRowValues = {
      quantity: row.quantityValue ?? 0,
      unitPrice: row.unitPriceValue ?? 0,
    };
    const values = itemId
      ? (edits[annexEditKey(event.eventId, itemId)] ?? fallback)
      : fallback;
    const rowTotal = values.quantity * values.unitPrice;
    // Cliente só vê o valor dos itens marcados "valor aparece para o cliente";
    // a equipe vê todos.
    const showItemValue = view === "TEAM" || row.clientVisibleValue;
    const edited = Boolean(
      itemId &&
        (edits[annexEditKey(event.eventId, itemId)] ||
          isItemEditedByAnnex(budget, event.eventId, itemId)),
    );

    return (
      <tr key={key}>
        <td>
          {row.label}
          {edited ? (
            onOpenChanges && itemId ? (
              <button
                type="button"
                className={styles.editedTag + " " + styles.editedTagButton}
                title="Ver o que mudou neste item"
                onClick={() => onOpenChanges(event.eventId, itemId)}
              >
                alterado
              </button>
            ) : (
              <span className={styles.editedTag}>alterado</span>
            )
          ) : null}
          {row.subitemsText ? (
            <div className={styles.subitems}>{row.subitemsText}</div>
          ) : null}
        </td>
        <td className={styles.qty}>
          {editable && itemId ? (
            <input
              className={styles.cellInput}
              type="number"
              min={0}
              value={values.quantity}
              onChange={(e) =>
                onEditChange?.(
                  event.eventId,
                  itemId,
                  { quantity: Number(e.target.value) || 0 },
                  fallback,
                )
              }
              style={{ textAlign: "center" }}
            />
          ) : itemId ? (
            integer.format(values.quantity)
          ) : (
            row.quantityLabel
          )}
        </td>
        <td className={styles.num}>
          {!showItemValue ? (
            "-"
          ) : editable && itemId ? (
            <CurrencyInput
              className={styles.cellInput}
              value={values.unitPrice}
              onChange={(next) =>
                onEditChange?.(event.eventId, itemId, { unitPrice: next }, fallback)
              }
            />
          ) : itemId ? (
            currency.format(values.unitPrice)
          ) : (
            row.unitPriceLabel
          )}
        </td>
        <td className={styles.num}>
          {!showItemValue
            ? "-"
            : itemId
              ? currency.format(rowTotal)
              : row.finalTotalLabel}
        </td>
      </tr>
    );
  };

  // Mede cada linha e quebra o documento em folhas A4 de verdade. Sem isso o
  // conteúdo corria solto e passava por cima do cabeçalho do papel timbrado.
  useLayoutEffect(() => {
    const container = measureRef.current;
    if (!container) return;

    const headerEl = container.querySelector<HTMLElement>('[data-measure="header"]');
    const signaturesEl = container.querySelector<HTMLElement>(
      '[data-measure="signatures"]',
    );
    const summaryEl = container.querySelector<HTMLElement>(
      '[data-measure="summary"]',
    );
    const headerHeight = headerEl?.offsetHeight ?? 0;
    const signaturesHeight = signaturesEl?.offsetHeight ?? 0;
    const summaryHeight = (summaryEl?.offsetHeight ?? 0) + TABLE_GAP;

    const theadHeights: number[] = [];
    const rowHeights: number[][] = [];
    events.forEach((_event, eventIndex) => {
      const table = container.querySelector<HTMLTableElement>(
        `[data-measure-event="${eventIndex}"]`,
      );
      theadHeights[eventIndex] = table?.tHead?.offsetHeight ?? 0;
      rowHeights[eventIndex] = Array.from(
        table?.tBodies[0]?.rows ?? [],
      ).map((tr) => tr.offsetHeight);
    });

    const acc: PageBlock[][] = [];
    let current: PageBlock[] = [];
    let used = 0;

    const flush = () => {
      if (current.length) acc.push(current);
      current = [];
      used = 0;
    };

    current.push({ kind: "docHeader" });
    used += headerHeight;

    events.forEach((_event, eventIndex) => {
      const theadHeight = theadHeights[eventIndex] ?? 0;
      const heights = rowHeights[eventIndex] ?? [];
      let openFrom: number | null = null;
      let firstChunk = true;

      const closeChunk = (to: number) => {
        if (openFrom === null) return;
        current.push({
          kind: "chunk",
          eventIndex,
          from: openFrom,
          to,
          first: firstChunk,
        });
        firstChunk = false;
        openFrom = null;
      };

      heights.forEach((height, rowIndex) => {
        const needsHead = openFrom === null;
        const extra = needsHead ? theadHeight : 0;
        if (used + extra + height > CONTENT_HEIGHT && (current.length > 0 || openFrom !== null)) {
          closeChunk(rowIndex - 1);
          flush();
        }
        if (openFrom === null) {
          openFrom = rowIndex;
          used += theadHeight;
        }
        used += height;
      });

      closeChunk(heights.length - 1);
      used += TABLE_GAP;
    });

    if (used + summaryHeight > CONTENT_HEIGHT && current.length) flush();
    current.push({ kind: "summary" });
    used += summaryHeight;

    if (used + signaturesHeight > CONTENT_HEIGHT && current.length) flush();
    current.push({ kind: "signatures" });
    flush();

    setLayout({ source: events, pages: acc });
  }, [events, eventRows, view, signatureNames.length, editable]);

  // No celular a folha (794px) e mais larga que a area util. Em vez de obrigar
  // a arrastar, encolhe proporcionalmente ate caber. `zoom` reflui o layout, e
  // a medicao da paginacao acontece fora daqui, em tamanho real — entao o corte
  // das folhas nao muda com o zoom.
  const [pageZoom, setPageZoom] = useState(1);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = () => {
      const available = viewport.clientWidth;
      if (!available) return;
      setPageZoom(Math.min(1, available / PAGE_WIDTH));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // So renderiza a paginacao que corresponde aos eventos atuais.
  const pagesToRender = layout?.source === events ? layout.pages : [];

  const renderBlock = (block: PageBlock, key: number) => {
    if (block.kind === "docHeader") return <div key={key}>{docHeader}</div>;
    if (block.kind === "summary") return <div key={key}>{summaryBlock}</div>;
    if (block.kind === "signatures") return <div key={key}>{signaturesBlock}</div>;

    const event = events[block.eventIndex];
    if (!event) return null;
    const rows = eventRows[block.eventIndex] ?? [];
    return (
      <table
        key={key}
        // A âncora do índice lateral fica no primeiro pedaço do evento.
        id={block.first ? `annex-event-${event.eventId}` : undefined}
        className={styles.eventTable}
      >
        {renderTableHead(event)}
        <tbody>
          {rows
            .slice(block.from, block.to + 1)
            .map((entry, index) => renderRow(event, entry, block.from + index))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      {/* Container escondido usado só para medir as alturas reais. */}
      <div ref={measureRef} className={styles.measure} aria-hidden>
        <div data-measure="header">{docHeader}</div>
        {events.map((event, eventIndex) => (
          <table
            key={event.eventId}
            data-measure-event={eventIndex}
            className={styles.eventTable}
          >
            {renderTableHead(event)}
            <tbody>
              {(eventRows[eventIndex] ?? []).map((entry, index) =>
                renderRow(event, entry, index),
              )}
            </tbody>
          </table>
        ))}
        <div data-measure="summary">{summaryBlock}</div>
        <div data-measure="signatures">{signaturesBlock}</div>
      </div>

      <div ref={viewportRef} className={styles.pagesViewport}>
      <div
        className={styles.pages}
        style={{ "--annex-zoom": pageZoom } as CSSProperties}
      >
        {pagesToRender.map((blocks, pageIndex) => (
          <div
            key={pageIndex}
            className={styles.a4Page}
            style={{ backgroundImage: `url(${letterhead})` }}
          >
            <div className={styles.a4Content}>
              {blocks.map((block, index) => renderBlock(block, index))}
            </div>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
