const express  = require('express');
const rota     = express.Router();
const execute  = require('../services/execute_web');
const security = require('../security/auth');
const utils    = require('../utils/templates');
const { postgres } = require('../server/connect');

const ROLES = new Set(['ADM_MASTER', 'ADM_GERENTE', 'ADM_ORCAMENTO', 'ADM_ANALISTA_ORCAMENTO']);

async function roleOf(id) {
    const ret = await postgres.query('SELECT role FROM users WHERE id::text = $1', [String(id)]);
    return ret.rows[0]?.role || null;
}

/**
 * Quem tem so a permissao "gerenciar usuarios" nao pode criar, promover,
 * editar ou excluir um ADM_MASTER: isso daria a si mesmo acesso total.
 */
async function masterGuard(req, targetId) {
    if (security.isMaster(req.user)) return null;
    if (req.body && req.body.role === 'ADM_MASTER') return 'Somente um master pode criar ou promover outro master';
    if (targetId && (await roleOf(targetId)) === 'ADM_MASTER') return 'Somente um master pode alterar outro master';
    return null;
}

// GET /web/users
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canManageUsers(req.user)) {
            return security.deny(res, 'Você não pode acessar usuários');
        }
        const rows = await execute.execute_get_all_users();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/users GET'));
    }
});

// POST /web/users — body JSON puro
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canManageUsers(req.user)) {
            return security.deny(res, 'Você não pode criar usuários');
        }
        const data = req.body;
        if (!data.name || !data.login || !data.password) {
            return res.json(utils.jsonMount(false, {}, 'Campos obrigatórios: name, login, password'));
        }
        if (!ROLES.has(data.role)) {
            return res.json(utils.jsonMount(false, {}, 'Perfil inválido'));
        }
        if (String(data.password).length < 8) {
            return res.json(utils.jsonMount(false, {}, 'A senha precisa de pelo menos 8 caracteres'));
        }
        data.permissions = data.permissions || {};
        const blocked = await masterGuard(req, null);
        if (blocked) return security.deny(res, blocked);
        const user = await execute.execute_create_user(data);
        return res.json(utils.jsonMount(true, user, 'Usuário criado com sucesso!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/users POST'));
    }
});

// PUT /web/users/:id — body JSON puro
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canManageUsers(req.user)) {
            return security.deny(res, 'Você não pode editar usuários');
        }
        if (req.body.role !== undefined && !ROLES.has(req.body.role)) {
            return res.json(utils.jsonMount(false, {}, 'Perfil inválido'));
        }
        if (req.body.password && String(req.body.password).length < 8) {
            return res.json(utils.jsonMount(false, {}, 'A senha precisa de pelo menos 8 caracteres'));
        }
        req.body.permissions = req.body.permissions || {};
        const blocked = await masterGuard(req, req.params.id);
        if (blocked) return security.deny(res, blocked);
        const user = await execute.execute_update_user(req.params.id, req.body);
        return res.json(utils.jsonMount(true, user, 'Usuário atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/users PUT ${req.params.id}`));
    }
});

// DELETE /web/users/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canManageUsers(req.user)) {
            return security.deny(res, 'Você não pode excluir usuários');
        }
        if (String(req.params.id) === String(req.user.id)) {
            return res.json(utils.jsonMount(false, {}, 'Você não pode excluir a própria conta'));
        }
        const blocked = await masterGuard(req, req.params.id);
        if (blocked) return security.deny(res, blocked);
        await execute.execute_delete_user(req.params.id);
        return res.json(utils.jsonMount(true, {}, 'Usuário excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/users DELETE ${req.params.id}`));
    }
});

module.exports = rota;
