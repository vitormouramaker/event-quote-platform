/**
 * Proposta comercial de locação do espaço de eventos, em 4 páginas A4.
 *
 * O texto institucional (infraestrutura, condições e condições gerais) é fixo:
 * é documento da casa, não campo de orçamento. O que varia são os dados do
 * cliente e a composição do investimento.
 */

import type {
  VenueEntrance,
  VenueProposalForm,
  VenueProposalTotals,
} from "../domain/venueProposal";
import { formatAppliedDiscount } from "../../budgets/domain/discountInput";
import timbradoMatriz from "../../../assets/print/letterhead.svg";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integer = new Intl.NumberFormat("pt-BR");

// Conteúdo fictício de demonstração: empresa, espaço, infraestrutura e
// condições abaixo foram inventados para este repositório.
const EMPRESA = {
  nome: "ORÇA EVENTOS (EMPRESA FICTÍCIA)",
  endereco: "Av. Exemplo, 1000 - Centro - São Paulo/SP",
  cnpj: "CNPJ 00.000.000/0001-00",
  espaco: "CENTRO DE EVENTOS AURORA HALL",
};

/** Infraestrutura em grade de 3 colunas, na mesma ordem do documento. */
const INFRAESTRUTURA: string[][] = [
  ["Salão principal climatizado", "Acessibilidade", "Ar-condicionado central"],
  ["Tratamento acústico", "Sistema contra incêndio", "Camarins"],
  ["Palco", "Banheiros e áreas de apoio", "Monitoramento por câmeras"],
  ["Praça de alimentação", "Cozinha de apoio", "Estacionamento"],
];

const CONDICOES_GERAIS: [string, string][] = [
  ["Aviso", "Conteúdo fictício de demonstração. As condições abaixo são exemplos e não têm valor contratual."],
  ["Climatização", "Inclusa nos dias de evento. Nos dias de montagem e desmontagem é cobrada à parte, pela diária da tabela de preços."],
  ["Limpeza", "Inclusa antes e depois do evento. Durante o evento fica a cargo do contratante."],
  ["Diárias adicionais", "Dias extras de montagem ou desmontagem seguem o percentual definido na tabela de preços."],
  ["Layout do evento", "O contratante envia o layout para aprovação antes da montagem."],
  ["Normas internas", "O contratante segue as normas internas do espaço. Danos às instalações são avaliados em vistoria."],
];

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-12-10" → "10/12/2026", sem passar por `new Date` (que puxa fuso). */
function formatDateBR(value?: string) {
  if (!value) return "____/____/______";
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return value;
  return `${dia}/${mes}/${ano}`;
}

function linhaEmBranco(value: string | number | null | undefined, fallback: string) {
  const texto = value === null || value === undefined ? "" : String(value).trim();
  return texto ? escapeHtml(texto) : fallback;
}

/**
 * O papel timbrado da empresa é quem assina a página — logo no topo e barra de
 * contato no rodapé. O conteúdo fica na área segura entre os dois.
 */
function paginaHeader(numero: number) {
  return `
    <div class="vp-sheet-mark" aria-hidden="true">
      <span>${EMPRESA.espaco} · PROPOSTA COMERCIAL</span>
      <span>Página ${numero} de 4</span>
    </div>
  `;
}

function paginaFooter() {
  return "";
}

function composicaoRows(totals: VenueProposalTotals) {
  return totals.lines
    .map(
      (line) => `
        <tr>
          <td>${escapeHtml(line.label)}${
            line.quantity > 1
              ? ` <span class="vp-qty">(${integer.format(line.quantity)}×)</span>`
              : ""
          }</td>
          <td>${escapeHtml(line.condition)}</td>
          <td class="vp-right">${currency.format(line.total)}</td>
        </tr>
      `,
    )
    .join("");
}

