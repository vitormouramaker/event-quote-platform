const express = require('express');
const rota    = express.Router();
const execute = require('../services/execute_web');
const utils   = require('../utils/templates');

// Rotas PÚBLICAS (sem authMiddleware). Acesso apenas via token aleatório e
// read-only — nenhuma mutação é exposta aqui.

// GET /public/demonstrativo/:token — dados do demonstrativo do orçamento para o
// cliente visualizar. Retorna o orçamento + catálogo para o front recalcular.
rota.get('/demonstrativo/:token', async (req, res) => {
    try {
        const payload = await execute.execute_get_public_demonstrativo(req.params.token);
        if (!payload) {
            return res.json(utils.jsonMount(false, {}, 'Demonstrativo não encontrado'));
        }
        return res.json(utils.jsonMount(true, payload, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/public/demonstrativo GET'));
    }
});

module.exports = rota;
