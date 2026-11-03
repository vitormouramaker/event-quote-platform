const security = require('../security/auth');
const auditLogs = require('../services/audit_logs');

function attachAudit(req, patch = {}) {
    req.audit = {
        ...(req.audit || {}),
        ...patch,
    };
}

function deriveSuccessFromResponseBody(body) {
    if (!body || typeof body !== 'object') return null;

    if (typeof body.boleano === 'boolean') return body.boleano;

    if (body.payload) {
        const decoded = security.jwtdecript(body);
        if (decoded && typeof decoded.boleano === 'boolean') return decoded.boleano;
    }

    return null;
}

function buildRoutePath(req) {
    const routePath = req.route?.path || req.path || '';
    const baseUrl = req.baseUrl || '';
    return `${baseUrl}${routePath}`;
}

function auditTrailMiddleware(req, res, next) {
    if (req.path === '/health') {
        return next();
    }

    req.audit = {
        startedAtMs: Date.now(),
        skip: false,
    };

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        req.audit.responseBody = body;
        return originalJson(body);
    };

    res.on('finish', () => {
        const meta = req.audit || {};
        if (meta.skip) return;

        const actor = req.user || {};
        const durationMs = Math.max(Date.now() - (meta.startedAtMs || Date.now()), 0);
        const derivedSuccess = deriveSuccessFromResponseBody(meta.responseBody);
        const success = typeof meta.success === 'boolean'
            ? meta.success
            : (derivedSuccess !== null ? derivedSuccess : res.statusCode < 400);

        const action = meta.action || `${req.method} ${buildRoutePath(req)}`;

        const entry = {
            actor_user_id: meta.actor_user_id ?? actor.id ?? null,
            actor_name: meta.actor_name ?? actor.name ?? req.body?.login ?? null,
            actor_role: meta.actor_role ?? actor.role ?? null,
            action,
            entity_type: meta.entity_type ?? null,
            entity_id: meta.entity_id ?? null,
            description: meta.description ?? null,
            http_method: req.method,
            route_path: buildRoutePath(req),
            status_code: res.statusCode,
            success,
            duration_ms: durationMs,
            ip_address: req.ip || req.headers['x-forwarded-for'] || null,
            user_agent: req.headers['user-agent'] || null,
            before_data: meta.before_data,
            after_data: meta.after_data,
            changes: meta.changes,
            metadata: {
                ...(meta.metadata || {}),
                responseMessage: meta.response_message || undefined,
            },
            request_body: req.method === 'GET' ? null : req.body,
            query_params: req.query,
        };

        auditLogs.insertAuditLog(entry).catch((err) => {
            console.error('[AUDIT] Erro ao gravar log:', err.message || err);
        });
    });

    next();
}

module.exports = {
    auditTrailMiddleware,
    attachAudit,
};

