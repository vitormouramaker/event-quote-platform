const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Catalogo: leitura para todos os logados, escrita so para administradores.
rota.use(security.requireCatalogWrite);

function normalizeAuditoriumPayload(body = {}) {
    return {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        slug: typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') : '',
        price: Number(body.price ?? 0),
        allow_budget_edit: Boolean(body.allow_budget_edit),
        // Vazio = auditorio disponivel em todas as cidades.
        city: typeof body.city === 'string' && body.city.trim() ? body.city.trim() : null,
    };
}

function validateAuditoriumPayload(data) {
    if (!data.name) return 'Campo obrigatório: name';
    if (!data.slug) return 'Campo obrigatório: slug';
    if (!Number.isFinite(data.price) || data.price < 0) return 'price inválido';
    return null;
}

// GET /web/auditoriums
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        const rows = await execute.execute_get_all_auditoriums();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/auditoriums GET'));
    }
});

// GET /web/auditoriums/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const auditorium = await execute.execute_get_auditorium_by_id(req.params.id);
        if (!auditorium) {
            return res.json(utils.jsonMount(false, {}, 'Auditório não encontrado'));
        }
        return res.json(utils.jsonMount(true, auditorium, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/auditoriums GET ${req.params.id}`));
    }
});

// POST /web/auditoriums
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeAuditoriumPayload(req.body);
        const validationError = validateAuditoriumPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const auditorium = await execute.execute_create_auditorium(data);
        attachAudit(req, {
            action: 'auditorium.create',
            entity_type: 'auditorium',
            entity_id: auditorium?.id,
            description: 'Criação de auditório',
            after_data: auditorium || null,
        });
        return res.json(utils.jsonMount(true, auditorium, 'Auditório criado com sucesso!'));
    } catch (error) {
        if (String(error.message || error).includes('uq_auditoriums_slug')) {
            return res.json(utils.jsonMount(false, {}, 'Já existe um auditório com esse slug.'));
        }
        return res.json(utils.errorHandle(error, '/auditoriums POST'));
    }
});

// PUT /web/auditoriums/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeAuditoriumPayload(req.body);
        const validationError = validateAuditoriumPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const before = await execute.execute_get_auditorium_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Auditório não encontrado'));
        }

        const auditorium = await execute.execute_update_auditorium(req.params.id, data);
        attachAudit(req, {
            action: 'auditorium.update',
            entity_type: 'auditorium',
            entity_id: req.params.id,
            description: 'Atualização de auditório',
            before_data: before || null,
            after_data: auditorium || null,
        });
        return res.json(utils.jsonMount(true, auditorium, 'Auditório atualizado!'));
    } catch (error) {
        if (String(error.message || error).includes('uq_auditoriums_slug')) {
            return res.json(utils.jsonMount(false, {}, 'Já existe um auditório com esse slug.'));
        }
        return res.json(utils.errorHandle(error, `/auditoriums PUT ${req.params.id}`));
    }
});

// DELETE /web/auditoriums/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const before = await execute.execute_get_auditorium_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Auditório não encontrado'));
        }

        await execute.execute_delete_auditorium(req.params.id);
        attachAudit(req, {
            action: 'auditorium.delete',
            entity_type: 'auditorium',
            entity_id: req.params.id,
            description: 'Exclusão de auditório',
            before_data: before || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Auditório excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/auditoriums DELETE ${req.params.id}`));
    }
});

module.exports = rota;
