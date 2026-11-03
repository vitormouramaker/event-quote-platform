const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

// O segredo vem SEMPRE do ambiente. Sem ele a API nao sobe: um segredo padrao
// no codigo permitiria a qualquer um forjar tokens.
const JWT_SECRET = String(process.env.JWT_SECRET || '');
if (JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente ou curto (minimo 32 caracteres). Veja backend/.env.example.');
}

// Duas finalidades diferentes para o mesmo segredo: o token de sessao e o
// envelope assinado das respostas. A audiencia separa as duas, para que uma
// resposta assinada (por exemplo a do demonstrativo publico) nunca sirva de
// token de acesso.
const AUD_SESSION  = 'session';
const AUD_RESPONSE = 'response';

const BCRYPT_ROUNDS = 10;

/** Hash de senha novo (bcrypt). */
function hashPassword(password) {
    return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

function isBcryptHash(hash) {
    return typeof hash === 'string' && /^\$2[aby]\$\d{2}\$/.test(hash);
}

function isLegacyMd5Hash(hash) {
    return typeof hash === 'string' && /^[a-f0-9]{32}$/i.test(hash);
}

/**
 * Confere a senha. Aceita o hash legado (MD5 sem sal) so para poder migrar:
 * quem acerta a senha com hash antigo recebe `needsRehash` e o login regrava
 * o hash em bcrypt na hora.
 */
function verifyPassword(password, hash) {
    if (isBcryptHash(hash)) {
        return { ok: bcrypt.compareSync(String(password), hash), needsRehash: false };
    }
    if (isLegacyMd5Hash(hash)) {
        const calc = Buffer.from(crypto.createHash('md5').update(String(password)).digest('hex'));
        const saved = Buffer.from(String(hash).toLowerCase());
        const ok = calc.length === saved.length && crypto.timingSafeEqual(calc, saved);
        return { ok, needsRehash: ok };
    }
    return { ok: false, needsRehash: false };
}

// Envelope assinado das respostas (padrao do projeto: o front le o payload).
function jwtencript(obj) {
    return jwt.sign(obj, JWT_SECRET, { expiresIn: '3d', audience: AUD_RESPONSE });
}

// Le um envelope de resposta.
function jwtdecript(payload) {
    try {
        return jwt.verify(payload.payload, JWT_SECRET, { audience: AUD_RESPONSE });
    } catch (err) {
        return null;
    }
}

/** Token de sessao: so a identidade. Papel e permissoes sao lidos do banco. */
function signSessionToken(user) {
    return jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, {
        expiresIn: '3d',
        audience: AUD_SESSION,
    });
}

// Middleware de autenticacao para rotas protegidas.
//
// O token so prova QUEM e o usuario. Papel, permissoes e se a conta continua
// ativa sao lidos do banco a cada requisicao: desativar alguem ou tirar uma
// permissao vale na hora, sem esperar o token vencer.
async function authMiddleware(req, res, next) {
    const utils = require('../utils/templates');
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.json(utils.jsonMount(false, {}, 'Não autorizado'));
    }
    let claims;
    try {
        claims = jwt.verify(auth.split(' ')[1], JWT_SECRET, { audience: AUD_SESSION });
    } catch {
        return res.json(utils.jsonMount(false, {}, 'Token inválido ou expirado'));
    }
    if (!claims || !claims.id) {
        return res.json(utils.jsonMount(false, {}, 'Token inválido ou expirado'));
    }

    try {
        const { postgres } = require('../server/connect');
        const ret = await postgres.query(
            `SELECT id, name, login, role, active,
                    perm_create_budget, perm_edit_budget, perm_delete_budget,
                    perm_view_all_budgets, perm_approve_discounts,
                    perm_approve_edit_requests, perm_manage_users,
                    COALESCE(perm_view_dashboard, false) AS perm_view_dashboard,
                    COALESCE(perm_view_logs, false)      AS perm_view_logs
               FROM users WHERE id::text = $1`,
            [String(claims.id)],
        );
        const user = ret.rows[0];
        if (!user || user.active !== true) {
            return res.json(utils.jsonMount(false, {}, 'Token inválido ou expirado'));
        }
        req.user = user;
    } catch (err) {
        return res.json(utils.errorHandle(err, 'authMiddleware'));
    }

    if (isBudgetAnalyst(req.user)) {
        const fullPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
        // Analista é somente-leitura: pode fazer QUALQUER GET (para visualizar o
        // orçamento por completo — eventos, itens, cidades, descontos, etc.).
        // Além disso pode fazer logout e enviar/consultar devolutivas do orçamento.
        const isReadOnly = req.method === 'GET';
        const canLogout = req.method === 'POST' && fullPath === '/web/auth/logout';
        const isBudgetReviewWrite =
            (req.method === 'POST' || req.method === 'PUT') &&
            /^\/web\/budget-reviews(\/|$)/.test(fullPath);
        if (!isReadOnly && !canLogout && !isBudgetReviewWrite) {
            return deny(res, 'Perfil analista orçamento possui acesso somente leitura aos orçamentos');
        }
    }
    return next();
}

