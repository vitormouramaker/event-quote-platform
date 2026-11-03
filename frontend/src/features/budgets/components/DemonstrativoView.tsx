import { useEffect, useMemo, useState } from "react";
import type { BudgetPrintDocument } from "../print/budgetPrint";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const numberFmt = new Intl.NumberFormat("pt-BR");
const money = (v: number) => currency.format(v);
const yearOf = (s: string) => (/\d{4}/.exec(s || "") || [""])[0];

const STYLES = `
:root{
  --pg:#F4F1EA; --card:#FFFFFF; --cardbr:#EAE5D9;
  --tx1:#16161A; --tx2:#9A9A8E; --tx3:#2C2C30; --txd:#A0A094;
  --hair:#F0ECE0; --hair2:#F6F3EA;
  --chipbg:#FBF6E9; --chipbr:#EFE3C4; --chiptx:#A07E33;
  --secln:#EAE5D9; --dcln:#DCD6C8;
  --idxbr:#E2D6B6; --idxbg1:#FBF6E9; --idxbg2:#F3E9CC; --idxtx:#A07E33;
  --resbr:#EFEADF; --gold:#C5A158; --cream:#E6CF94; --dark:#0E0E10;
}
.dp-root[data-theme="dark"]{
  --pg:#0B0B0D; --card:#161619; --cardbr:#26262B;
  --tx1:#F1EEE7; --tx2:#8C8C82; --tx3:#D6D2CA; --txd:#83837A;
  --hair:#26262B; --hair2:#1F1F23;
  --chipbg:#241F13; --chipbr:#463A20; --chiptx:#E6CF94;
  --secln:#26262B; --dcln:#2A2A2E;
  --idxbr:#4A3E22; --idxbg1:#201B10; --idxbg2:#2A2312; --idxtx:#E6CF94;
  --resbr:#26262B;
}
.dp-root *{ box-sizing:border-box; }
.dp-root{ min-height:100vh; background:var(--pg); color:var(--tx1); font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-font-smoothing:antialiased; padding:40px 20px 90px; transition:background .3s,color .3s; }
.dp-theme-toggle{ position:fixed; top:16px; right:16px; z-index:60; width:44px; height:44px; border-radius:14px; border:1px solid var(--cardbr); background:var(--card); color:var(--chiptx); display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.08); font-size:18px; }
.dp-wrap{ max-width:940px; margin:0 auto; }
.dp-hero{ background:var(--dark); border:1px solid rgba(197,161,88,0.18); border-radius:22px; padding:36px 34px 30px; position:relative; overflow:hidden; }
.dp-hero-glow{ position:absolute; top:-120px; right:-90px; width:360px; height:360px; border-radius:50%; background:radial-gradient(circle, rgba(197,161,88,0.16), rgba(197,161,88,0) 70%); }
.dp-hero-inner{ position:relative; z-index:1; }
.dp-brand{ display:flex; align-items:center; gap:16px; }
.dp-brand-name{ font-size:22px; font-weight:800; letter-spacing:3px; color:#FAFAF7; line-height:1; }
.dp-brand-name span{ font-weight:400; color:var(--gold); margin-left:6px; }
.dp-brand-sub{ font-size:11px; letter-spacing:2px; color:#7A7A82; margin-top:7px; text-transform:uppercase; }
.dp-hero-rule{ height:1px; background:linear-gradient(90deg, rgba(197,161,88,0.55), rgba(197,161,88,0)); margin:32px 0 28px; }
.dp-hero-head{ display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:24px; }
.dp-eyebrow{ font-size:12px; letter-spacing:3px; color:var(--gold); text-transform:uppercase; font-weight:600; }
.dp-title{ font-weight:700; font-size:40px; line-height:1.06; color:#FAFAF7; margin:14px 0 0; letter-spacing:-1px; }
.dp-committee{ font-size:15px; color:#A6A6AE; margin-top:10px; }
.dp-code{ background:rgba(197,161,88,0.12); border:1px solid rgba(197,161,88,0.4); border-radius:999px; padding:10px 18px; display:flex; align-items:center; gap:9px; }
.dp-code-dot{ width:7px; height:7px; border-radius:50%; background:var(--gold); }
.dp-code-txt{ font-size:13px; letter-spacing:1.5px; color:var(--cream); font-weight:600; }
.dp-hero-chips{ display:flex; flex-wrap:wrap; gap:10px; margin-top:28px; }
.dp-hchip{ background:#1B1B1F; border:1px solid #2A2A30; border-radius:12px; padding:9px 15px; font-size:13px; color:#CFCFD6; }
.dp-hchip span{ color:#7A7A82; }
.dp-hchip strong{ color:#FAFAF7; font-weight:700; }
.dp-section{ background:var(--card); border:1px solid var(--cardbr); border-radius:18px; padding:26px 28px; margin-top:16px; transition:background .3s,border-color .3s; }
.dp-sec-eyebrow{ display:flex; align-items:center; gap:12px; margin-bottom:24px; }
.dp-sec-eyebrow > span:first-child{ font-size:11px; font-weight:700; letter-spacing:2px; color:var(--gold); text-transform:uppercase; }
.dp-sec-line{ flex:1; height:1px; background:var(--secln); }
.dp-dados-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:26px 36px; }
.dp-dado-lbl{ font-size:11px; letter-spacing:1px; color:var(--tx2); text-transform:uppercase; margin-bottom:7px; }
.dp-dado-val{ font-size:16px; font-weight:600; color:var(--tx1); }
.dp-invest{ background:linear-gradient(135deg,#15140F 0%,#221E14 100%); border:1px solid rgba(197,161,88,0.18); border-radius:18px; padding:28px 28px; margin-top:16px; position:relative; overflow:hidden; }
.dp-invest-glow{ position:absolute; inset:0; background:radial-gradient(circle at 85% 0%, rgba(197,161,88,0.14), transparent 55%); }
.dp-invest-grid{ position:relative; display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:32px; align-items:center; }
.dp-invest-lbl{ font-size:11px; letter-spacing:2px; color:var(--gold); text-transform:uppercase; font-weight:600; }
.dp-invest-val{ font-size:44px; font-weight:800; color:#FAFAF7; line-height:1; margin-top:14px; letter-spacing:-1.5px; }
.dp-invest-col{ border-left:1px solid rgba(255,255,255,0.1); padding-left:30px; }
.dp-invest-col-lbl{ font-size:11px; letter-spacing:1px; color:#8A8A78; text-transform:uppercase; }
.dp-invest-col-val{ font-size:24px; font-weight:700; color:var(--cream); margin-top:8px; letter-spacing:-0.5px; }
.dp-invest-col-val.white{ color:#FAFAF7; }
.dp-events-title-row{ display:flex; align-items:center; gap:14px; margin:38px 4px 16px; flex-wrap:wrap; }
.dp-events-title{ font-size:27px; font-weight:700; color:var(--tx1); margin:0; letter-spacing:-0.8px; }
.dp-events-title-line{ flex:1; height:1px; background:var(--dcln); min-width:20px; }
.dp-toggle-all{ display:inline-flex; align-items:center; gap:7px; background:var(--chipbg); border:1px solid var(--chipbr); color:var(--chiptx); font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; cursor:pointer; }
.dp-ev-card{ background:var(--card); border:1px solid var(--cardbr); border-radius:20px; margin-bottom:16px; overflow:hidden; position:relative; transition:background .3s,border-color .3s; }
.dp-ev-card.cortesia{ border-color:var(--gold); }
.dp-ev-card.cortesia::before{ content:""; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg,var(--gold),var(--cream)); z-index:2; }
.dp-ev-head{ display:flex; align-items:center; gap:18px; padding:20px 24px; cursor:pointer; position:relative; z-index:1; background:var(--dark); }
.dp-ev-idx{ flex-shrink:0; width:50px; height:50px; border-radius:14px; border:1px solid var(--idxbr); background:linear-gradient(135deg,var(--idxbg1),var(--idxbg2)); display:flex; align-items:center; justify-content:center; }
.dp-ev-idx span{ font-size:20px; font-weight:800; color:var(--idxtx); letter-spacing:-0.5px; }
.dp-ev-head-main{ flex:1; min-width:0; }
.dp-ev-name{ font-size:17px; font-weight:600; color:#FAFAF7; line-height:1.3; }
.dp-ev-chips{ margin-top:7px; }
.dp-ev-chip{ display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#F0EDE4; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.22); border-radius:999px; padding:3px 10px; }
.dp-ev-value-col{ text-align:right; flex-shrink:0; }
.dp-ev-value{ font-size:20px; font-weight:700; color:var(--tx1); letter-spacing:-0.5px; }
.dp-ev-value-sub{ font-size:12px; color:var(--tx2); margin-top:3px; }
.dp-badge-cortesia{ display:inline-block; background:#ECFDF3; border:1px solid #BBF0CE; color:#1F8A53; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:6px 14px; border-radius:999px; }
.dp-chevron{ flex-shrink:0; transition:transform .2s; }
.dp-chevron.open{ transform:rotate(180deg); }
.dp-ev-body{ border-top:1px solid var(--hair); padding:6px 24px 18px; animation:dpReveal .28s ease; }
@keyframes dpReveal{ from{ opacity:0; transform:translateY(-6px);} to{ opacity:1; transform:none;} }
.dp-items-head{ display:flex; justify-content:space-between; padding:14px 4px 10px; border-bottom:1px solid var(--hair); }
.dp-items-head span{ font-size:11px; letter-spacing:1.5px; color:var(--tx2); text-transform:uppercase; font-weight:600; }
.dp-item-section{ font-size:11px; letter-spacing:1.5px; color:var(--chiptx); text-transform:uppercase; font-weight:700; padding:14px 4px 6px; }
.dp-item-row{ display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:12px 4px; border-bottom:1px solid var(--hair2); }
.dp-item-name{ flex:1; font-size:14px; font-weight:500; color:var(--tx3); line-height:1.4; }
.dp-item-desc{ font-size:12px; color:var(--txd); line-height:1.5; margin-top:5px; }
.dp-item-right{ display:flex; align-items:center; gap:12px; flex-shrink:0; }
.dp-item-val{ font-size:13px; font-weight:600; color:var(--tx3); white-space:nowrap; }
.dp-item-qty{ flex-shrink:0; min-width:44px; text-align:center; background:var(--chipbg); border:1px solid var(--chipbr); border-radius:8px; padding:4px 10px; font-size:13px; font-weight:700; color:var(--chiptx); }
.dp-ev-summary{ margin-top:18px; border:1px solid rgba(197,161,88,0.18); border-radius:14px; overflow:hidden; background:linear-gradient(135deg,#15140F 0%,#221E14 100%); display:grid; grid-template-columns:1fr 1fr; }
.dp-sum-cell{ padding:16px 20px; border-right:1px solid rgba(255,255,255,0.09); }
.dp-sum-cell.last{ border-right:none; }
.dp-sum-lbl{ font-size:10.5px; letter-spacing:1px; text-transform:uppercase; font-weight:600; }
.dp-sum-lbl.gold{ color:var(--gold); }
.dp-sum-lbl.mut{ color:#8A8A78; }
.dp-sum-val{ font-size:19px; font-weight:700; color:#FAFAF7; margin-top:8px; letter-spacing:-0.4px; }
.dp-sum-val.cream{ color:var(--cream); }
.dp-evsum-list{ display:flex; flex-direction:column; }
.dp-evsum-row{ display:flex; align-items:center; gap:16px; padding:14px 2px; border-bottom:1px solid var(--hair2); }
.dp-evsum-row:last-child{ border-bottom:none; }
.dp-evsum-idx{ flex-shrink:0; width:32px; height:32px; border-radius:10px; border:1px solid var(--idxbr); background:linear-gradient(135deg,var(--idxbg1),var(--idxbg2)); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; color:var(--idxtx); }
.dp-evsum-name{ flex:1; min-width:0; font-size:14px; font-weight:600; color:var(--tx1); line-height:1.35; }
.dp-evsum-vals{ display:flex; align-items:baseline; gap:28px; flex-shrink:0; }
.dp-evsum-cell{ text-align:right; min-width:118px; }
.dp-evsum-lbl{ font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--tx2); font-weight:600; }
.dp-evsum-val{ font-size:15px; font-weight:700; color:var(--tx1); margin-top:5px; white-space:nowrap; }
.dp-evsum-val.cream{ color:var(--chiptx); }
.dp-evsum-val.free{ color:#1F8A53; }
.dp-evsum-row.total{ border-top:1px solid var(--secln); border-bottom:none; margin-top:4px; padding-top:16px; }
.dp-evsum-row.total .dp-evsum-name{ font-weight:700; }
.dp-evsum-row.total .dp-evsum-val{ font-size:17px; font-weight:800; color:var(--chiptx); }
.dp-sum-list{ display:flex; flex-direction:column; }
.dp-sum-line{ display:flex; justify-content:space-between; align-items:baseline; gap:18px; padding:13px 2px; border-bottom:1px solid var(--hair2); }
.dp-sum-line:last-child{ border-bottom:none; }
.dp-sum-caption{ font-size:12px; color:var(--tx2); text-transform:uppercase; letter-spacing:1px; padding:4px 2px 2px; }
.dp-sum-line-lbl{ font-size:14px; color:var(--tx2); }
.dp-sum-line-val{ font-size:15px; font-weight:600; color:var(--tx1); text-align:right; white-space:nowrap; }
.dp-sum-line.hl{ border-top:1px solid var(--secln); margin-top:4px; padding-top:16px; }
.dp-sum-line.hl .dp-sum-line-lbl{ color:var(--tx1); font-weight:600; }
.dp-sum-line.hl .dp-sum-line-val{ font-size:20px; font-weight:800; color:var(--chiptx); }
.dp-resumo-grid{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.dp-resumo-card{ border:1px solid var(--resbr); border-radius:14px; padding:20px 22px; }
.dp-resumo-lbl{ font-size:12px; letter-spacing:1px; color:var(--tx2); text-transform:uppercase; }
.dp-resumo-val{ font-size:30px; font-weight:700; color:var(--tx1); margin-top:10px; letter-spacing:-0.8px; }
.dp-resumo-val small{ font-size:18px; font-weight:700; }
.dp-resumo-sub{ font-size:13px; color:var(--tx2); margin-top:6px; }
.dp-resumo-band{ margin-top:16px; background:linear-gradient(135deg,#0E0E10,#221E14); border:1px solid rgba(197,161,88,0.18); border-radius:14px; padding:22px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:18px; }
.dp-band-tag{ display:inline-flex; align-items:center; gap:8px; background:rgba(197,161,88,0.15); border:1px solid rgba(197,161,88,0.4); border-radius:999px; padding:5px 13px; font-size:11px; letter-spacing:1.5px; color:var(--cream); text-transform:uppercase; font-weight:700; }
.dp-band-note{ font-size:14px; color:#A6A6AE; margin-top:12px; }
.dp-band-val{ font-size:34px; font-weight:800; color:var(--cream); line-height:1; letter-spacing:-1px; }
.dp-band-sub{ font-size:13px; color:#8A8A78; margin-top:8px; }
.dp-cta{ margin-top:16px; background:linear-gradient(135deg,#0E0E10,#241F14); border:1px solid rgba(197,161,88,0.18); border-radius:18px; padding:28px 28px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:22px; }
.dp-cta-eyebrow{ font-size:12px; letter-spacing:2px; color:var(--gold); text-transform:uppercase; font-weight:600; }
.dp-cta-title{ font-size:23px; font-weight:700; color:#FAFAF7; margin-top:10px; letter-spacing:-0.5px; }
.dp-cta-sub{ font-size:14px; color:#A6A6AE; margin-top:8px; }
.dp-cta-btn{ display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg,#C5A158,#E6CF94); color:#1A1508; font-size:15px; font-weight:700; text-decoration:none; padding:15px 26px; border-radius:999px; white-space:nowrap; box-shadow:0 8px 24px rgba(197,161,88,0.28); }
.dp-footer{ margin-top:28px; padding:26px 8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; border-top:1px solid var(--dcln); }
.dp-footer-left{ font-size:13px; color:var(--tx2); line-height:1.7; }
.dp-footer-left strong{ color:var(--tx1); }
.dp-footer-right{ display:flex; flex-direction:column; align-items:flex-end; gap:3px; font-size:13px; color:var(--tx2); }
.dp-footer-site{ font-weight:600; color:var(--gold); letter-spacing:1px; }
.dp-bar{ position:fixed; left:0; right:0; bottom:0; z-index:55; padding:0 16px 16px; pointer-events:none; }
.dp-bar-inner{ pointer-events:auto; max-width:908px; margin:0 auto; display:flex; align-items:center; gap:18px; padding:13px 22px; border-radius:16px; background:rgba(14,14,16,0.94); border:1px solid rgba(197,161,88,0.3); box-shadow:0 -8px 30px rgba(0,0,0,0.22); }
.dp-bar-total{ font-size:11px; letter-spacing:1.5px; color:#C5A158; text-transform:uppercase; font-weight:700; }
.dp-bar-val{ font-size:19px; font-weight:800; color:#FAFAF7; letter-spacing:-0.5px; }
.dp-bar-pf{ font-size:13px; color:#A6A6AE; }
.dp-bar-btn{ display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#C5A158,#E6CF94); color:#1A1508; font-size:13px; font-weight:700; text-decoration:none; padding:9px 16px; border-radius:999px; white-space:nowrap; }
@media (max-width:680px){
  .dp-root{ padding:14px 12px 88px; }
  .dp-hero{ padding:26px 18px 22px; border-radius:16px; }
  .dp-hero-rule{ margin:22px 0 20px; }
  .dp-hero-head{ gap:16px; }
  .dp-title{ font-size:26px; }
  .dp-section{ padding:20px 18px; border-radius:14px; }
  .dp-invest{ padding:22px 18px; border-radius:14px; }
  .dp-dados-grid{ grid-template-columns:1fr 1fr; gap:18px 16px; }
  .dp-invest-grid{ grid-template-columns:1fr; gap:16px; }
  .dp-invest-col{ border-left:none; padding-left:0; border-top:1px solid rgba(255,255,255,0.12); padding-top:14px; }
  .dp-invest-val{ font-size:36px; }
  .dp-events-title{ font-size:23px; }

  /* Card de evento no mobile: título em LARGURA TOTAL, pills logo abaixo e o
     valor abaixo — nada de nome espremido quebrando linha num espaço mínimo. */
  .dp-ev-head{ flex-wrap:wrap; gap:12px 14px; padding:16px 16px; align-items:flex-start; }
  .dp-ev-idx{ width:42px; height:42px; }
  .dp-ev-idx span{ font-size:17px; }
  .dp-ev-head-main{ flex:1 1 0; order:1; }
  .dp-ev-name{ font-size:15.5px; }
  .dp-chevron{ order:2; margin-top:10px; }
  .dp-ev-value-col{ order:3; flex-basis:100%; text-align:left; padding-left:56px; }
  .dp-ev-value{ font-size:19px; }
  .dp-ev-body{ padding:6px 16px 16px; }
  .dp-ev-summary{ grid-template-columns:1fr; }
  .dp-sum-cell{ border-right:none; border-bottom:1px solid rgba(255,255,255,0.09); }
  .dp-sum-cell.last{ border-bottom:none; }
  .dp-evsum-row{ flex-wrap:wrap; gap:10px 12px; }
  .dp-evsum-name{ flex:1 1 0; }
  .dp-evsum-vals{ flex-basis:100%; justify-content:space-between; gap:12px; padding-left:48px; }
  .dp-evsum-cell{ min-width:0; text-align:left; }
  .dp-evsum-cell:last-child{ text-align:right; }
  .dp-resumo-grid{ grid-template-columns:1fr; }
  .dp-resumo-band{ padding:20px; }
  .dp-cta{ padding:24px 20px; flex-direction:column; align-items:flex-start; }
  .dp-footer{ flex-direction:column; align-items:flex-start; }
  .dp-footer-right{ align-items:flex-start; }
  .dp-bar-pf{ display:none; }
}
@media print{
  .dp-root{ padding:0; background:#fff; }
  /* Some com elementos de tela e com o brilho radial (vira círculo sólido em
     impressoras mobile). */
  .dp-theme-toggle, .dp-bar, .dp-hero-glow, .dp-invest-glow{ display:none !important; }
  .dp-hero, .dp-section, .dp-invest, .dp-ev-card, .dp-resumo-band{ page-break-inside:avoid; break-inside:avoid; }
}
`;

