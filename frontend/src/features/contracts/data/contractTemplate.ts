// Conteúdo fictício de demonstração.
//
// Modelo de contrato usado pela tela de Contratos. Os trechos que mudam a cada
// cliente são tokens {{chave}}, que viram campos editáveis na tela. O restante
// do texto é fixo. O texto abaixo foi escrito só para esta demonstração: não é
// um modelo jurídico e não deve ser usado como contrato real.

export type ContractVariable = {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  multiline?: boolean;
  /** "date" mostra o seletor de calendário; o texto gravado fica em dd/mm/aaaa. */
  type?: "date";
};

export const CONTRACT_VARIABLES: ContractVariable[] = [
  {
    key: "turma",
    label: "Curso / Turma",
    hint: "Cláusula 1 — identificação do curso da comissão contratante.",
    placeholder: "ADMINISTRAÇÃO – FACULDADE EXEMPLO – TURMA 2027",
    multiline: true,
  },
  {
    key: "valorTotal",
    label: "Valor total (por extenso)",
    hint: "Cláusula 4 — valor total do contrato com o valor por extenso.",
    placeholder: "R$ 100.000,00 (CEM MIL REAIS)",
    multiline: true,
  },
  {
    key: "pacote",
    label: "Formandos e pacote",
    hint: "Cláusula 5 — quantidade de formandos e eventos do pacote.",
    placeholder: "40 (QUARENTA) FORMANDOS, PACOTE: AULA DA SAUDADE, COLAÇÃO DE GRAU E FESTA 50%.",
    multiline: true,
  },
  {
    key: "primeiraParcela",
    label: "Data da 1ª parcela",
    type: "date",
    hint: "Cláusula 4 — vencimento da primeira parcela.",
    placeholder: "10/01/2027",
    multiline: false,
  },
  {
    key: "parcelas",
    label: "Quantidade de parcelas",
    hint: "Cláusula 4 — em quantas parcelas o valor total é dividido.",
    placeholder: "24",
    multiline: false,
  },
  {
    key: "localData",
    label: "Local e data",
    hint: "Fechamento — cidade e data de assinatura do contrato.",
    placeholder: "São Paulo-SP, 10 DE DEZEMBRO DE 2026.",
    multiline: false,
  },
];

// Cada item = um parágrafo/linha do contrato. Tokens {{chave}} são substituídos
// pelos valores digitados. Tipos controlam o estilo no preview.
export type ContractBlock = {
  type: "title" | "clause" | "paragraph" | "sign";
  text: string;
};

export const CONTRACT_BLOCKS: ContractBlock[] = [
  { type: "title", text: "CONTRATO DE DEMONSTRAÇÃO — ORGANIZAÇÃO DE EVENTOS DE FORMATURA" },
  { type: "paragraph", text: "Conteúdo fictício de demonstração. Este texto não tem valor jurídico." },

  { type: "clause", text: "CLÁUSULA 1 - DAS PARTES" },
  { type: "paragraph", text: "CONTRATADA: ORÇA EVENTOS (empresa fictícia), Rua Exemplo, 100, Centro, São Paulo-SP, CNPJ 00.000.000/0001-00." },
  { type: "paragraph", text: "CONTRATANTE: Formandos do curso {{turma}}, representados pela Comissão de Formatura." },
  { type: "sign", text: "___________________________________________CPF:__________________________" },
  { type: "sign", text: "___________________________________________CPF:__________________________" },
  { type: "sign", text: "___________________________________________CPF:__________________________" },

  { type: "clause", text: "CLÁUSULA 2 - DO OBJETO" },
  { type: "paragraph", text: "Organização dos eventos de formatura descritos no orçamento aprovado e no anexo contratual, que fazem parte deste contrato." },

  { type: "clause", text: "CLÁUSULA 3 - DAS OBRIGAÇÕES" },
  { type: "paragraph", text: "A CONTRATADA executa os serviços do anexo e informa à comissão, quando pedido, a situação dos pagamentos da turma." },
  { type: "paragraph", text: "A CONTRATANTE divulga o contrato aos formandos, envia a lista de participantes e responde aos pedidos de informação em tempo hábil." },

  { type: "clause", text: "CLÁUSULA 4 - DOS VALORES E PAGAMENTOS" },
  { type: "paragraph", text: "O valor total é de {{valorTotal}}, dividido em {{parcelas}} parcelas, com a primeira em {{primeiraParcela}}." },

  { type: "clause", text: "CLÁUSULA 5 - DOS PARTICIPANTES" },
  { type: "paragraph", text: "Este contrato vale para {{pacote}} (CONFORME ORÇAMENTO EM ANEXO)." },
  { type: "paragraph", text: "Se o número de formandos mudar, os valores são recalculados de forma proporcional, conforme o orçamento." },

  { type: "clause", text: "CLÁUSULA 6 - DA RESCISÃO" },
  { type: "paragraph", text: "A rescisão deve ser comunicada por escrito. As condições de rescisão são as do anexo contratual." },

  { type: "clause", text: "CLÁUSULA 7 - DO FORO" },
  { type: "paragraph", text: "Fica eleito o foro da comarca de São Paulo-SP." },

  { type: "paragraph", text: "{{localData}}" },

  { type: "sign", text: "_________________________________________________________________________" },
  { type: "paragraph", text: "CONTRATADA – ORÇA EVENTOS" },
  { type: "sign", text: "_________________________________________________________________________" },
  { type: "paragraph", text: "PRESIDENTE DA COMISSÃO DE FORMATURA" },
  { type: "sign", text: "_________________________________________________________________________" },
  { type: "paragraph", text: "TESTEMUNHA  CPF:                    RG:" },
];