export function buildVenueProposalHtml(args: {
  form: VenueProposalForm;
  totals: VenueProposalTotals;
  /** As três entradas: a proposta mostra todas e marca a escolhida. */
  entrances: VenueEntrance[];
  proposalCode?: string;
  responsavel?: string;
}) {
  const { form, totals, entrances, proposalCode, responsavel } = args;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Proposta ${escapeHtml(proposalCode || "")} - ${escapeHtml(form.clientName)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, sans-serif;
    color: #1f2937;
    background: #e5e7eb;
    font-size: 12px;
  }
  .vp-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    margin: 0 auto 12px;
    /* Área segura do timbrado: abaixo da logo e acima da barra de contato. */
    padding: 44mm 18mm 26mm;
    background-color: #fff;
    background-image: url("${timbradoMatriz}");
    background-repeat: no-repeat;
    background-size: 100% 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .vp-sheet-mark {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    letter-spacing: 1.4px;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  h1 { font-size: 15px; margin: 0 0 4px; letter-spacing: 1px; }
  h2 {
    font-size: 11px;
    letter-spacing: 1.5px;
    color: #0f172a;
    margin: 16px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
  }
  p { line-height: 1.55; margin: 0 0 8px; }
  .vp-lead { color: #4b5563; }
  .vp-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 14px; }
  .vp-field-label { font-size: 8.5px; letter-spacing: 1px; color: #6b7280; margin-bottom: 2px; }
  .vp-field-value {
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid #9ca3af;
    padding-bottom: 3px;
    min-height: 18px;
  }
  .vp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .vp-card {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }
  .vp-card.is-chosen { border: 2px solid #0f172a; background: #f8fafc; }
  .vp-card-name { font-size: 10px; letter-spacing: 1px; color: #6b7280; }
  .vp-card-price { font-size: 16px; font-weight: 800; margin: 4px 0; }
  .vp-card-desc { font-size: 9px; color: #6b7280; }
  .vp-card-mark { margin-top: 6px; font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .vp-infra { border: 1px solid #d1d5db; font-size: 9.5px; }
  .vp-infra td {
    width: 33.33%;
    text-align: center;
    border: 1px solid #d1d5db;
    padding: 5px 7px;
    line-height: 1.35;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { font-size: 9px; letter-spacing: 1px; color: #6b7280; background: #f9fafb; }
  .vp-right { text-align: right; }
  .vp-qty { color: #6b7280; font-weight: 600; }
  .vp-total-row td { font-weight: 800; font-size: 13px; border-top: 2px solid #0f172a; }
  .vp-discount td { color: #b91c1c; }
  .vp-terms { font-size: 10.5px; line-height: 1.6; }
  .vp-terms li { margin-bottom: 7px; }
  .vp-sign { margin-top: 26px; text-align: center; }
  .vp-sign-line { width: 60%; margin: 26px auto 4px; border-top: 1px solid #9ca3af; }
  .vp-note { font-size: 9px; color: #6b7280; font-style: italic; margin-top: 10px; }
  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; }
    .vp-page { margin: 0; box-shadow: none; page-break-after: always; }
    .vp-page:last-child { page-break-after: auto; }
  }
</style>
</head>
<body>

  <section class="vp-page">
    ${paginaHeader(1)}
    <h1>PROPOSTA DE LOCAÇÃO</h1>
    <p class="vp-lead">${EMPRESA.espaco}${proposalCode ? ` · ${escapeHtml(proposalCode)}` : ""}</p>

    <div class="vp-fields">
      <div>
        <div class="vp-field-label">CLIENTE</div>
        <div class="vp-field-value">${linhaEmBranco(form.clientName, "&nbsp;")}</div>
      </div>
      <div>
        <div class="vp-field-label">TIPO DE EVENTO</div>
        <div class="vp-field-value">${linhaEmBranco(form.eventType, "&nbsp;")}</div>
      </div>
      <div>
        <div class="vp-field-label">NÚMERO DE CONVIDADOS</div>
        <div class="vp-field-value">${
          form.guests ? `${integer.format(form.guests)} pessoas` : "&nbsp;"
        }</div>
      </div>
      <div>
        <div class="vp-field-label">DATA DO EVENTO</div>
        <div class="vp-field-value">${
          form.eventEndDate && form.eventEndDate !== form.eventStartDate
            ? `${formatDateBR(form.eventStartDate)} a ${formatDateBR(form.eventEndDate)}`
            : formatDateBR(form.eventStartDate)
        }</div>
      </div>
      <div>
        <div class="vp-field-label">MONTAGEM / DESMONTAGEM</div>
        <div class="vp-field-value">${integer.format(form.setupDays)} dia(s) / ${integer.format(
          form.teardownDays,
        )} dia(s)</div>
      </div>
      <div>
        <div class="vp-field-label">HORÁRIO DO EVENTO</div>
        <div class="vp-field-value">${
          form.eventStartTime && form.eventEndTime
            ? `${escapeHtml(form.eventStartTime)} às ${escapeHtml(form.eventEndTime)}`
            : linhaEmBranco(form.eventStartTime, "&nbsp;")
        }</div>
      </div>
    </div>

    <h2>CONFIGURAÇÃO DE LOCAÇÃO</h2>
    <p class="vp-lead">
      O salão possui três acessos que permitem propostas comerciais distintas. O valor da
      locação varia conforme a entrada/setor escolhido para o evento.
    </p>
    <div class="vp-cards">
      ${entrances
        .map((entrance) => {
          const escolhida = entrance.id === form.entranceId;
          return `
            <div class="vp-card${escolhida ? " is-chosen" : ""}">
              <div class="vp-card-name">${escapeHtml(entrance.name.toUpperCase())}</div>
              <div class="vp-card-price">${currency.format(entrance.price)}</div>
              <div class="vp-card-desc">${escapeHtml(entrance.description)}</div>
              <div class="vp-card-mark">OPÇÃO: [${escolhida ? "X" : "&nbsp;&nbsp;"}]</div>
            </div>
          `;
        })
        .join("")}
    </div>

    <h2>INFRAESTRUTURA DISPONÍVEL</h2>
    <table class="vp-infra">
      <tbody>
        ${INFRAESTRUTURA.map(
          (linha) =>
            `<tr>${linha.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`,
        ).join("")}
      </tbody>
    </table>
    ${paginaFooter()}
  </section>

  <section class="vp-page">
    ${paginaHeader(2)}
    <h1>COMPOSIÇÃO DO INVESTIMENTO</h1>
    <p class="vp-lead">
      A proposta destaca a entrada escolhida e acrescenta somente os opcionais
      efetivamente contratados.
    </p>

    <table>
      <thead>
        <tr><th>ITEM</th><th>CONDIÇÃO</th><th class="vp-right">VALOR</th></tr>
      </thead>
      <tbody>
        ${composicaoRows(totals)}
        ${
          totals.discountValue > 0
            ? `
          <tr>
            <td>Subtotal</td>
            <td></td>
            <td class="vp-right">${currency.format(totals.subtotal)}</td>
          </tr>
          <tr class="vp-discount">
            <td>Desconto comercial (${escapeHtml(
              formatAppliedDiscount({
                discountMode: form.discountMode,
                discountPercent: form.discountMode === "PERCENT" ? form.discountValue : 0,
                discountAmount: form.discountMode === "FIXED" ? form.discountValue : 0,
              }),
            )})</td>
            <td></td>
            <td class="vp-right">- ${currency.format(totals.discountValue)}</td>
          </tr>`
            : ""
        }
        <tr class="vp-total-row">
          <td>VALOR TOTAL DA PROPOSTA</td>
          <td></td>
          <td class="vp-right">${currency.format(totals.total)}</td>
        </tr>
      </tbody>
    </table>

    ${
      form.observation.trim()
        ? `<h2>OBSERVAÇÕES</h2><p>${escapeHtml(form.observation)}</p>`
        : ""
    }
    ${paginaFooter()}
  </section>

  <section class="vp-page">
    ${paginaHeader(3)}
    <h1>CONDIÇÕES DA PROPOSTA</h1>
    <p class="vp-lead">Condições comerciais e operacionais essenciais.</p>

    <ol class="vp-terms">
      <li><strong>Condições de pagamento.</strong> A combinar.</li>
      <li>
        <strong>Validade.</strong> Proposta válida até ${formatDateBR(form.validUntil)}.
        A proposta não representa reserva da data.
      </li>
      <li>
        <strong>Normas internas.</strong> O locatário deverá cumprir as normas regimentais
        para montagem de estruturas, iluminação e demais intervenções no espaço.
      </li>
    </ol>

    <p>Agradecemos o contato e permanecemos à disposição para os alinhamentos da proposta.</p>

    <div class="vp-sign">
      <div class="vp-field-label">ATENDIMENTO</div>
      <div class="vp-sign-line"></div>
      <div>${linhaEmBranco(responsavel, "Responsável comercial")}</div>
    </div>
    ${paginaFooter()}
  </section>

  <section class="vp-page">
    ${paginaHeader(4)}
    <h1>CONDIÇÕES GERAIS</h1>
    <ol class="vp-terms">
      ${CONDICOES_GERAIS.map(
        ([titulo, texto]) =>
          `<li><strong>${escapeHtml(titulo)}:</strong> ${escapeHtml(texto)}</li>`,
      ).join("")}
    </ol>
    <p class="vp-note">
      Condições gerais incorporadas à proposta comercial, sujeitas à formalização contratual.
      Dados bancários pendentes de confirmação.
    </p>
    ${paginaFooter()}
  </section>

  <script>setTimeout(function(){ window.print(); }, 450);</script>
</body>
</html>`;
}

/** Abre a proposta numa aba nova, pronta para imprimir ou salvar em PDF. */
export function openVenueProposalPrint(args: Parameters<typeof buildVenueProposalHtml>[0]) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildVenueProposalHtml(args));
  popup.document.close();
  return true;
}