const WA_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || "5511900000000");

export function DemonstrativoView({
  document: doc,
}: {
  document: BudgetPrintDocument;
}) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // Dificulta abrir o inspecionar/DevTools na página do cliente: bloqueia o menu
  // de contexto (botão direito) e os atalhos F12 / Ctrl+Shift+I|J|C / Ctrl+U.
  // Obs.: é um deterrente — não é possível impedir 100% no navegador do usuário.
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
        (e.ctrlKey && k === "u")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blockContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", blockKeys, true);
    window.addEventListener("contextmenu", blockContext, true);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      window.removeEventListener("contextmenu", blockContext, true);
    };
  }, []);

  const isOpen = (id: string) =>
    allOpen ? !openIds[`__closed_${id}`] : !!openIds[id];

  const toggle = (id: string) => {
    if (allOpen) {
      setOpenIds((s) => ({ ...s, [`__closed_${id}`]: !s[`__closed_${id}`] }));
    } else {
      setOpenIds((s) => ({ ...s, [id]: !s[id] }));
    }
  };

  const startYear = yearOf(doc.startDate);
  const endYear = yearOf(doc.endDate);
  const period =
    startYear && endYear
      ? startYear === endYear
        ? startYear
        : `${startYear} — ${endYear}`
      : `${doc.startDate} — ${doc.endDate}`;
  const code = doc.budgetCode || doc.controlNumber || "—";
  // Faixa de destaque e barra fixa mostram o valor cheio: com baile, o último
  // quadro é o acumulado até o baile; sem baile, é o único que existe.
  const headlineBlock =
    doc.summaryBlocks[doc.summaryBlocks.length - 1] ?? {
      shortLabel: "até a colação",
      totalPerStudent: doc.totalValuePerStudent,
      installmentPerStudent: doc.installmentValuePerStudent,
    };
  const eventsTotal = useMemo(
    () => doc.events.reduce((total, ev) => total + Math.max(0, ev.finalTotal), 0),
    [doc.events],
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
    `Olá! Gostaria de falar sobre o orçamento ${code} (${doc.course} ${doc.institution}).`,
  )}`;

  return (
    <div className="dp-root" data-theme={dark ? "dark" : "light"}>
      <style>{STYLES}</style>
      <button
        className="dp-theme-toggle"
        onClick={() => setDark((d) => !d)}
        aria-label="Alternar tema"
      >
        {dark ? "☀" : "☾"}
      </button>

      <div className="dp-wrap">
        {/* HERO */}
        <header className="dp-hero">
          <div className="dp-hero-glow" />
          <div className="dp-hero-inner">
            <div className="dp-brand">
              <svg width="44" height="50" viewBox="0 0 100 112" fill="none">
                <path
                  d="M50 4 L94 19 V54 C94 80 74 99 50 108 C26 99 6 80 6 54 V19 Z"
                  stroke="#C5A158"
                  strokeWidth="3"
                  fill="none"
                />
                <text
                  x="50"
                  y="73"
                  textAnchor="middle"
                  fontFamily="'Inter',sans-serif"
                  fontWeight="800"
                  fontSize="46"
                  fill="#C5A158"
                >
                  E
                </text>
              </svg>
              <div>
                <div className="dp-brand-name">
                  ORÇA<span>EVENTOS</span>
                </div>
                <div className="dp-brand-sub">Cerimonial &amp; Formaturas</div>
              </div>
            </div>
            <div className="dp-hero-rule" />
            <div className="dp-hero-head">
              <div>
                <div className="dp-eyebrow">Orçamento de Formatura</div>
                <h1 className="dp-title">
                  {doc.course} · {doc.institution}
                </h1>
                <div className="dp-committee">
                  Comissão de Formatura — {doc.committee || "—"}
                </div>
              </div>
              <div className="dp-code">
                <span className="dp-code-dot" />
                <span className="dp-code-txt">{code}</span>
              </div>
            </div>
            <div className="dp-hero-chips">
              <div className="dp-hchip">
                <span>Formandos</span> &nbsp;
                <strong>{numberFmt.format(doc.studentsQuantity)}</strong>
              </div>
              <div className="dp-hchip">
                <span>Eventos</span> &nbsp;
                <strong>{numberFmt.format(doc.selectedEventsCount)}</strong>
              </div>
              <div className="dp-hchip">
                <span>Período</span> &nbsp;<strong>{period}</strong>
              </div>
            </div>
          </div>
        </header>

        {/* DADOS */}
        <section className="dp-section">
          <div className="dp-sec-eyebrow">
            <span>Dados do Evento</span>
            <span className="dp-sec-line" />
          </div>
          <div className="dp-dados-grid">
            {[
              ["Instituição de Ensino", doc.institution],
              ["Curso / Turma", doc.course],
              ["Comissão de Formatura", doc.committee],
              ["Telefone da Comissão", doc.phone],
              ["Número de Controle", code],
              ["Período", `${doc.startDate} — ${doc.endDate}`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="dp-dado-lbl">{label}</div>
                <div className="dp-dado-val">{value || "—"}</div>
              </div>
            ))}
          </div>
        </section>

        {/* EVENTOS */}
        <div className="dp-events-title-row">
          <h2 className="dp-events-title">Eventos Selecionados</h2>
          <span className="dp-events-title-line" />
          <button
            className="dp-toggle-all"
            onClick={() => {
              setAllOpen((v) => !v);
              setOpenIds({});
            }}
          >
            {allOpen ? "Recolher todos" : "Expandir todos"}
          </button>
        </div>

        {doc.events.map((ev, index) => {
          const cortesia = ev.finalTotal <= 0;
          const open = isOpen(ev.eventId);
          return (
            <div
              key={ev.eventId}
              className={`dp-ev-card${cortesia ? " cortesia" : ""}`}
            >
              <div className="dp-ev-head" onClick={() => toggle(ev.eventId)}>
                <div className="dp-ev-idx">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="dp-ev-head-main">
                  <div className="dp-ev-name">{ev.title}</div>
                  <div className="dp-ev-chips">
                    <span className="dp-ev-chip">
                      {numberFmt.format(ev.participants)} formandos
                    </span>
                  </div>
                </div>
                {cortesia && (
                  <div className="dp-ev-value-col">
                    <div className="dp-badge-cortesia">Cortesia</div>
                  </div>
                )}
                <svg
                  className={`dp-chevron${open ? " open" : ""}`}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#C5A158"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {open && (
                <div className="dp-ev-body">
                  <div className="dp-items-head">
                    <span>Item</span>
                    <span>Qtd.</span>
                  </div>
                  {ev.rows.map((row, ri) =>
                    row.kind === "header" ? (
                      <div key={ri} className="dp-item-section">
                        {row.label}
                      </div>
                    ) : (
                      <div key={ri} className="dp-item-row">
                        <div className="dp-item-name">
                          {row.label}
                          {row.subitemsText && (
                            <div className="dp-item-desc">
                              {row.subitemsText}
                            </div>
                          )}
                          {row.note && (
                            <div className="dp-item-desc">{row.note}</div>
                          )}
                        </div>
                        <div className="dp-item-right">
                          {row.clientVisibleValue && !cortesia && (
                            <span className="dp-item-val">
                              {row.finalTotalLabel}
                            </span>
                          )}
                          <div className="dp-item-qty">{row.quantityLabel}</div>
                        </div>
                      </div>
                    ),
                  )}
                  <div className="dp-ev-summary">
                    <div className="dp-sum-cell">
                      <div className="dp-sum-lbl mut">Qtd. de formandos</div>
                      <div className="dp-sum-val">
                        {numberFmt.format(ev.participants)}
                      </div>
                    </div>
                    <div className="dp-sum-cell last">
                      <div className="dp-sum-lbl gold">Valor por formando</div>
                      <div className="dp-sum-val cream">
                        {cortesia ? "Cortesia" : money(ev.valuePerStudent)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* VALORES POR EVENTO */}
        <section className="dp-section">
          <div className="dp-sec-eyebrow">
            <span>Valores por Evento</span>
            <span className="dp-sec-line" />
          </div>
          <div className="dp-evsum-list">
            {doc.events.map((ev, index) => {
              const cortesia = ev.finalTotal <= 0;

              return (
                <div key={ev.eventId} className="dp-evsum-row">
                  <div className="dp-evsum-idx">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="dp-evsum-name">{ev.title}</div>
                  <div className="dp-evsum-vals">
                    <div className="dp-evsum-cell">
                      <div className="dp-evsum-lbl">Valor do evento</div>
                      <div
                        className={`dp-evsum-val${cortesia ? " free" : ""}`}
                      >
                        {cortesia ? "Cortesia" : money(ev.finalTotal)}
                      </div>
                    </div>
                    <div className="dp-evsum-cell">
                      <div className="dp-evsum-lbl">Por formando</div>
                      <div
                        className={`dp-evsum-val cream${cortesia ? " free" : ""}`}
                      >
                        {cortesia ? "Cortesia" : money(ev.valuePerStudent)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="dp-evsum-row total">
              <div className="dp-evsum-name">Total dos eventos</div>
              <div className="dp-evsum-vals">
                <div className="dp-evsum-cell">
                  <div className="dp-evsum-lbl">Valor total</div>
                  <div className="dp-evsum-val">{money(eventsTotal)}</div>
                </div>
                <div className="dp-evsum-cell">
                  <div className="dp-evsum-lbl">Por formando</div>
                  <div className="dp-evsum-val">
                    {money(doc.totalValuePerStudent)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* INVESTIMENTO */}
        <section className="dp-invest">
          <div className="dp-invest-glow" />
          <div className="dp-invest-grid">
            <div>
              <div className="dp-invest-lbl">
                Valor total {headlineBlock.shortLabel} · por formando
              </div>
              <div className="dp-invest-val">
                {money(headlineBlock.totalPerStudent)}
              </div>
            </div>
            <div className="dp-invest-col">
              <div className="dp-invest-col-lbl">Parcelamento</div>
              <div className="dp-invest-col-val white">
                {numberFmt.format(doc.installments)}x
              </div>
            </div>
            <div className="dp-invest-col">
              <div className="dp-invest-col-lbl">Parcela por formando</div>
              <div className="dp-invest-col-val">
                {money(doc.installmentValuePerStudent)}
              </div>
            </div>
          </div>
        </section>

        {/* RESUMO */}
        <section className="dp-section">
          <div className="dp-sec-eyebrow">
            <span>Resumo Final · Condições de Pagamento</span>
            <span className="dp-sec-line" />
          </div>
          {/* Com baile no orçamento são dois quadros: até a colação e o
              acumulado até o baile, com as mesmas parcelas. */}
          {doc.summaryBlocks.map((block, index) => (
            <div
              className="dp-sum-list"
              key={block.key}
              style={index > 0 ? { marginTop: 18 } : undefined}
            >
              {block.caption && (
                <div className="dp-sum-caption">{block.caption}</div>
              )}
              <div className="dp-sum-line hl">
                <span className="dp-sum-line-lbl">{block.totalLabel}</span>
                <span className="dp-sum-line-val">
                  {money(block.totalPerStudent)}
                </span>
              </div>
              <div className="dp-sum-line">
                <span className="dp-sum-line-lbl">Quantidade de parcelas</span>
                <span className="dp-sum-line-val">
                  {numberFmt.format(doc.installments)}
                </span>
              </div>
              <div className="dp-sum-line">
                <span className="dp-sum-line-lbl">
                  Valor da parcela por formando
                </span>
                <span className="dp-sum-line-val">
                  {money(block.installmentPerStudent)}
                </span>
              </div>
              <div className="dp-sum-line hl">
                <span className="dp-sum-line-lbl">
                  Valor da parcela com 10% de desconto
                </span>
                <span className="dp-sum-line-val">
                  {money(block.discountedInstallmentPerStudent)}
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* CTA */}
        <section className="dp-cta">
          <div>
            <div className="dp-cta-eyebrow">Vamos conversar</div>
            <div className="dp-cta-title">Pronto para dar o próximo passo?</div>
            <div className="dp-cta-sub">
              Fale com a nossa equipe e tire suas dúvidas sobre este orçamento.
            </div>
          </div>
          <a
            className="dp-cta-btn"
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar no WhatsApp
          </a>
        </section>

        {/* FOOTER */}
        <footer className="dp-footer">
          <div className="dp-footer-left">
            <strong>(11) 0000-0000</strong>
            <br />
            Rua Exemplo, 100 — Centro, São Paulo-SP, 01000-000
          </div>
          <div className="dp-footer-right">
            <span className="dp-footer-site">www.example.com</span>
            <span>@orcaeventos.demo</span>
          </div>
        </footer>
      </div>

      {/* Barra fixa de total */}
      <div className="dp-bar">
        <div className="dp-bar-inner">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1, minWidth: 0 }}>
            <span className="dp-bar-total">Por formando</span>
            <span className="dp-bar-val">
              {money(doc.totalValuePerStudent)}
            </span>
            <span className="dp-bar-pf">
              · {numberFmt.format(doc.installments)}x de{" "}
              {money(doc.installmentValuePerStudent)}
            </span>
          </div>
          <a className="dp-bar-btn" href={waLink} target="_blank" rel="noopener noreferrer">
            Falar agora
          </a>
        </div>
      </div>
    </div>
  );
}
