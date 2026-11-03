const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Catalogo: leitura para todos os logados, escrita so para administradores.
rota.use(security.requireCatalogWrite);

function normalizeCityPayload(body = {}) {
    return {
        name: typeof body.name === 'string' ? body.name.trim() : '',
    };
}

function validateCityPayload(data) {
    if (!data.name) return 'Campo obrigatório: name';
    return null;
}

// GET /web/cities
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        const rows = await execute.execute_get_all_cities();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/cities GET'));
    }
});

// GET /web/cities/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const city = await execute.execute_get_city_by_id(req.params.id);
        if (!city) {
            return res.json(utils.jsonMount(false, {}, 'Cidade não encontrada'));
        }
        return res.json(utils.jsonMount(true, city, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/cities GET ${req.params.id}`));
    }
});

// POST /web/cities
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeCityPayload(req.body);
        const validationError = validateCityPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const city = await execute.execute_create_city(data);
        attachAudit(req, {
            action: 'city.create',
            entity_type: 'city',
            entity_id: city?.id,
            description: 'Criação de cidade',
            after_data: city || null,
        });
        return res.json(utils.jsonMount(true, city, 'Cidade criada com sucesso!'));
    } catch (error) {
        if (String(error.message || error).includes('uq_cities_name_lower')) {
            return res.json(utils.jsonMount(false, {}, 'Já existe uma cidade com esse nome.'));
        }
        return res.json(utils.errorHandle(error, '/cities POST'));
    }
});

// PUT /web/cities/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const data = normalizeCityPayload(req.body);
        const validationError = validateCityPayload(data);
        if (validationError) {
            return res.json(utils.jsonMount(false, {}, validationError));
        }

        const before = await execute.execute_get_city_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Cidade não encontrada'));
        }

        const city = await execute.execute_update_city(req.params.id, data);
        attachAudit(req, {
            action: 'city.update',
            entity_type: 'city',
            entity_id: req.params.id,
            description: 'Atualização de cidade',
            before_data: before || null,
            after_data: city || null,
        });
        return res.json(utils.jsonMount(true, city, 'Cidade atualizada!'));
    } catch (error) {
        if (String(error.message || error).includes('uq_cities_name_lower')) {
            return res.json(utils.jsonMount(false, {}, 'Já existe uma cidade com esse nome.'));
        }
        return res.json(utils.errorHandle(error, `/cities PUT ${req.params.id}`));
    }
});

// DELETE /web/cities/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const before = await execute.execute_get_city_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Cidade não encontrada'));
        }

        const result = await execute.execute_delete_city(req.params.id, before.name);
        const deleted = result?.deleted_events || 0;
        attachAudit(req, {
            action: 'city.delete',
            entity_type: 'city',
            entity_id: req.params.id,
            description: `Exclusão de cidade (${deleted} evento(s) base removido(s))`,
            before_data: before || null,
        });
        return res.json(utils.jsonMount(
            true,
            result,
            deleted > 0
                ? `Cidade excluída! ${deleted} evento(s) base dessa cidade também foram removidos.`
                : 'Cidade excluída!',
        ));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/cities DELETE ${req.params.id}`));
    }
});

module.exports = rota;
