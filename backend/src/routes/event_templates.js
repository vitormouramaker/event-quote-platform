const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Catalogo: leitura para todos os logados, escrita so para administradores.
rota.use(security.requireCatalogWrite);

const EVENT_TEMPLATE_CITIES = new Set(['Capital', 'Interior']);
const EVENT_TEMPLATE_TYPES = new Set(['Pago', 'Cortesia']);

function normalizeEventTemplatePayload(body = {}) {
    const rawValue = Number(body.value);
    return {
        legacy_event_id: typeof body.legacy_event_id === 'string' ? body.legacy_event_id.trim() : null,
        name: typeof body.name === 'string' ? body.name.trim() : '',
        city: typeof body.city === 'string' ? body.city.trim() : '',
        type: typeof body.type === 'string' ? body.type.trim() : '',
        value: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null,
        has_administration: body.has_administration === true || body.has_administration === 'true' || body.has_administration === 1,
        unit_price_editable: body.unit_price_editable === true || body.unit_price_editable === 'true' || body.unit_price_editable === 1,
        requires_min_events: body.requires_min_events === true || body.requires_min_events === 'true' || body.requires_min_events === 1,
        // Fecha um quadro proprio no resumo final do orcamento (ex.: o baile).
        closes_summary_block: body.closes_summary_block === true || body.closes_summary_block === 'true' || body.closes_summary_block === 1,
        summary_block_label: typeof body.summary_block_label === 'string' && body.summary_block_label.trim()
            ? body.summary_block_label.trim()
            : null,
        group_id: typeof body.group_id === 'string' && body.group_id.trim() ? body.group_id.trim() : null,
        item_ids: Array.isArray(body.item_ids) ? body.item_ids : [],
        event_item_configs: Array.isArray(body.event_item_configs) ? body.event_item_configs : [],
    };
}

function validateEventTemplatePayload(data) {
    if (!data.name) return 'Campo obrigatório: name';
    if (!data.city) return 'city obrigatória';
    if (!EVENT_TEMPLATE_TYPES.has(data.type)) return 'type inválido';
    if (!Array.isArray(data.item_ids)) return 'item_ids inválido';
    if (data.legacy_event_id && !/^[a-z0-9_]+$/i.test(data.legacy_event_id)) {
        return 'legacy_event_id inválido';
    }
    if (!Array.isArray(data.event_item_configs)) return 'event_item_configs inválido';
    return null;
}

function toBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// GET /web/event-templates
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, {
            action: 'event_template.list',
            entity_type: 'event_template',
            description: 'Listagem de modelos de evento',
        });
        const rows = await execute.execute_get_all_event_templates();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/event-templates GET'));
    }
});

// GET /web/event-templates/runtime-catalog
rota.get('/runtime-catalog', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, {
            action: 'event_template.runtime_catalog',
            entity_type: 'event_template',
            description: 'Leitura do catalogo runtime canonico de eventos',
        });
        const payload = await execute.execute_get_event_template_runtime_catalog();
        return res.json(utils.jsonMount(true, payload, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/event-templates/runtime-catalog GET'));
    }
});

// GET /web/event-templates/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const template = await execute.execute_get_event_template_by_id(req.params.id);
        attachAudit(req, {
            action: 'event_template.view',
            entity_type: 'event_template',
            entity_id: req.params.id,
            description: 'Visualizacao de modelo de evento',
            after_data: template || null,
        });
        if (!template) {
            return res.json(utils.jsonMount(false, {}, 'Modelo de evento não encontrado'));
        }
        return res.json(utils.jsonMount(true, template, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/event-templates GET ${req.params.id}`));
    }
});

// POST /web/event-templates
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeEventTemplatePayload(req.body);
        const validationError = validateEventTemplatePayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const template = await execute.execute_create_event_template(data);
        attachAudit(req, {
            action: 'event_template.create',
            entity_type: 'event_template',
            entity_id: template?.id,
            description: 'Criacao de modelo de evento',
            after_data: template || null,
        });
        return res.json(utils.jsonMount(true, template, 'Modelo de evento criado com sucesso!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/event-templates POST'));
    }
});

// POST /web/event-templates/:id/clone  { city, name? }
// Cria o evento para outra cidade dentro da mesma família (abas por cidade),
// copiando itens, configs e regras de resumo.
rota.post('/:id/clone', security.authMiddleware, async (req, res) => {
    try {
        const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        // new_family: duplicar como evento separado (não entra nas abas da família).
        const newFamily = req.body?.new_family === true || req.body?.new_family === 'true';
        if (!city) return res.json(utils.jsonMount(false, {}, 'city obrigatória'));

        const template = await execute.execute_clone_event_template(req.params.id, {
            city,
            name: name || undefined,
            newFamily,
        });
        if (!template) {
            return res.json(utils.jsonMount(false, {}, 'Modelo de evento de origem não encontrado'));
        }
        attachAudit(req, {
            action: newFamily ? 'event_template.duplicate' : 'event_template.clone',
            entity_type: 'event_template',
            entity_id: template?.id,
            description: newFamily
                ? `Duplicação de modelo de evento em ${city}`
                : `Clonagem de modelo de evento para a cidade ${city}`,
            after_data: template || null,
        });
        return res.json(utils.jsonMount(
            true,
            template,
            newFamily ? 'Evento duplicado com sucesso!' : 'Evento criado para a nova cidade!',
        ));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/event-templates POST ${req.params.id}/clone`));
    }
});

