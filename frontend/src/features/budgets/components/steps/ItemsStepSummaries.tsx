import React from "react";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import itemsStyles from "./ItemsStep.module.css";

type EventTotalSummaryProps = {
  total: number;
  participationQty: number;
  costPerStudent: number;
  totalLabel?: string;
  valorEvento?: number;
  subTotal?: number;
  administracao?: number;
};

type CourtesyTotalRowProps = {
  total: number;
};

type SummaryMoneyRowProps = {
  label: React.ReactNode;
  value: number;
  rowClassName?: string;
};

type BudgetItemGridRowProps = {
  name: React.ReactNode;
  price: React.ReactNode;
  qty: React.ReactNode;
  discount: React.ReactNode;
  total: React.ReactNode;
  onRemove: () => void;
  rowStyle?: React.CSSProperties;
  subItemsText?: string;
};

type SummaryDetailRowProps = {
  label: React.ReactNode;
  value: number;
};

type DescerramentoSummaryProps = {
  replicaQty: number;
  replicaPrice: number;
  replicaTotal: number;
  coffeeQty: number;
  coffeePrice: number;
  coffeeTotal: number;
  valorFixo: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isReplicaActive: boolean;
  isCoffeeActive: boolean;
};

type AulaSaudadeSummaryProps = {
  buffetTotal: number;
  drinksQty: number;
  drinksPrice: number;
  drinksTotal: number;
  atracaoPrice: number;
  atracaoLabel?: string;
  valorFixo: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isBuffetActive: boolean;
  isDrinksActive: boolean;
  isAtracaoActive: boolean;
};

type MissaSummaryProps = {
  missalQty: number;
  missalPrice: number;
  sacraPrice: number;
  taxaPrice: number;
  valorFixo: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isMissalActive: boolean;
  isSacraActive: boolean;
  isTaxaActive: boolean;
};

type EnsaioSummaryProps = {
  becaQty: number;
  becaPrice: number;
  coffeeQty: number;
  coffeePrice: number;
  valorFixo: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isBecaActive: boolean;
  isCoffeeActive: boolean;
};

type ColacaoSummaryProps = {
  itensDescerramento: number;
  becasQty: number;
  becasPrice: number;
  canudosQty: number;
  canudosPrice: number;
  auditorio: number;
  painelQty: number;
  painelPrice: number;
  arquiQty: number;
  arquiPrice: number;
  valorEvento: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isItensDescerramentoActive: boolean;
  isBecasActive: boolean;
  isCanudosActive: boolean;
  isAuditorioActive: boolean;
  isPainelActive: boolean;
  isArquibancadaActive: boolean;
};

type CerimoniaSummaryProps = {
  becasQty: number;
  becasPrice: number;
  canudosQty: number;
  canudosPrice: number;
  auditorio: number;
  arquiQty: number;
  arquiPrice: number;
  placaQty: number;
  placaPrice: number;
  valorEvento: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isBecasActive: boolean;
  isCanudosActive: boolean;
  isAuditorioActive: boolean;
  isArquibancadaActive: boolean;
  isPlacaActive: boolean;
};

