const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Catalogo: leitura para todos os logados, escrita so para administradores.
rota.use(security.requireCatalogWrite);

function coerceBoolean(value) {
    return value === true || value === 'true' || value === 'on' || value === 1;
}

function normalizeItemVariations(rawVariations) {
    const parsedVariations = Array.isArray(rawVariations)
        ? rawVariations
        : typeof rawVariations === 'string'
            ? (() => {
                try {
                    const parsed = JSON.parse(rawVariations);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
            : [];

    return parsedVariations
        .map((variation, index) => {
            if (!variation || typeof variation !== 'object') return null;

            const rawId = typeof variation.id === 'string' ? variation.id.trim() : '';
            const name = typeof variation.name === 'string' ? variation.name.trim() : '';
            const unitPrice = Number(variation.unit_price ?? 0);
            const defaultQuantity = Number(variation.default_quantity ?? 1);

            return {
                id: rawId || `var_${Date.now().toString(36)}_${index}`,
                name,
                unit_price: unitPrice,
                default_quantity: defaultQuantity,
            };
        })
        .filter(Boolean);
}

function normalizeItemPayload(body = {}) {
    const rawSubitems = Array.isArray(body.subitems)
        ? body.subitems
        : typeof body.subitems === 'string'
            ? (() => {
                try {
                    const parsed = JSON.parse(body.subitems);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
            : [];

    const subitems = rawSubitems
        .map((subitem) => {
            if (typeof subitem === 'string') {
                const name = subitem.trim();
                return name ? { name } : null;
            }
            if (!subitem || typeof subitem !== 'object') return null;
            const name = typeof subitem.name === 'string' ? subitem.name.trim() : '';
            return name ? { name } : null;
        })
        .filter(Boolean);

    return {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        unit_price: Number(body.unit_price ?? 0),
        default_quantity: Number(body.default_quantity ?? 1),
        editable: coerceBoolean(body.editable),
        dynamic_by_students: coerceBoolean(body.dynamic_by_students),
        has_subitems: coerceBoolean(body.has_subitems),
        subitems,
        variations: normalizeItemVariations(body.variations),
        has_additional: coerceBoolean(body.has_additional),
        additional_quantity: Number(body.additional_quantity ?? 0),
        has_multiplier: coerceBoolean(body.has_multiplier),
        multiplier_quantity: Number(body.multiplier_quantity ?? 0),
        value_visible_to_client: coerceBoolean(body.value_visible_to_client),
    };
}

function validateItemPayload(data) {
    if (!data.name) return 'Campo obrigatÃ³rio: name';
    if (!Number.isFinite(data.unit_price) || data.unit_price < 0) return 'unit_price invÃ¡lido';
    if (!Number.isInteger(data.default_quantity) || data.default_quantity < 1) return 'default_quantity invÃ¡lido';
    if (data.has_subitems && (!Array.isArray(data.subitems) || data.subitems.length === 0)) return 'subitems invÃ¡lido';
    if (data.has_additional && (!Number.isInteger(data.additional_quantity) || data.additional_quantity < 1)) {
        return 'additional_quantity invÃ¡lido';
    }
    if (data.has_multiplier && (!Number.isInteger(data.multiplier_quantity) || data.multiplier_quantity < 1)) {
        return 'multiplier_quantity invÃ¡lido';
    }
    if (Array.isArray(data.variations) && data.variations.some((variation) => (
        !variation?.id ||
        !variation?.name ||
        !Number.isFinite(Number(variation.unit_price)) ||
        Number(variation.unit_price) <= 0 ||
        !Number.isInteger(Number(variation.default_quantity)) ||
        Number(variation.default_quantity) < 1
    ))) {
        return 'variations invÃ¡lido';
    }
    return null;
}

// GET /web/items
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, { action: 'item.list', entity_type: 'item', description: 'Listagem de itens base' });
        const rows = await execute.execute_get_all_items();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/items GET'));
    }
});

// GET /web/items/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const item = await execute.execute_get_item_by_id(req.params.id);
        attachAudit(req, {
            action: 'item.view',
            entity_type: 'item',
            entity_id: req.params.id,
            description: 'Visualizacao de item base',
            after_data: item || null,
        });
        if (!item) {
            return res.json(utils.jsonMount(false, {}, 'Item nÃ£o encontrado'));
        }
        return res.json(utils.jsonMount(true, item, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items GET ${req.params.id}`));
    }
});

// GET /web/items/:id/event-configs
// A "logica por evento" do item: um registro por evento que usa este item.
rota.get('/:id/event-configs', security.authMiddleware, async (req, res) => {
    try {
        const rows = await execute.execute_get_item_event_configs(req.params.id);
        attachAudit(req, {
            action: 'item.event_configs.list',
            entity_type: 'item',
            entity_id: req.params.id,
            description: 'Listagem da configuracao do item por evento',
        });
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items GET ${req.params.id}/event-configs`));
    }
});

