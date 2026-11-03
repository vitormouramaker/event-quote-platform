const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Catalogo: leitura para todos os logados, escrita so para administradores.
rota.use(security.requireCatalogWrite);

function validateSubItemPayload(data) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        return 'Campo obrigatório: name';
    }
    return null;
}

// GET /web/sub-items
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, { action: 'subitem.list', entity_type: 'sub_item', description: 'Listagem de sub-itens base' });
        const rows = await execute.execute_get_all_sub_items();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/sub-items GET'));
    }
});

// GET /web/sub-items/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const item = await execute.execute_get_sub_item_by_id(req.params.id);
        attachAudit(req, {
            action: 'subitem.view',
            entity_type: 'sub_item',
            entity_id: req.params.id,
            description: 'Visualizacao de sub-item base',
            after_data: item || null,
        });
        if (!item) {
            return res.json(utils.jsonMount(false, {}, 'Sub-item não encontrado'));
        }
        return res.json(utils.jsonMount(true, item, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/sub-items GET ${req.params.id}`));
    }
});

// POST /web/sub-items
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const validationError = validateSubItemPayload(req.body);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const item = await execute.execute_create_sub_item(req.body);
        attachAudit(req, {
            action: 'subitem.create',
            entity_type: 'sub_item',
            entity_id: item?.id,
            description: 'Criacao de sub-item base',
            after_data: item || null,
        });
        return res.json(utils.jsonMount(true, item, 'Sub-item criado com sucesso!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/sub-items POST'));
    }
});

// PUT /web/sub-items/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const validationError = validateSubItemPayload(req.body);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const beforeItem = await execute.execute_get_sub_item_by_id(req.params.id);
        if (!beforeItem) {
            return res.json(utils.jsonMount(false, {}, 'Sub-item não encontrado'));
        }

        const item = await execute.execute_update_sub_item(req.params.id, req.body);
        attachAudit(req, {
            action: 'subitem.update',
            entity_type: 'sub_item',
            entity_id: req.params.id,
            description: 'Atualizacao de sub-item base',
            before_data: beforeItem || null,
            after_data: item || null,
        });
        return res.json(utils.jsonMount(true, item, 'Sub-item atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/sub-items PUT ${req.params.id}`));
    }
});

// DELETE /web/sub-items/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const beforeItem = await execute.execute_get_sub_item_by_id(req.params.id);
        if (!beforeItem) {
            return res.json(utils.jsonMount(false, {}, 'Sub-item não encontrado'));
        }

        await execute.execute_delete_sub_item(req.params.id);
        attachAudit(req, {
            action: 'subitem.delete',
            entity_type: 'sub_item',
            entity_id: req.params.id,
            description: 'Exclusao de sub-item base',
            before_data: beforeItem || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Sub-item excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/sub-items DELETE ${req.params.id}`));
    }
});

module.exports = rota;
