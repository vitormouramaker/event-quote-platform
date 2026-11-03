const express  = require('express');
const rota     = express.Router();
const execute  = require('../services/execute_web');
const utils    = require('../utils/templates');
const security = require('../security/auth');
const { attachAudit } = require('../middleware/audit_trail');
const rateLimit = require('express-rate-limit');

// Freio contra tentativa de senha em massa: 10 tentativas por IP a cada 15 min.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.LOGIN_RATE_LIMIT || 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(utils.jsonMount(false, {}, 'Muitas tentativas. Aguarde alguns minutos.')),
});

// POST /web/auth/login — aceita JSON puro { login, password }
rota.post('/login', loginLimiter, async (req, res) => {
    try {
        const { login, password } = req.body;
        attachAudit(req, {
            action: 'auth.login',
            entity_type: 'session',
            description: 'Tentativa de login',
            actor_name: login || null,
        });
        if (!login || !password) {
            return res.json(utils.jsonMount(false, {}, 'Login e senha são obrigatórios'));
        }

        const rows = await execute.execute_login(login, password);
        if (rows.length === 0) {
            return res.json(utils.jsonMount(false, {}, 'Login ou senha incorretos'));
        }

        const user = rows[0];
        attachAudit(req, {
            actor_user_id: user.id,
            actor_name: user.name,
            actor_role: user.role,
            description: 'Login realizado com sucesso',
            metadata: { login },
        });

        // Token de sessao (Bearer para rotas protegidas). So leva a
        // identidade; papel e permissoes sao relidos do banco a cada pedido.
        const token = security.signSessionToken(user);

        return res.json(utils.jsonMount(true, { ...user, token }, 'Bem vindo!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/auth/login'));
    }
});

// POST /web/auth/logout — endpoint de auditoria/sessão (cliente encerra token localmente)
rota.post('/logout', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, {
            action: 'auth.logout',
            entity_type: 'session',
            entity_id: req.user?.id || null,
            actor_user_id: req.user?.id || null,
            actor_name: req.user?.name || null,
            actor_role: req.user?.role || null,
            description: 'Logout realizado',
        });

        return res.json(utils.jsonMount(true, {}, 'Logout registrado'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/auth/logout'));
    }
});

module.exports = rota;