// PUT /web/items/:id/event-configs
rota.put('/:id/event-configs', security.authMiddleware, async (req, res) => {
    try {
        const body = Array.isArray(req.body?.configs) ? req.body.configs : null;
        if (!body) {
            return res.json(utils.jsonMount(false, {}, 'configs invalido'));
        }

        // `Number(null)` e 0 — sem este guarda, campo vazio viraria zero.
        const numeroOuNulo = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const normalizados = [];
        for (const cfg of body) {
            const eventId = Number(cfg?.event_template_id);
            if (!Number.isInteger(eventId) || eventId <= 0) {
                return res.json(utils.jsonMount(false, {}, 'event_template_id invalido'));
            }
            // O conjunto completo de campos do item: neste evento, o item e
            // cadastrado assim. 'editable' do item vale para quantidade E
            // valor, entao o mesmo toggle alimenta os dois.
            const editavel = cfg.editable === true;
            normalizados.push({
                event_template_id: eventId,
                quantity_editable: editavel,
                price_editable: editavel,
                dynamic_by_students: cfg.dynamic_by_students === true,
                unit_price: numeroOuNulo(cfg.unit_price),
                default_quantity: numeroOuNulo(cfg.default_quantity),
                value_visible_to_client: cfg.value_visible_to_client === true,
                has_subitems: cfg.has_subitems === true,
                subitems: Array.isArray(cfg.subitems) ? cfg.subitems : [],
                has_additional: cfg.has_additional === true,
                additional_quantity: numeroOuNulo(cfg.additional_quantity) ?? 0,
                has_multiplier: cfg.has_multiplier === true,
                multiplier_quantity: numeroOuNulo(cfg.multiplier_quantity) ?? 0,
                variations: Array.isArray(cfg.variations) ? cfg.variations : [],
            });
        }

        const antes = await execute.execute_get_item_event_configs(req.params.id);
        const rows = await execute.execute_save_item_event_configs(req.params.id, normalizados);
        attachAudit(req, {
            action: 'item.event_configs.update',
            entity_type: 'item',
            entity_id: req.params.id,
            description: 'Alteracao da configuracao do item por evento',
            before_data: antes,
            after_data: rows,
        });
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items PUT ${req.params.id}/event-configs`));
    }
});

// POST /web/items/:id/events  { event_template_id }
// Inclui o item num evento direto pela tela do item.
rota.post('/:id/events', security.authMiddleware, async (req, res) => {
    try {
        const eventId = Number(req.body?.event_template_id);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.json(utils.jsonMount(false, {}, 'event_template_id invalido'));
        }
        const rows = await execute.execute_add_item_to_event(req.params.id, eventId);
        attachAudit(req, {
            action: 'item.event.add',
            entity_type: 'item',
            entity_id: req.params.id,
            description: `Item incluido no evento ${eventId}`,
            after_data: { event_template_id: eventId },
        });
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items POST ${req.params.id}/events`));
    }
});

// DELETE /web/items/:id/events/:eventId
rota.delete('/:id/events/:eventId', security.authMiddleware, async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.json(utils.jsonMount(false, {}, 'eventId invalido'));
        }
        const rows = await execute.execute_remove_item_from_event(req.params.id, eventId);
        attachAudit(req, {
            action: 'item.event.remove',
            entity_type: 'item',
            entity_id: req.params.id,
            description: `Item retirado do evento ${eventId}`,
            before_data: { event_template_id: eventId },
        });
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items DELETE ${req.params.id}/events`));
    }
});

// POST /web/items
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeItemPayload(req.body);
        const validationError = validateItemPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const item = await execute.execute_create_item(data);
        attachAudit(req, {
            action: 'item.create',
            entity_type: 'item',
            entity_id: item?.id,
            description: 'Criacao de item base',
            after_data: item || null,
        });
        return res.json(utils.jsonMount(true, item, 'Item criado com sucesso!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/items POST'));
    }
});

// PUT /web/items/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeItemPayload(req.body);
        const validationError = validateItemPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const beforeItem = await execute.execute_get_item_by_id(req.params.id);
        if (!beforeItem) {
            return res.json(utils.jsonMount(false, {}, 'Item nÃ£o encontrado'));
        }

        const item = await execute.execute_update_item(req.params.id, data);
        attachAudit(req, {
            action: 'item.update',
            entity_type: 'item',
            entity_id: req.params.id,
            description: 'Atualizacao de item base',
            before_data: beforeItem || null,
            after_data: item || null,
        });
        return res.json(utils.jsonMount(true, item, 'Item atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items PUT ${req.params.id}`));
    }
});

// DELETE /web/items/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const beforeItem = await execute.execute_get_item_by_id(req.params.id);
        if (!beforeItem) {
            return res.json(utils.jsonMount(false, {}, 'Item nÃ£o encontrado'));
        }

        await execute.execute_delete_item(req.params.id);
        attachAudit(req, {
            action: 'item.delete',
            entity_type: 'item',
            entity_id: req.params.id,
            description: 'Exclusao de item base',
            before_data: beforeItem || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Item excluÃ­do!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/items DELETE ${req.params.id}`));
    }
});

module.exports = rota;