function isAdmin(user) {
    return user?.role === 'ADM_MASTER' || user?.role === 'ADM_GERENTE';
}

function isMaster(user) {
    return user?.role === 'ADM_MASTER';
}

function isBudgetAnalyst(user) {
    return user?.role === 'ADM_ANALISTA_ORCAMENTO';
}

function canViewAllBudgets(user) {
    return isAdmin(user) || isBudgetAnalyst(user) || user?.perm_view_all_budgets === true;
}

function canCreateBudget(user) {
    return !isBudgetAnalyst(user) && (isAdmin(user) || user?.perm_create_budget === true);
}

function canEditBudget(user) {
    return !isBudgetAnalyst(user) && (
        isAdmin(user) ||
        user?.role === 'ADM_ORCAMENTO' ||
        user?.perm_edit_budget === true
    );
}

function canDeleteBudget(user) {
    return !isBudgetAnalyst(user) && (isAdmin(user) || user?.perm_delete_budget === true);
}

function canArchiveBudget(user) {
    return isAdmin(user);
}

function canManageUsers(user) {
    return user?.role === 'ADM_MASTER' || user?.perm_manage_users === true;
}

function canViewDashboard(user) {
    return isAdmin(user) || user?.perm_view_dashboard === true;
}

function canViewLogs(user) {
    return isAdmin(user) || user?.perm_view_logs === true;
}

function canApproveDiscounts(user) {
    return isAdmin(user) || user?.perm_approve_discounts === true;
}

function canApproveEditRequests(user) {
    return isAdmin(user) || user?.perm_approve_edit_requests === true;
}

function canAccessBudget(user, budget) {
    if (!user || !budget) return false;
    if (canViewAllBudgets(user)) return true;
    return String(budget.created_by_user_id || '') === String(user.id || '');
}

function deny(res, message = 'Acesso negado') {
    const utils = require('../utils/templates');
    return res.status(403).json(utils.jsonMount(false, {}, message));
}

/**
 * Catalogo base (itens, eventos, auditorios, cidades, sub-itens): todo mundo
 * logado le, so o administrador escreve. A tela ja escondia o menu; a API agora
 * confere tambem.
 */
function requireCatalogWrite(req, res, next) {
    // Leitura: a propria rota ja exige login.
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return authMiddleware(req, res, () => {
        if (isAdmin(req.user)) return next();
        return deny(res, 'Somente administradores alteram o catálogo');
    });
}

module.exports = {
    hashPassword,
    verifyPassword,
    jwtencript,
    jwtdecript,
    signSessionToken,
    authMiddleware,
    isAdmin,
    isMaster,
    isBudgetAnalyst,
    canViewAllBudgets,
    canCreateBudget,
    canEditBudget,
    canDeleteBudget,
    canArchiveBudget,
    canManageUsers,
    canViewDashboard,
    canViewLogs,
    canApproveDiscounts,
    canApproveEditRequests,
    canAccessBudget,
    deny,
    requireCatalogWrite,
};
