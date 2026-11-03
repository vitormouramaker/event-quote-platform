const { postgres } = require('../server/connect');

let ensureAuditLogsTablePromise = null;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAuditValue(value, depth = 0) {
    if (value == null) return value;
    if (depth > 5) return '[MAX_DEPTH]';

    if (typeof value === 'string') {
        if (value.length > 4000) return `${value.slice(0, 4000)}...[TRUNCATED]`;
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
        return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
    }

    if (isPlainObject(value)) {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (/password|token|authorization|password_hash/i.test(key)) {
                out[key] = '[REDACTED]';
                continue;
            }
            out[key] = sanitizeAuditValue(item, depth + 1);
        }
        return out;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function buildChanges(beforeValue, afterValue) {
    if (!isPlainObject(beforeValue) || !isPlainObject(afterValue)) return null;

    const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
    const changes = [];

    for (const key of keys) {
        const before = beforeValue[key];
        const after = afterValue[key];
        const beforeJson = JSON.stringify(before);
        const afterJson = JSON.stringify(after);
        if (beforeJson === afterJson) continue;
        changes.push({
            field: key,
            before: sanitizeAuditValue(before),
            after: sanitizeAuditValue(after),
        });
    }

    return changes.length ? changes : null;
}

async function ensureAuditLogsTable() {
    if (ensureAuditLogsTablePromise) return ensureAuditLogsTablePromise;

    ensureAuditLogsTablePromise = (async () => {
        const client = await postgres.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    actor_user_id TEXT NULL,
                    actor_name TEXT NULL,
                    actor_role TEXT NULL,
                    action TEXT NOT NULL,
                    entity_type TEXT NULL,
                    entity_id TEXT NULL,
                    description TEXT NULL,
                    http_method TEXT NULL,
                    route_path TEXT NULL,
                    status_code INT NULL,
                    success BOOLEAN NULL,
                    duration_ms INT NULL,
                    ip_address TEXT NULL,
                    user_agent TEXT NULL,
                    before_data JSONB NULL,
                    after_data JSONB NULL,
                    changes JSONB NULL,
                    metadata JSONB NULL,
                    request_body JSONB NULL,
                    query_params JSONB NULL
                );
            `);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_name ON audit_logs (actor_name)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type)`);
        } finally {
            client.release();
        }
    })();

    return ensureAuditLogsTablePromise;
}

async function insertAuditLog(entry) {
    await ensureAuditLogsTable();

    const beforeData = sanitizeAuditValue(entry.before_data ?? null);
    const afterData = sanitizeAuditValue(entry.after_data ?? null);
    const metadata = sanitizeAuditValue(entry.metadata ?? null);
    const requestBody = sanitizeAuditValue(entry.request_body ?? null);
    const queryParams = sanitizeAuditValue(entry.query_params ?? null);
    const changes = entry.changes ?? buildChanges(beforeData, afterData);

    const client = await postgres.connect();
    try {
        await client.query(
            `
            INSERT INTO audit_logs (
                actor_user_id, actor_name, actor_role,
                action, entity_type, entity_id, description,
                http_method, route_path, status_code, success, duration_ms,
                ip_address, user_agent,
                before_data, after_data, changes, metadata, request_body, query_params
            ) VALUES (
                $1, $2, $3,
                $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14,
                $15, $16, $17, $18, $19, $20
            )
            `,
            [
                entry.actor_user_id ?? null,
                entry.actor_name ?? null,
                entry.actor_role ?? null,
                entry.action || 'request',
                entry.entity_type ?? null,
                entry.entity_id ?? null,
                entry.description ?? null,
                entry.http_method ?? null,
                entry.route_path ?? null,
                Number.isFinite(Number(entry.status_code)) ? Number(entry.status_code) : null,
                typeof entry.success === 'boolean' ? entry.success : null,
                Number.isFinite(Number(entry.duration_ms)) ? Number(entry.duration_ms) : null,
                entry.ip_address ?? null,
                entry.user_agent ?? null,
                beforeData ? JSON.stringify(beforeData) : null,
                afterData ? JSON.stringify(afterData) : null,
                changes ? JSON.stringify(changes) : null,
                metadata ? JSON.stringify(metadata) : null,
                requestBody ? JSON.stringify(requestBody) : null,
                queryParams ? JSON.stringify(queryParams) : null,
            ],
        );
    } finally {
        client.release();
    }
}

function parseBooleanFilter(value) {
    if (value === undefined || value === null || value === '') return null;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return null;
}

async function listAuditLogs(rawFilters = {}) {
    await ensureAuditLogsTable();

    const page = Math.max(Number(rawFilters.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(rawFilters.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const values = [];
    const conditions = [];

    const search = typeof rawFilters.search === 'string' ? rawFilters.search.trim() : '';
    if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        conditions.push(`(
            COALESCE(actor_name, '') ILIKE $${idx}
            OR COALESCE(action, '') ILIKE $${idx}
            OR COALESCE(description, '') ILIKE $${idx}
            OR COALESCE(entity_type, '') ILIKE $${idx}
            OR COALESCE(entity_id, '') ILIKE $${idx}
        )`);
    }

    const actor = typeof rawFilters.actor === 'string' ? rawFilters.actor.trim() : '';
    if (actor) {
        values.push(`%${actor}%`);
        conditions.push(`COALESCE(actor_name, '') ILIKE $${values.length}`);
    }

    const action = typeof rawFilters.action === 'string' ? rawFilters.action.trim() : '';
    if (action) {
        values.push(`%${action}%`);
        conditions.push(`COALESCE(action, '') ILIKE $${values.length}`);
    }

    const entityType = typeof rawFilters.entityType === 'string' ? rawFilters.entityType.trim() : '';
    if (entityType) {
        values.push(entityType);
        conditions.push(`entity_type = $${values.length}`);
    }

    const method = typeof rawFilters.method === 'string' ? rawFilters.method.trim().toUpperCase() : '';
    if (method) {
        values.push(method);
        conditions.push(`http_method = $${values.length}`);
    }

    const success = parseBooleanFilter(rawFilters.success);
    if (success !== null) {
        values.push(success);
        conditions.push(`success = $${values.length}`);
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof rawFilters.startDate === 'string' && datePattern.test(rawFilters.startDate)) {
        values.push(rawFilters.startDate);
        conditions.push(`created_at >= $${values.length}::date`);
    }
    if (typeof rawFilters.endDate === 'string' && datePattern.test(rawFilters.endDate)) {
        values.push(rawFilters.endDate);
        conditions.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const client = await postgres.connect();
    try {
        const countSql = `SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`;
        const rowsSql = `
            SELECT
                id,
                created_at,
                actor_user_id,
                actor_name,
                actor_role,
                action,
                entity_type,
                entity_id,
                description,
                http_method,
                route_path,
                status_code,
                success,
                duration_ms,
                ip_address,
                user_agent,
                before_data,
                after_data,
                changes,
                metadata,
                request_body,
                query_params
            FROM audit_logs
            ${whereClause}
            ORDER BY created_at DESC, id DESC
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
        `;

        const [countRet, rowsRet] = await Promise.all([
            client.query(countSql, values),
            client.query(rowsSql, [...values, pageSize, offset]),
        ]);

        return {
            items: rowsRet.rows || [],
            page,
            pageSize,
            total: countRet.rows?.[0]?.total || 0,
        };
    } finally {
        client.release();
    }
}

module.exports = {
    ensureAuditLogsTable,
    insertAuditLog,
    listAuditLogs,
    sanitizeAuditValue,
    buildChanges,
};

