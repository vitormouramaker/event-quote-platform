import { describe, expect, it } from "vitest";
import {
  buildVenueProposalTotals,
  countEventDays,
  countExtraDays,
  createEmptyVenueProposalForm,
  defaultValidUntil,
  mergeSavedVenueProposalForm,
  resolveVenueSettings,
  validateVenueProposal,
  type VenueProposalForm,
} from "./venueProposal";
import { VENUE_SETTINGS_FALLBACK as settings } from "../data/venueSettings";

function form(patch: Partial<VenueProposalForm> = {}): VenueProposalForm {
  return {
    ...createEmptyVenueProposalForm(settings),
    clientName: "Cliente X",
    eventType: "Show",
    eventStartDate: "2026-12-10",
    eventEndDate: "2026-12-10",
    ...patch,
  };
}

const semOpcionais = () => createEmptyVenueProposalForm(settings).optionals;

describe("proposta de locacao do Aurora Hall", () => {
  it("a locacao escolhida e a unica linha de uma proposta simples", () => {
    const totals = buildVenueProposalTotals(form({ entranceId: "setor_b" }), settings);

    expect(totals.lines).toHaveLength(1);
    expect(totals.lines[0]).toMatchObject({
      label: "Entrada Setor B",
      condition: "Locação do salão",
      total: 49500,
    });
    expect(totals.subtotal).toBe(49500);
    expect(totals.total).toBe(49500);
  });

  describe("duracao do evento", () => {
    it("um dia so e inicio igual ao fim", () => {
      expect(
        countEventDays({ eventStartDate: "2026-12-10", eventEndDate: "2026-12-10" }),
      ).toBe(1);
    });

    it("conta inicio e fim, inclusive", () => {
      expect(
        countEventDays({ eventStartDate: "2026-12-10", eventEndDate: "2026-12-14" }),
      ).toBe(5);
    });

    it("atravessa a virada do mes sem erro de fuso", () => {
      expect(
        countEventDays({ eventStartDate: "2026-12-30", eventEndDate: "2027-01-02" }),
      ).toBe(4);
    });

    it("datas pela metade ou invertidas valem um dia", () => {
      expect(countEventDays({ eventStartDate: "", eventEndDate: "" })).toBe(1);
      expect(
        countEventDays({ eventStartDate: "2026-12-10", eventEndDate: "2026-12-01" }),
      ).toBe(1);
    });
  });

  describe("servicos opcionais", () => {
    it("opcional de valor fechado nao multiplica por diaria", () => {
      const totals = buildVenueProposalTotals(
        form({
          optionals: { ...semOpcionais(), estacionamento: { selected: true, days: 5 } },
        }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "optional:estacionamento")).toMatchObject({
        quantity: 1,
        total: 3400,
      });
    });

    it("opcional por diaria multiplica pelos dias pedidos", () => {
      const totals = buildVenueProposalTotals(
        form({
          eventEndDate: "2026-12-14",
          optionals: {
            ...semOpcionais(),
            cozinha: { selected: true, days: 2 },
            camara_fria: { selected: true, days: 5 },
          },
        }),
        settings,
      );

      // Evento de 5 dias com cozinha em 2 deles.
      expect(totals.lines.find((l) => l.id === "optional:cozinha")).toMatchObject({
        quantity: 2,
        total: 3200,
      });
      expect(totals.lines.find((l) => l.id === "optional:camara_fria")).toMatchObject({
        quantity: 5,
        total: 4150,
      });
    });

    it("nao cobra mais diarias do que o evento dura", () => {
      const totals = buildVenueProposalTotals(
        form({
          // Evento de 1 dia, pedido de 9 diarias de cozinha.
          optionals: { ...semOpcionais(), cozinha: { selected: true, days: 9 } },
        }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "optional:cozinha")).toMatchObject({
        quantity: 1,
        total: 1600,
      });
    });
  });

  describe("diarias adicionais", () => {
    it("01 dia de montagem e 01 de desmontagem nao geram cobranca", () => {
      const base = form({ setupDays: 1, teardownDays: 1 });
      expect(countExtraDays(base, settings)).toEqual({
        extraSetupDays: 0,
        extraTeardownDays: 0,
      });
      expect(
        buildVenueProposalTotals(base, settings).lines.find((l) => l.id === "extra-daily"),
      ).toBeUndefined();
    });

    it("sai automatica a 50% da tarifa do espaco escolhido", () => {
      const totals = buildVenueProposalTotals(
        form({ entranceId: "principal", setupDays: 3, teardownDays: 2 }),
        settings,
      );

      // 2 dias extras de montagem + 1 de desmontagem, a 25.000 cada.
      expect(totals.lines.find((l) => l.id === "extra-daily")).toMatchObject({
        quantity: 3,
        unitPrice: 41750,
        total: 125250,
      });
      expect(totals.subtotal).toBe(208750);
    });

    it("acompanha a entrada escolhida, nao um valor fixo", () => {
      const totals = buildVenueProposalTotals(
        form({ entranceId: "setor_c", setupDays: 2, teardownDays: 1 }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "extra-daily")).toMatchObject({
        quantity: 1,
        unitPrice: 16250,
      });
    });

    it("dia a menos que o incluso nao vira credito", () => {
      const totals = buildVenueProposalTotals(
        form({ setupDays: 0, teardownDays: 0 }),
        settings,
      );
      expect(totals.lines.find((l) => l.id === "extra-daily")).toBeUndefined();
      expect(totals.subtotal).toBe(83500);
    });
  });

  describe("climatizacao fora dos dias de evento", () => {
    it("vale em qualquer dia de montagem, inclusive no que vem incluso", () => {
      // A locacao inclui o dia de montagem, mas nao a climatizacao dele.
      const totals = buildVenueProposalTotals(
        form({
          setupDays: 1,
          teardownDays: 1,
          climateSetup: { selected: true, days: 1 },
          climateTeardown: { selected: true, days: 1 },
        }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "climate-setup")).toMatchObject({
        quantity: 1,
        total: 7750,
      });
      expect(totals.lines.find((l) => l.id === "climate-teardown")).toMatchObject({
        quantity: 1,
        total: 7750,
      });
      // Locacao + 2 dias de climatizacao, sem diaria extra.
      expect(totals.subtotal).toBe(99000);
    });

    it("sem dia de montagem nao ha o que climatizar", () => {
      const totals = buildVenueProposalTotals(
        form({ setupDays: 0, climateSetup: { selected: true, days: 2 } }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "climate-setup")).toBeUndefined();
    });

    it("montagem e desmontagem sao escolhas separadas", () => {
      const totals = buildVenueProposalTotals(
        form({
          setupDays: 3,
          teardownDays: 3,
          climateSetup: { selected: true, days: 2 },
          climateTeardown: { selected: false, days: 0 },
        }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "climate-setup")).toMatchObject({
        quantity: 2,
        total: 15500,
      });
      expect(totals.lines.find((l) => l.id === "climate-teardown")).toBeUndefined();
    });

    it("nao passa dos dias daquela etapa", () => {
      const totals = buildVenueProposalTotals(
        form({
          setupDays: 2,
          teardownDays: 1,
          // Pede 5 dias de climatizacao numa montagem de 2 dias.
          climateSetup: { selected: true, days: 5 },
        }),
        settings,
      );

      expect(totals.lines.find((l) => l.id === "climate-setup")).toMatchObject({
        quantity: 2,
        total: 15500,
      });
    });
  });

  describe("desconto", () => {
    it("percentual acompanha o subtotal", () => {
      const totals = buildVenueProposalTotals(
        form({ discountMode: "PERCENT", discountValue: 10 }),
        settings,
      );

      expect(totals.discountValue).toBe(8350);
      expect(totals.total).toBe(75150);
    });

    it("valor fixo e exatamente o pedido", () => {
      const totals = buildVenueProposalTotals(
        form({ discountMode: "FIXED", discountValue: 3500 }),
        settings,
      );

      expect(totals.discountValue).toBe(3500);
      expect(totals.total).toBe(80000);
    });

    it("nao passa do subtotal", () => {
      const totals = buildVenueProposalTotals(
        form({ discountMode: "FIXED", discountValue: 999999 }),
        settings,
      );

      expect(totals.discountValue).toBe(83500);
      expect(totals.total).toBe(0);
    });
  });

  describe("validacao", () => {
    const totals = (f: VenueProposalForm) => buildVenueProposalTotals(f, settings);

    it("cobra os campos do cabecalho da proposta", () => {
      const vazio = form({ clientName: "" });
      expect(validateVenueProposal(vazio, totals(vazio))).toBe("Informe o cliente.");

      const semData = form({ eventStartDate: "" });
      expect(validateVenueProposal(semData, totals(semData))).toBe(
        "Informe a data de início do evento.",
      );
    });

    it("recusa fim antes do inicio", () => {
      const invertido = form({ eventStartDate: "2026-12-10", eventEndDate: "2026-12-01" });
      expect(validateVenueProposal(invertido, totals(invertido))).toBe(
        "A data de fim não pode ser anterior à de início.",
      );
    });

    it("cobra a configuracao de locacao", () => {
      const semEntrada = form({ entranceId: "" });
      expect(validateVenueProposal(semEntrada, totals(semEntrada))).toBe(
        "Escolha a configuração de locação.",
      );
    });

    it("desconto sem motivo nao passa", () => {
      const comDesconto = form({ discountValue: 10, discountReason: "" });
      expect(validateVenueProposal(comDesconto, totals(comDesconto))).toBe(
        "Informe o motivo do desconto.",
      );
    });

    it("proposta completa passa", () => {
      const completo = form();
      expect(validateVenueProposal(completo, totals(completo))).toBeNull();
    });
  });

  describe("proposta salva voltando para a tela", () => {
    it("completa o que faltar no snapshot em vez de quebrar", () => {
      const recuperado = mergeSavedVenueProposalForm(
        { clientName: "Cliente Y", entranceId: "setor_b" },
        settings,
      );

      expect(recuperado.clientName).toBe("Cliente Y");
      expect(recuperado.entranceId).toBe("setor_b");
      expect(recuperado.optionals.cozinha).toEqual({ selected: false, days: 1 });
      expect(recuperado.climateSetup).toEqual({ selected: false, days: 0 });
      expect(recuperado.climateTeardown).toEqual({ selected: false, days: 0 });
    });

    it("climatizacao unica de proposta antiga vira a da montagem", () => {
      const recuperado = mergeSavedVenueProposalForm(
        { climateControl: { selected: true, days: 2 } } as Partial<VenueProposalForm>,
        settings,
      );

      expect(recuperado.climateSetup).toEqual({ selected: true, days: 2 });
      expect(recuperado.climateTeardown).toEqual({ selected: false, days: 0 });
    });

    it("descarta opcional que saiu da tabela de precos", () => {
      const recuperado = mergeSavedVenueProposalForm(
        {
          optionals: {
            cozinha: { selected: true, days: 2 },
            servico_extinto: { selected: true, days: 9 },
          },
        },
        settings,
      );

      expect(recuperado.optionals.cozinha).toEqual({ selected: true, days: 2 });
      expect(recuperado.optionals.servico_extinto).toBeUndefined();
    });

    it("snapshot vazio devolve um formulario utilizavel", () => {
      const recuperado = mergeSavedVenueProposalForm(null, settings);
      expect(recuperado.entranceId).toBe("principal");
      expect(buildVenueProposalTotals(recuperado, settings).subtotal).toBe(83500);
    });
  });

  describe("tabela de precos congelada na proposta", () => {
    const tabelaNova = {
      ...settings,
      entrances: settings.entrances.map((e) => ({ ...e, price: e.price * 2 })),
    };

    it("proposta com tabela gravada ignora o preco novo", () => {
      const salvo = { entranceId: "principal", settingsSnapshot: settings };
      const tabela = resolveVenueSettings(salvo, tabelaNova);
      const recuperado = mergeSavedVenueProposalForm(salvo, tabela);

      // A locacao segue 83.500 mesmo com a tabela atual em 100.000.
      expect(buildVenueProposalTotals(recuperado, tabela).subtotal).toBe(83500);
    });

    it("proposta antiga, sem tabela gravada, usa a atual", () => {
      const salvo = { entranceId: "principal" };
      const tabela = resolveVenueSettings(salvo, tabelaNova);

      expect(tabela).toBe(tabelaNova);
      expect(
        buildVenueProposalTotals(mergeSavedVenueProposalForm(salvo, tabela), tabela)
          .subtotal,
      ).toBe(167000);
    });

    it("tabela gravada vazia ou quebrada cai na atual", () => {
      expect(resolveVenueSettings(null, settings)).toBe(settings);
      expect(
        resolveVenueSettings(
          { settingsSnapshot: { ...settings, entrances: [] } },
          settings,
        ),
      ).toBe(settings);
    });
  });

  it("a validade padrao e de 15 dias a partir da emissao", () => {
    expect(defaultValidUntil(settings, new Date(2026, 9, 17))).toBe("2026-11-01");
  });
});