type Festa50SummaryProps = {
  buffetQty: number;
  buffetPrice: number;
  openbarQty: number;
  openbarPrice: number;
  atracaoPrice: number;
  atracaoLabel?: string;
  drinksQty: number;
  drinksPrice: number;
  camisaQty: number;
  camisaPrice: number;
  valorEvento: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isBuffetActive: boolean;
  isOpenbarActive: boolean;
  isAtracaoActive: boolean;
  isDrinksActive: boolean;
  isCamisaActive: boolean;
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function EventTotalSummary({
  total,
  participationQty,
  costPerStudent,
  totalLabel = "Total do Evento",
  valorEvento,
  subTotal,
  administracao,
}: EventTotalSummaryProps) {
  return (
    <>
      {valorEvento !== undefined && (
        <SummaryMoneyRow label="Valor do Evento (Fixo)" value={valorEvento} />
      )}
      {subTotal !== undefined && (
        <SummaryMoneyRow
          label="Sub Total"
          value={subTotal}
          rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
        />
      )}
      {administracao !== undefined && (
        <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      )}
      <div
        className={clsx(
          itemsStyles.summaryRow,
          itemsStyles.totalRow,
        )}
      >
        <span>{totalLabel}</span>
        <span>{formatCurrency(total)}</span>
      </div>
      {participationQty > 0 && (
        <div className={itemsStyles.costPerStudent}>
          <span>Custo por Formando ({participationQty})</span>
          <span>{formatCurrency(costPerStudent)}</span>
        </div>
      )}
    </>
  );
}

export function CourtesyTotalRow({ total }: CourtesyTotalRowProps) {
  return (
    <div
      className={itemsStyles.summaryRow}
      style={{ color: "#d9534f" }}
    >
      <span>Total (Cortesia - Não soma ao geral)</span>
      <span>{formatCurrency(total)}</span>
    </div>
  );
}


export function SummaryMoneyRow({
  label,
  value,
  rowClassName,
}: SummaryMoneyRowProps) {
  return (
    <div className={rowClassName ?? itemsStyles.summaryRow}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

export function SummaryDetailRow({ label, value }: SummaryDetailRowProps) {
  return (
    <div className={itemsStyles.summaryRow}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

export function BudgetItemGridRow({
  name,
  price,
  qty,
  discount,
  total,
  onRemove,
  rowStyle,
  subItemsText,
}: BudgetItemGridRowProps) {
  return (
    <div
      className={clsx(itemsStyles.row, subItemsText && itemsStyles.rowWithSubitems)}
      style={rowStyle}
    >
      <div className={itemsStyles.rowMain}>
        <div
          className={itemsStyles.colName}
          style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}
        >
          <Trash2
            size={14}
            style={{ cursor: "pointer", color: "#ef4444", flexShrink: 0, marginTop: "2px" }}
            onClick={onRemove}
          />
          {name}
        </div>
        <div className={itemsStyles.colPrice}>{price}</div>
        <div className={itemsStyles.colQty}>{qty}</div>
        <div className={itemsStyles.colDiscount}>{discount}</div>
        <div className={itemsStyles.colTotal}>{total}</div>
      </div>
      {subItemsText && (
        <div className={itemsStyles.subitemsRow}>
          <div className={itemsStyles.subitemsText}>{subItemsText}</div>
        </div>
      )}
    </div>
  );
}

export function DescerramentoSummary({
  replicaQty,
  replicaPrice,
  replicaTotal,
  coffeeQty,
  coffeePrice,
  coffeeTotal,
  valorFixo,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isReplicaActive,
  isCoffeeActive,
}: DescerramentoSummaryProps) {
  return (
    <>
      {isReplicaActive && (
        <div className={itemsStyles.summaryRow}>
          <span>Réplica da Placa 15x20 ({replicaQty} un x {formatCurrency(replicaPrice)})</span>
          <span>{formatCurrency(replicaTotal)}</span>
        </div>
      )}
      {isCoffeeActive && (
        <div className={itemsStyles.summaryRow}>
          <span>Coffee Break para Formandos ({coffeeQty} un x {formatCurrency(coffeePrice)})</span>
          <span>{formatCurrency(coffeeTotal)}</span>
        </div>
      )}
      <SummaryMoneyRow label="Valor do Evento (Fixo)" value={valorFixo} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}
export function AulaSaudadeSummary({
  buffetTotal,
  drinksQty,
  drinksPrice,
  drinksTotal,
  atracaoPrice,
  atracaoLabel = "Atração Musical (DJ)",
  valorFixo,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isBuffetActive,
  isDrinksActive,
  isAtracaoActive,
}: AulaSaudadeSummaryProps) {
  return (
    <>
      {isBuffetActive && (
        <SummaryMoneyRow
          label="Buffet (Serviços de Buffet + Bebidas)"
          value={buffetTotal}
        />
      )}
      {isDrinksActive && (
        <div className={itemsStyles.summaryRow}>
          <span>Drinks ({drinksQty} un x {formatCurrency(drinksPrice)})</span>
          <span>{formatCurrency(drinksTotal)}</span>
        </div>
      )}
      {isAtracaoActive && (
        <SummaryMoneyRow label={atracaoLabel} value={atracaoPrice} />
      )}
      <SummaryMoneyRow label="Evento (Fixo)" value={valorFixo} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}
export function MissaSummary({
  missalQty,
  missalPrice,
  sacraPrice,
  taxaPrice,
  valorFixo,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isMissalActive,
  isSacraActive,
  isTaxaActive,
}: MissaSummaryProps) {
  return (
    <>
      {isMissalActive && (
        <SummaryDetailRow
          label={<>Livro Missal ({missalQty} un x {formatCurrency(missalPrice)})</>}
          value={missalQty * missalPrice}
        />
      )}
      {isSacraActive && <SummaryMoneyRow label="Música Sacra Verba" value={sacraPrice} />}
      {isTaxaActive && <SummaryMoneyRow label="Taxa da Igreja - Verba" value={taxaPrice} />}
      <SummaryMoneyRow label="Evento (Fixo)" value={valorFixo} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}
export function EnsaioSummary({
  becaQty,
  becaPrice,
  coffeeQty,
  coffeePrice,
  valorFixo,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isBecaActive,
  isCoffeeActive,
}: EnsaioSummaryProps) {
  return (
    <>
      {isBecaActive && (
        <SummaryDetailRow
          label={<>Beca de Formatura ({becaQty} un x {formatCurrency(becaPrice)})</>}
          value={becaQty * becaPrice}
        />
      )}
      {isCoffeeActive && (
        <SummaryDetailRow
          label={<>Coffee Break para Formandos ({coffeeQty} un x {formatCurrency(coffeePrice)})</>}
          value={coffeeQty * coffeePrice}
        />
      )}
      <SummaryMoneyRow label="Valor do Orçamento (Fixo)" value={valorFixo} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}

export function ColacaoSummary({
  itensDescerramento,
  becasQty,
  becasPrice,
  canudosQty,
  canudosPrice,
  auditorio,
  painelQty,
  painelPrice,
  arquiQty,
  arquiPrice,
  valorEvento,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isItensDescerramentoActive,
  isBecasActive,
  isCanudosActive,
  isAuditorioActive,
  isPainelActive,
  isArquibancadaActive,
}: ColacaoSummaryProps) {
  return (
    <>
      {isItensDescerramentoActive && (
        <SummaryMoneyRow
          label="Itens do Descerramento (Recepcionista, Placa e Réplicas)"
          value={itensDescerramento}
        />
      )}
      {isBecasActive && (
        <SummaryDetailRow
          label={<>Becas de Luxo ({becasQty} un x {formatCurrency(becasPrice)})</>}
          value={becasQty * becasPrice}
        />
      )}
      {isCanudosActive && (
        <SummaryDetailRow
          label={<>Canudos ({canudosQty} un x {formatCurrency(canudosPrice)})</>}
          value={canudosQty * canudosPrice}
        />
      )}
      {isAuditorioActive && <SummaryMoneyRow label="Locação do Auditório" value={auditorio} />}
      {isPainelActive && (
        <SummaryDetailRow
          label={<>Painel de LED ({painelQty} un x {formatCurrency(painelPrice)})</>}
          value={painelQty * painelPrice}
        />
      )}
      {isArquibancadaActive && (
        <SummaryDetailRow
          label={<>Arquibancada ({arquiQty} un x {formatCurrency(arquiPrice)})</>}
          value={arquiQty * arquiPrice}
        />
      )}
      <SummaryMoneyRow label="Valor do Evento" value={valorEvento} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}

export function CerimoniaSummary({
  becasQty,
  becasPrice,
  canudosQty,
  canudosPrice,
  auditorio,
  arquiQty,
  arquiPrice,
  placaQty,
  placaPrice,
  valorEvento,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isBecasActive,
  isCanudosActive,
  isAuditorioActive,
  isArquibancadaActive,
  isPlacaActive,
}: CerimoniaSummaryProps) {
  return (
    <>
      {isBecasActive && (
        <SummaryDetailRow
          label={<>Becas de Luxo ({becasQty} un x {formatCurrency(becasPrice)})</>}
          value={becasQty * becasPrice}
        />
      )}
      {isCanudosActive && (
        <SummaryDetailRow
          label={<>Canudos ({canudosQty} un x {formatCurrency(canudosPrice)})</>}
          value={canudosQty * canudosPrice}
        />
      )}
      {isAuditorioActive && <SummaryMoneyRow label="Locação do Auditório" value={auditorio} />}
      {isArquibancadaActive && (
        <SummaryDetailRow
          label={<>Arquibancada ({arquiQty} un x {formatCurrency(arquiPrice)})</>}
          value={arquiQty * arquiPrice}
        />
      )}
      {isPlacaActive && (
        <SummaryDetailRow
          label={<>Placa de LED ({placaQty} un x {formatCurrency(placaPrice)})</>}
          value={placaQty * placaPrice}
        />
      )}
      <SummaryMoneyRow label="Valor do Evento" value={valorEvento} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}

type Ensaio50SummaryProps = {
  coffeeQty: number;
  coffeePrice: number;
  valorOrcamento: number;
  subTotal: number;
  administracao: number;
  total: number;
  participationQty: number;
  costPerStudent: number;
  isCoffeeActive: boolean;
};

export function Ensaio50Summary({
  coffeeQty,
  coffeePrice,
  valorOrcamento,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isCoffeeActive,
}: Ensaio50SummaryProps) {
  return (
    <>
      {isCoffeeActive && (
        <SummaryDetailRow
          label={<>Coffee Break para Formandos ({coffeeQty} un x {formatCurrency(coffeePrice)})</>}
          value={coffeeQty * coffeePrice}
        />
      )}
      <SummaryMoneyRow label="Valor do Orçamento (Fixo)" value={valorOrcamento} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}

export function Festa50Summary({
  buffetQty,
  buffetPrice,
  openbarQty,
  openbarPrice,
  atracaoPrice,
  atracaoLabel = "Atração Musical (DJ)",
  drinksQty,
  drinksPrice,
  camisaQty,
  camisaPrice,
  valorEvento,
  subTotal,
  administracao,
  total,
  participationQty,
  costPerStudent,
  isBuffetActive,
  isOpenbarActive,
  isAtracaoActive,
  isDrinksActive,
  isCamisaActive,
}: Festa50SummaryProps) {
  return (
    <>
      {isBuffetActive && (
        <SummaryDetailRow
          label={<>Serviços de Buffet ({buffetQty} un x {formatCurrency(buffetPrice)})</>}
          value={buffetQty * buffetPrice}
        />
      )}
      {isOpenbarActive && (
        <SummaryDetailRow
          label={<>Bebidas Open Bar ({openbarQty} un x {formatCurrency(openbarPrice)})</>}
          value={openbarQty * openbarPrice}
        />
      )}
      {isAtracaoActive && <SummaryMoneyRow label={atracaoLabel} value={atracaoPrice} />}
      {isDrinksActive && (
        <SummaryDetailRow
          label={<>Drinks ({drinksQty} un x {formatCurrency(drinksPrice)})</>}
          value={drinksQty * drinksPrice}
        />
      )}
      {isCamisaActive && (
        <SummaryDetailRow
          label={<>Verba para Camisa ({camisaQty} un x {formatCurrency(camisaPrice)})</>}
          value={camisaQty * camisaPrice}
        />
      )}
      <SummaryMoneyRow label="Valor do Evento (Fixo)" value={valorEvento} />
      <SummaryMoneyRow
        label="Sub Total"
        value={subTotal}
        rowClassName={clsx(itemsStyles.summaryRow, itemsStyles.subTotalRow)}
      />
      <SummaryMoneyRow label="Administração (10%)" value={administracao} />
      <EventTotalSummary
        total={total}
        participationQty={participationQty}
        costPerStudent={costPerStudent}
      />
    </>
  );
}
