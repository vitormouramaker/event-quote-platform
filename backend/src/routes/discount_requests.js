const express  = require('express');
const rota     = express.Router();
const execute  = require('../services/execute_web');
const security = require('../security/auth');
const utils    = require('../utils/templates');
const multer   = require('multer');
const path     = require('path');
const storage  = require('../services/bunny_storage');

/** Orcamento do pedido, se o usuario puder ve-lo; senao null. */
async function accessibleBudget(user, budgetId) {
    if (!budgetId) return null;
    const budget = await execute.execute_get_budget_by_id(budgetId);
    return budget && security.canAccessBudget(user, budget) ? budget : null;
}

/**
 * Quem aprova (ou ve todos os orcamentos) enxerga a fila inteira. O consultor
 * so ve os pedidos dos orcamentos dele.
 */
async function filterRowsForUser(user, rows) {
    if (security.canApproveDiscounts(user) || security.canViewAllBudgets(user)) return rows;
    const own = await execute.execute_get_budgets_by_user(user.id);
    const ids = new Set(own.map((b) => String(b.id)));
    return rows.filter((r) => ids.has(String(r.budget_id)));
}

// ---- Configuração do Multer (memória — sem gravar em disco) ----
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido. Use PDF, DOC, DOCX, JPG, PNG, XLSX ou XLS.'));
  },
});

// GET /web/discounts
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        const rows = await filterRowsForUser(req.user, await execute.execute_get_discount_requests());
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts GET')); }
});

// GET /web/discounts/budget/:budgetId
rota.get('/budget/:budgetId', security.authMiddleware, async (req, res) => {
    try {
        if (!(await accessibleBudget(req.user, req.params.budgetId))) {
            return security.deny(res, 'Você não pode ver este orçamento');
        }
        const rows = await execute.execute_get_discount_by_budget(req.params.budgetId);
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/budget GET')); }
});

// POST /web/discounts — multipart/form-data (com ou sem anexo)
rota.post('/', security.authMiddleware, upload.single('attachment'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (!(await accessibleBudget(req.user, data.budgetId))) {
            return security.deny(res, 'Você não pode pedir desconto neste orçamento');
        }
        // Quem pede e sempre quem esta logado (o campo do formulario nao vale).
        data.requestedBy = req.user.name;
        if (req.file) {
            const fileUrl = await storage.uploadFile(req.file.buffer, req.file.originalname);
            data.attachmentName = req.file.originalname;
            data.attachmentUrl  = fileUrl;
        }
        const row = await execute.execute_create_discount_request(data);
        return res.json(utils.jsonMount(true, row, 'Solicitação enviada!'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts POST')); }
});

// ---- ITEM DISCOUNT REQUESTS ----

// GET /web/discounts/items — todas as solicitações de item (para Aprovações)
rota.get('/items', security.authMiddleware, async (req, res) => {
    try {
        const rows = await filterRowsForUser(req.user, await execute.execute_get_all_item_requests());
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/items GET all')); }
});

// GET /web/discounts/items/budget/:budgetId
rota.get('/items/budget/:budgetId', security.authMiddleware, async (req, res) => {
    try {
        if (!(await accessibleBudget(req.user, req.params.budgetId))) {
            return security.deny(res, 'Você não pode ver este orçamento');
        }
        const rows = await execute.execute_get_item_requests_by_budget(req.params.budgetId);
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/items GET')); }
});

// POST /web/discounts/items — multipart/form-data (com ou sem anexo)
rota.post('/items', security.authMiddleware, upload.single('attachment'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (!(await accessibleBudget(req.user, data.budgetId))) {
            return security.deny(res, 'Você não pode pedir desconto neste orçamento');
        }
        data.requestedBy = req.user.name;
        if (req.file) {
            const fileUrl = await storage.uploadFile(req.file.buffer, req.file.originalname);
            data.attachmentName = req.file.originalname;
            data.attachmentUrl  = fileUrl;
        }
        const row = await execute.execute_create_item_request(data);
        return res.json(utils.jsonMount(true, row, 'Solicitação enviada!'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/items POST')); }
});

// PATCH /web/discounts/items/status
rota.patch('/items/status', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canApproveDiscounts(req.user)) {
            return security.deny(res, 'Você não pode aprovar descontos');
        }
        const {
            budgetId, eventId, itemId, status, observation,
            newDiscountPercent, newDiscountAmount,
        } = req.body;
        const row = await execute.execute_update_item_request_status(
            budgetId, eventId, itemId, status, req.user.name, observation,
            newDiscountPercent, newDiscountAmount
        );
        return res.json(utils.jsonMount(true, row, status === 'APPROVED' ? 'Item aprovado!' : 'Item rejeitado!'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/items PATCH status')); }
});

// PATCH /web/discounts/:id/status
// Mantida abaixo das rotas /items/* para evitar conflito do Express
rota.patch('/:id/status', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canApproveDiscounts(req.user)) {
            return security.deny(res, 'Você não pode aprovar descontos');
        }
        const { status, observation, newDiscountPercent, newDiscountValue } = req.body;
        const row = await execute.execute_update_discount_status(
            req.params.id, status, req.user.name, observation,
            newDiscountPercent, newDiscountValue
        );
        return res.json(utils.jsonMount(true, row, status === 'APPROVED' ? 'Aprovado!' : 'Rejeitado!'));
    } catch (error) { return res.json(utils.errorHandle(error, `/discounts PATCH status`)); }
});

// DELETE /web/discounts/items (?budgetId=&eventId=&itemId= ou no corpo)
// O front manda na query string; ler so do corpo fazia a exclusao falhar.
rota.delete('/items', security.authMiddleware, async (req, res) => {
    try {
        const source = req.body && req.body.budgetId ? req.body : req.query;
        const { budgetId, eventId, itemId } = source || {};
        if (!budgetId || !eventId || !itemId) {
            return res.json(utils.jsonMount(false, {}, 'budgetId, eventId e itemId são obrigatórios'));
        }
        if (!(await accessibleBudget(req.user, budgetId))) {
            return security.deny(res, 'Você não pode alterar este orçamento');
        }
        await execute.execute_delete_item_request(budgetId, eventId, itemId);
        return res.json(utils.jsonMount(true, {}, 'Solicitação removida!'));
    } catch (error) { return res.json(utils.errorHandle(error, '/discounts/items DELETE')); }
});

module.exports = rota;