// POST /web/event-templates/:id/apply-to-family
// Aplica a config deste evento a todos os irmãos (outras cidades) da família.
rota.post('/:id/apply-to-family', security.authMiddleware, async (req, res) => {
    try {
        const result = await execute.execute_apply_event_template_to_family(req.params.id);
        if (!result) {
            return res.json(utils.jsonMount(false, {}, 'Modelo de evento não encontrado'));
        }
        attachAudit(req, {
            action: 'event_template.apply_to_family',
            entity_type: 'event_template',
            entity_id: req.params.id,
            description: `Config aplicada às cidades: ${result.applied_to.join(', ') || 'nenhuma'}`,
            after_data: result,
        });
        return res.json(utils.jsonMount(true, result, 'Configuração aplicada às outras cidades!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/event-templates POST ${req.params.id}/apply-to-family`));
    }
});

// POST /web/event-templates/import-legacy
rota.post('/import-legacy', security.authMiddleware, async (req, res) => {
    try {
        const events = Array.isArray(req.body?.events) ? req.body.events : [];
        if (events.length === 0) {
            return res.json(utils.jsonMount(false, {}, 'events obrigatório'));
        }

        const existingItems = await execute.execute_get_all_items();
        const itemByName = new Map(existingItems.map((item) => [String(item.name).trim().toLowerCase(), item]));
        const itemByLegacyId = new Map(
            existingItems
                .filter((item) => item.legacy_item_id)
                .map((item) => [String(item.legacy_item_id), item]),
        );

        const existingTemplates = await execute.execute_get_all_event_templates();
        const templateByLegacyId = new Map(
            existingTemplates
                .filter((template) => template.legacy_event_id)
                .map((template) => [String(template.legacy_event_id), template]),
        );

        let createdEvents = 0;
        let updatedEvents = 0;
        let createdItems = 0;

        for (const event of events) {
            const legacyEventId = typeof event?.legacy_event_id === 'string' ? event.legacy_event_id.trim() : '';
            const title = typeof event?.title === 'string' ? event.title.trim() : '';
            const items = Array.isArray(event?.items) ? event.items : [];
            if (!legacyEventId || !title) continue;

            const itemIds = [];
            const itemConfigs = [];

            for (let index = 0; index < items.length; index += 1) {
                const item = items[index] || {};
                const itemName = typeof item.name === 'string' ? item.name.trim() : '';
                if (!itemName) continue;

                const legacyItemId = typeof item?.legacy_item_id === 'string' ? item.legacy_item_id.trim() : '';
                const key = itemName.toLowerCase();
                let currentItem = itemByLegacyId.get(legacyItemId) || itemByName.get(key);
                if (!currentItem) {
                    currentItem = await execute.execute_create_item({
                        legacy_item_id: legacyItemId || null,
                        name: itemName,
                        unit_price: toNumberOrNull(item.unit_price) ?? 0,
                        default_quantity: 1,
                        editable: toBoolean(item.quantity_editable) || toBoolean(item.price_editable),
                        dynamic_by_students: toBoolean(item.dynamic_by_students),
                        has_subitems: toBoolean(item.has_inline_subitems),
                        subitems: Array.isArray(item.inline_subitems)
                            ? item.inline_subitems.map((name) => ({ name: String(name).trim() })).filter((sub) => sub.name)
                            : [],
                    });
                    createdItems += 1;
                    itemByName.set(key, currentItem);
                    if (legacyItemId) itemByLegacyId.set(legacyItemId, currentItem);
                } else if (legacyItemId && !currentItem.legacy_item_id) {
                    currentItem = await execute.execute_update_item(String(currentItem.id), {
                        legacy_item_id: legacyItemId,
                        name: currentItem.name,
                        unit_price: Number(currentItem.unit_price) || 0,
                        default_quantity: Number(currentItem.default_quantity) || 1,
                        editable: currentItem.editable === true,
                        dynamic_by_students: currentItem.dynamic_by_students === true,
                        has_subitems: currentItem.has_subitems === true,
                        subitems: Array.isArray(currentItem.subitems) ? currentItem.subitems : [],
                    });
                    itemByLegacyId.set(legacyItemId, currentItem);
                }

                itemIds.push(String(currentItem.id));
                itemConfigs.push({
                    item_id: currentItem.id,
                    sort_order: Number(item.sort_order ?? index + 1),
                    is_group_header: toBoolean(item.is_group_header),
                    group_title: typeof item.group_title === 'string' ? item.group_title : null,
                    display_value: typeof item.display_value === 'string' ? item.display_value : null,
                    fixed_qty: toNumberOrNull(item.fixed_qty),
                    quantity_editable: toBoolean(item.quantity_editable),
                    price_editable: toBoolean(item.price_editable),
                    dynamic_by_students: toBoolean(item.dynamic_by_students),
                    derived_rule_mode: item?.derived_rule?.mode || null,
                    derived_rule_value: toNumberOrNull(item?.derived_rule?.value),
                });
            }

            const payload = {
                legacy_event_id: legacyEventId,
                name: title,
                city: 'Capital',
                type: 'Pago',
                item_ids: itemIds,
                event_item_configs: itemConfigs,
            };

            const existing = templateByLegacyId.get(legacyEventId);
            if (existing) {
                await execute.execute_update_event_template(String(existing.id), payload);
                updatedEvents += 1;
            } else {
                const created = await execute.execute_create_event_template(payload);
                templateByLegacyId.set(legacyEventId, created);
                createdEvents += 1;
            }
        }

        attachAudit(req, {
            action: 'event_template.import_legacy',
            entity_type: 'event_template',
            description: 'Importacao de templates legados',
            after_data: { createdEvents, updatedEvents, createdItems, importedEvents: events.length },
        });
        return res.json(
            utils.jsonMount(true, { createdEvents, updatedEvents, createdItems, importedEvents: events.length }, 'Importação legada concluída'),
        );
    } catch (error) {
        return res.json(utils.errorHandle(error, '/event-templates/import-legacy POST'));
    }
});

// PUT /web/event-templates/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeEventTemplatePayload(req.body);
        const validationError = validateEventTemplatePayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const beforeTemplate = await execute.execute_get_event_template_by_id(req.params.id);
        if (!beforeTemplate) {
            return res.json(utils.jsonMount(false, {}, 'Modelo de evento não encontrado'));
        }

        const template = await execute.execute_update_event_template(req.params.id, data);
        attachAudit(req, {
            action: 'event_template.update',
            entity_type: 'event_template',
            entity_id: req.params.id,
            description: 'Atualizacao de modelo de evento',
            before_data: beforeTemplate || null,
            after_data: template || null,
        });
        return res.json(utils.jsonMount(true, template, 'Modelo de evento atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/event-templates PUT ${req.params.id}`));
    }
});

// DELETE /web/event-templates/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const beforeTemplate = await execute.execute_get_event_template_by_id(req.params.id);
        if (!beforeTemplate) {
            return res.json(utils.jsonMount(false, {}, 'Modelo de evento não encontrado'));
        }

        await execute.execute_delete_event_template(req.params.id);
        attachAudit(req, {
            action: 'event_template.delete',
            entity_type: 'event_template',
            entity_id: req.params.id,
            description: 'Exclusao de modelo de evento',
            before_data: beforeTemplate || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Modelo de evento excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/event-templates DELETE ${req.params.id}`));
    }
});

module.exports = rota;
