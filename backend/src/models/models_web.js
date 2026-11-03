// Queries SQL puras — padrão do projeto
const models = {

    // AUTH
    login: () => `
        SELECT
            u.id,
            u.name,
            u.login,
            u.role,
            u.active,
            u.perm_create_budget,
            u.perm_edit_budget,
            u.perm_delete_budget,
            u.perm_view_all_budgets,
            u.perm_approve_discounts,
            u.perm_approve_edit_requests,
            u.perm_manage_users,
            COALESCE(u.perm_view_dashboard, false) AS perm_view_dashboard,
            COALESCE(u.perm_view_logs, false)      AS perm_view_logs,
            u.password_hash
        FROM users u
        WHERE u.login = $1
          AND u.active = true
    `,

    // Troca o hash legado (MD5) por bcrypt no primeiro login bem-sucedido.
    update_password_hash: () => `
        UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2
    `,

    // USERS — CRUD
    get_all_users: () => `
        SELECT
            id, name, login, role, active, created_at,
            perm_create_budget, perm_edit_budget, perm_delete_budget,
            perm_view_all_budgets, perm_approve_discounts,
            perm_approve_edit_requests, perm_manage_users,
            COALESCE(perm_view_dashboard, false) AS perm_view_dashboard,
            COALESCE(perm_view_logs, false)      AS perm_view_logs
        FROM users
        ORDER BY created_at DESC
    `,

    create_user: () => `
        INSERT INTO users (
            name, login, password_hash, role, active,
            perm_create_budget, perm_edit_budget, perm_delete_budget,
            perm_view_all_budgets, perm_approve_discounts,
            perm_approve_edit_requests, perm_manage_users,
            perm_view_dashboard, perm_view_logs
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING id, name, login, role, active, created_at
    `,

    update_user: () => `
        UPDATE users SET
            name                       = $1,
            login                      = $2,
            password_hash              = $3,
            role                       = $4,
            active                     = $5,
            perm_create_budget         = $6,
            perm_edit_budget           = $7,
            perm_delete_budget         = $8,
            perm_view_all_budgets      = $9,
            perm_approve_discounts     = $10,
            perm_approve_edit_requests = $11,
            perm_manage_users          = $12,
            perm_view_dashboard        = $13,
            perm_view_logs             = $14,
            updated_at                 = NOW()
        WHERE id = $15
        RETURNING id, name, login, role, active
    `,

    update_user_no_password: () => `
        UPDATE users SET
            name                       = $1,
            login                      = $2,
            role                       = $3,
            active                     = $4,
            perm_create_budget         = $5,
            perm_edit_budget           = $6,
            perm_delete_budget         = $7,
            perm_view_all_budgets      = $8,
            perm_approve_discounts     = $9,
            perm_approve_edit_requests = $10,
            perm_manage_users          = $11,
            perm_view_dashboard        = $12,
            perm_view_logs             = $13,
            updated_at                 = NOW()
        WHERE id = $14
        RETURNING id, name, login, role, active
    `,

    delete_user: () => `
        DELETE FROM users WHERE id = $1
    `,

    // BUDGETS — CRUD
    get_all_budgets: () => `
        SELECT
            b.*,
            (SELECT COUNT(*) FROM discount_requests dr
             WHERE dr.budget_id = b.id AND dr.status = 'PENDING')      AS pending_discounts,
            (SELECT COUNT(*) FROM item_discount_requests ir
             WHERE ir.budget_id = b.id AND ir.status = 'PENDING')      AS pending_item_discounts,
            (SELECT COUNT(*) FROM edit_requests er
             WHERE er.budget_id = b.id AND er.status = 'PENDING')      AS pending_edits
        FROM budgets b
        ORDER BY b.created_at DESC
    `,

    get_budgets_by_user: () => `
        SELECT b.*, u.name AS creator_name
        FROM budgets b
        LEFT JOIN users u ON u.id = b.created_by_user_id
        WHERE b.created_by_user_id = $1
        ORDER BY b.created_at DESC
    `,

    get_budget_by_id: () => `
        SELECT b.*, u.name AS creator_name
        FROM budgets b
        LEFT JOIN users u ON u.id = b.created_by_user_id
        WHERE b.id = $1
    `,

    // Demonstrativo público (link read-only para o cliente).
    get_budget_by_share_token: () => `
        SELECT b.*, u.name AS creator_name
        FROM budgets b
        LEFT JOIN users u ON u.id = b.created_by_user_id
        WHERE b.share_token = $1
    `,

    set_budget_share_token: () => `
        UPDATE budgets SET share_token = $2 WHERE id = $1 RETURNING share_token
    `,

    create_budget: () => `
        INSERT INTO budgets (
            instituicao, curso, comissao, telefone, controle,
            observation, total_value, original_total_value, deficit_value,
            discount_percent, approved_item_discounts, form_data,
            status, is_locked, created_by_user_id, created_by_name,
            budget_code, discount_mode, discount_amount,
            approved_item_discount_amounts
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19,
            $20
        )
        RETURNING *
    `,

    update_budget: () => `
        UPDATE budgets SET
            instituicao              = $1,
            curso                    = $2,
            comissao                 = $3,
            telefone                 = $4,
            controle                 = $5,
            observation              = $6,
            total_value              = $7,
            original_total_value     = $8,
            deficit_value            = $9,
            discount_percent         = $10,
            approved_item_discounts  = $11,
            form_data                = $12,
            status                   = $13,
            is_locked                = $14,
            discount_mode            = $16,
            discount_amount          = $17,
            approved_item_discount_amounts = $18,
            approved_at              = CASE
                WHEN $13 = 'APPROVED' THEN COALESCE(approved_at, NOW())
                ELSE approved_at
            END,
            updated_at               = NOW()
        WHERE id = $15
        RETURNING *
    `,

    update_budget_lock: () => `
        UPDATE budgets SET is_locked = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, is_locked
    `,

    archive_budget: () => `
        UPDATE budgets SET
            archived_at         = NOW(),
            archived_by_user_id = $1,
            archived_by_name    = $2,
            updated_at          = NOW()
        WHERE id = $3
        RETURNING id, archived_at, archived_by_user_id, archived_by_name
    `,

    unarchive_budget: () => `
        UPDATE budgets SET
            archived_at         = NULL,
            archived_by_user_id = NULL,
            archived_by_name    = NULL,
            updated_at          = NOW()
        WHERE id = $1
        RETURNING id, archived_at
    `,

    update_budget_status: () => `
        UPDATE budgets SET
            status = $1,
            observation = $2,
            is_locked = CASE
                WHEN $4 IN ('APPROVED', 'SENT_FOR_APPROVAL') THEN true
                WHEN $4 = 'PENDING' THEN false
                ELSE is_locked
            END,
            approved_at = CASE
                WHEN $4 = 'APPROVED' THEN NOW()
                ELSE approved_at
            END,
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, status, is_locked, total_value, original_total_value, approved_at
    `,

    delete_budget: () => `
        DELETE FROM budgets WHERE id = $1
    `,

    // DISCOUNT REQUESTS (Global)
    get_discount_requests: () => `
        SELECT * FROM discount_requests ORDER BY requested_at DESC
    `,

    get_discount_requests_by_budget: () => `
        SELECT * FROM discount_requests WHERE budget_id = $1 ORDER BY requested_at DESC
    `,

    create_discount_request: () => `
        INSERT INTO discount_requests (
            budget_id, client_name, total_value, discount_percent,
            discount_value, final_value, requested_by, request_observation, status,
            attachment_name, attachment_url, discount_mode, requested_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11, $12)
        RETURNING *
    `,

    update_discount_request_status: () => `
        UPDATE discount_requests SET
            status               = $1,
            approved_by          = $2,
            approved_at          = NOW(),
            observation          = $3,
            new_discount_percent = $4,
            new_discount_value   = $6
        WHERE id = $5
        RETURNING *
    `,

    // ITEM DISCOUNT REQUESTS
    get_all_item_requests: () => `
        SELECT * FROM item_discount_requests ORDER BY requested_at DESC
    `,

    get_item_requests_by_budget: () => `
        SELECT * FROM item_discount_requests WHERE budget_id = $1 ORDER BY requested_at DESC
    `,

    create_item_request: () => `
        INSERT INTO item_discount_requests (
            budget_id, client_name, event_id, item_id, item_name,
            original_unit_price, requested_percentage, requested_by, reason, status,
            attachment_name, attachment_url, discount_mode, requested_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10, $11, $12, $13)
        ON CONFLICT (budget_id, event_id, item_id, status)
        DO UPDATE SET
            client_name = EXCLUDED.client_name,
            item_name = EXCLUDED.item_name,
            original_unit_price = EXCLUDED.original_unit_price,
            requested_percentage = EXCLUDED.requested_percentage,
            discount_mode = EXCLUDED.discount_mode,
            requested_amount = EXCLUDED.requested_amount,
            requested_by = EXCLUDED.requested_by,
            requested_at = NOW(),
            reason = EXCLUDED.reason,
            approved_by = NULL,
            approved_at = NULL,
            observation = NULL,
            new_discount_percent = NULL,
            new_discount_amount = NULL,
            attachment_name = EXCLUDED.attachment_name,
            attachment_url = EXCLUDED.attachment_url
        RETURNING *
    `,

    update_item_request_status: () => `
        UPDATE item_discount_requests SET
            status               = $1,
            approved_by          = $2,
            approved_at          = NOW(),
            observation          = $3,
            new_discount_percent = $4,
            new_discount_amount  = $8
        WHERE budget_id = $5 AND event_id = $6 AND item_id = $7
        RETURNING *
    `,

    delete_item_request: () => `
        DELETE FROM item_discount_requests
        WHERE budget_id = $1 AND event_id = $2 AND item_id = $3
    `,

    // EDIT REQUESTS
    get_edit_requests: () => `
        SELECT * FROM edit_requests ORDER BY requested_at DESC
    `,

    get_edit_requests_by_budget: () => `
        SELECT * FROM edit_requests WHERE budget_id = $1 ORDER BY requested_at DESC
    `,

    create_edit_request: () => `
        INSERT INTO edit_requests (budget_id, client_name, requested_by, reason, status)
        VALUES ($1, $2, $3, $4, 'PENDING')
        RETURNING *
    `,

    update_edit_request_status: () => `
        UPDATE edit_requests SET
            status      = $1,
            approved_by = $2,
            approved_at = NOW(),
            observation = $3
        WHERE id = $4
        RETURNING *
    `,

    // DASHBOARD
    get_dashboard_metrics_admin: () => `
        SELECT
            (SELECT COUNT(*)::int FROM budgets) AS total_budgets,
            (SELECT COUNT(*)::int FROM budgets WHERE status = 'PENDING') AS pending_budgets,
            (SELECT COUNT(*)::int FROM budgets WHERE status = 'APPROVED') AS approved_budgets,
            (SELECT COUNT(*)::int FROM budgets WHERE status = 'CANCELLED') AS cancelled_budgets,
            (SELECT COUNT(*)::int FROM budgets WHERE is_locked = true) AS locked_budgets,
            (SELECT COALESCE(SUM(total_value), 0) FROM budgets) AS total_budget_value,
            (SELECT COALESCE(AVG(total_value), 0) FROM budgets) AS avg_budget_value,
            (SELECT COUNT(*)::int FROM discount_requests WHERE status = 'PENDING') AS pending_discount_requests,
            (SELECT COUNT(*)::int FROM item_discount_requests WHERE status = 'PENDING') AS pending_item_discount_requests,
            (SELECT COUNT(*)::int FROM edit_requests WHERE status = 'PENDING') AS pending_edit_requests,
            (SELECT COUNT(*)::int FROM users WHERE active = true) AS active_users
    `,

    get_dashboard_metrics_by_user: () => `
        SELECT
            (SELECT COUNT(*)::int FROM budgets b WHERE b.created_by_user_id = $1) AS total_budgets,
            (SELECT COUNT(*)::int FROM budgets b WHERE b.created_by_user_id = $1 AND b.status = 'PENDING') AS pending_budgets,
            (SELECT COUNT(*)::int FROM budgets b WHERE b.created_by_user_id = $1 AND b.status = 'APPROVED') AS approved_budgets,
            (SELECT COUNT(*)::int FROM budgets b WHERE b.created_by_user_id = $1 AND b.status = 'CANCELLED') AS cancelled_budgets,
            (SELECT COUNT(*)::int FROM budgets b WHERE b.created_by_user_id = $1 AND b.is_locked = true) AS locked_budgets,
            (SELECT COALESCE(SUM(b.total_value), 0) FROM budgets b WHERE b.created_by_user_id = $1) AS total_budget_value,
            (SELECT COALESCE(AVG(b.total_value), 0) FROM budgets b WHERE b.created_by_user_id = $1) AS avg_budget_value,
            (
                SELECT COUNT(*)::int
                FROM discount_requests dr
                JOIN budgets b ON b.id = dr.budget_id
                WHERE dr.status = 'PENDING' AND b.created_by_user_id = $1
            ) AS pending_discount_requests,
            (
                SELECT COUNT(*)::int
                FROM item_discount_requests ir
                JOIN budgets b ON b.id = ir.budget_id
                WHERE ir.status = 'PENDING' AND b.created_by_user_id = $1
            ) AS pending_item_discount_requests,
            (
                SELECT COUNT(*)::int
                FROM edit_requests er
                JOIN budgets b ON b.id = er.budget_id
                WHERE er.status = 'PENDING' AND b.created_by_user_id = $1
            ) AS pending_edit_requests,
            NULL::int AS active_users
    `,

    get_dashboard_status_breakdown_admin: () => `
        SELECT status, COUNT(*)::int AS count
        FROM budgets
        GROUP BY status
        ORDER BY status
    `,

    get_dashboard_status_breakdown_by_user: () => `
        SELECT status, COUNT(*)::int AS count
        FROM budgets
        WHERE created_by_user_id = $1
        GROUP BY status
        ORDER BY status
    `,

    get_dashboard_monthly_budgets_admin: () => `
        SELECT
            TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month_key,
            TO_CHAR(DATE_TRUNC('month', created_at), 'MM/YYYY') AS month_label,
            COUNT(*)::int AS budget_count,
            COALESCE(SUM(total_value), 0) AS total_value
        FROM budgets
        WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
    `,

    get_dashboard_monthly_budgets_by_user: () => `
        SELECT
            TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month_key,
            TO_CHAR(DATE_TRUNC('month', created_at), 'MM/YYYY') AS month_label,
            COUNT(*)::int AS budget_count,
            COALESCE(SUM(total_value), 0) AS total_value
        FROM budgets
        WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
          AND created_by_user_id = $1
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
    `,

    get_dashboard_recent_budgets_admin: () => `
        SELECT
            b.id,
            b.instituicao,
            b.curso,
            b.comissao,
            b.status,
            b.is_locked,
            b.total_value,
            b.created_at,
            b.created_by_name
        FROM budgets b
        ORDER BY b.created_at DESC
        LIMIT 50
    `,

    get_dashboard_recent_budgets_by_user: () => `
        SELECT
            b.id,
            b.instituicao,
            b.curso,
            b.comissao,
            b.status,
            b.is_locked,
            b.total_value,
            b.created_at,
            b.created_by_name
        FROM budgets b
        WHERE b.created_by_user_id = $1
        ORDER BY b.created_at DESC
        LIMIT 50
    `,

    // ---- ITEMS ----
    get_all_items: () => `
        SELECT DISTINCT ON (REGEXP_REPLACE(LOWER(TRIM(name)), E'\\s+', ' ', 'g')) *
        FROM items
        ORDER BY
            REGEXP_REPLACE(LOWER(TRIM(name)), E'\\s+', ' ', 'g') ASC,
            CASE WHEN slug IS NOT NULL THEN 0 ELSE 1 END ASC,
            CASE WHEN legacy_item_id IS NOT NULL THEN 0 ELSE 1 END ASC,
            id ASC
    `,

    get_all_catalog_selectors: () => `
        SELECT slug, label, options
        FROM catalog_selectors
        ORDER BY label ASC, slug ASC
    `,

    get_all_legacy_aliases: () => `
        SELECT alias_type, legacy_key, canonical_slug, notes
        FROM legacy_aliases
        ORDER BY alias_type ASC, legacy_key ASC
    `,

    get_item_by_id: () => `
        SELECT * FROM items WHERE id = $1
    `,

    create_item: () => `
        INSERT INTO items (legacy_item_id, name, unit_price, default_quantity, editable, dynamic_by_students, has_subitems, subitems, variations, has_additional, additional_quantity, has_multiplier, multiplier_quantity, value_visible_to_client)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14)
        RETURNING *
    `,

    update_item: () => `
        UPDATE items SET
            legacy_item_id          = $1,
            name                    = $2,
            unit_price              = $3,
            default_quantity        = $4,
            editable                = $5,
            dynamic_by_students     = $6,
            has_subitems            = $7,
            subitems                = $8::jsonb,
            variations              = $9::jsonb,
            has_additional          = $10,
            additional_quantity     = $11,
            has_multiplier          = $12,
            multiplier_quantity     = $13,
            value_visible_to_client = $14,
            updated_at              = NOW()
        WHERE id = $15
        RETURNING *
    `,

    delete_item: () => `
        DELETE FROM items WHERE id = $1
    `,

    // ---- EVENT TEMPLATES ----
    get_all_event_templates: () => `
        SELECT
            et.id::text AS db_id,
            COALESCE(et.legacy_event_id, et.id::text) AS id,
            et.legacy_event_id,
            et.slug,
            et.name,
            et.city,
            et.type,
            et.value,
            et.has_administration,
            et.unit_price_editable,
            et.requires_min_events,
            et.closes_summary_block,
            et.summary_block_label,
            et.group_id,
            et.created_at,
            et.updated_at,
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'id', COALESCE(i.legacy_item_id, i.id::text),
                        'db_id', i.id::text,
                        'legacy_item_id', i.legacy_item_id,
                        'slug', i.slug,
                        'name', i.name,
                        'description', i.description,
                        'unit_price', i.unit_price,
                        'default_quantity', i.default_quantity,
                        'editable', i.editable,
                        'dynamic_by_students', i.dynamic_by_students,
                        'has_subitems', i.has_subitems,
                        'subitems', i.subitems,
                        'variations', i.variations,
                        'has_additional', i.has_additional,
                        'additional_quantity', i.additional_quantity,
                        'has_multiplier', i.has_multiplier,
                        'multiplier_quantity', i.multiplier_quantity,
                        'value_visible_to_client', i.value_visible_to_client,
                        'item_kind', i.item_kind,
                        'category', i.category,
                        'created_at', i.created_at,
                        'updated_at', i.updated_at
                    )
                 )
                 FROM event_template_items eti
                 JOIN items i ON i.id = eti.item_id
                 WHERE eti.event_template_id = et.id),
                '[]'
            ) AS items,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'item_id', etic.item_id,
                            'item_db_id', etic.item_id,
                            'item_legacy_id', i_cfg.legacy_item_id,
                            'item_slug', i_cfg.slug,
                            'sort_order', etic.sort_order,
                            'is_group_header', etic.is_group_header,
                            'group_title', etic.group_title,
                            'display_value', etic.display_value,
                            'fixed_qty', etic.fixed_qty,
                            'quantity_editable', etic.quantity_editable,
                            'price_editable', etic.price_editable,
                            'dynamic_by_students', etic.dynamic_by_students,
                            'derived_rule_mode', etic.derived_rule_mode,
                            'derived_rule_value', etic.derived_rule_value,
                            'unit_price', etic.unit_price,
                            'default_quantity', etic.default_quantity,
                            'value_visible_to_client', etic.value_visible_to_client,
                            'has_subitems', etic.has_subitems,
                            'subitems', etic.subitems,
                            'has_additional', etic.has_additional,
                            'additional_quantity', etic.additional_quantity,
                            'has_multiplier', etic.has_multiplier,
                            'multiplier_quantity', etic.multiplier_quantity,
                            'variations', etic.variations,
                            'item_role', etic.item_role,
                            'summary_group', etic.summary_group,
                            'selector_slug', etic.selector_slug,
                            'selector_options', etic.selector_options,
                            'include_in_financial_sum', etic.include_in_financial_sum,
                            'display_only', etic.display_only,
                            'formula_slug', etic.formula_slug,
                            'participant_source', etic.participant_source
                        )
                        ORDER BY etic.sort_order ASC NULLS LAST, etic.id ASC
                    )
                    FROM event_template_item_configs etic
                    JOIN items i_cfg ON i_cfg.id = etic.item_id
                    WHERE etic.event_template_id = et.id
                ),
                '[]'
            ) AS event_item_configs,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'slug', etsr.slug,
                            'label', etsr.label,
                            'type', etsr.rule_type,
                            'percentage', (etsr.rule_payload->>'percentage')::numeric,
                            'sources', COALESCE(etsr.rule_payload->'sources', '[]'::jsonb),
                            'numerator', etsr.rule_payload->>'numerator',
                            'denominator', etsr.rule_payload->>'denominator',
                            'value', (etsr.rule_payload->>'value')::numeric,
                            'source', etsr.rule_payload->>'source'
                        )
                        ORDER BY etsr.sort_order ASC NULLS LAST, etsr.id ASC
                    )
                    FROM event_template_summary_rules etsr
                    WHERE etsr.event_template_id = et.id
                ),
                '[]'
            ) AS summary_rules
        FROM event_templates et
        ORDER BY et.name ASC
    `,

    get_event_template_by_id: () => `
        SELECT
            et.id::text AS db_id,
            COALESCE(et.legacy_event_id, et.id::text) AS id,
            et.legacy_event_id,
            et.slug,
            et.name,
            et.city,
            et.type,
            et.value,
            et.has_administration,
            et.unit_price_editable,
            et.requires_min_events,
            et.closes_summary_block,
            et.summary_block_label,
            et.group_id,
            et.created_at,
            et.updated_at,
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'id', COALESCE(i.legacy_item_id, i.id::text),
                        'db_id', i.id::text,
                        'legacy_item_id', i.legacy_item_id,
                        'slug', i.slug,
                        'name', i.name,
                        'description', i.description,
                        'unit_price', i.unit_price,
                        'default_quantity', i.default_quantity,
                        'editable', i.editable,
                        'dynamic_by_students', i.dynamic_by_students,
                        'has_subitems', i.has_subitems,
                        'subitems', i.subitems,
                        'variations', i.variations,
                        'has_additional', i.has_additional,
                        'additional_quantity', i.additional_quantity,
                        'has_multiplier', i.has_multiplier,
                        'multiplier_quantity', i.multiplier_quantity,
                        'value_visible_to_client', i.value_visible_to_client,
                        'item_kind', i.item_kind,
                        'category', i.category,
                        'created_at', i.created_at,
                        'updated_at', i.updated_at
                    )
                 )
                 FROM event_template_items eti
                 JOIN items i ON i.id = eti.item_id
                 WHERE eti.event_template_id = et.id),
                '[]'
            ) AS items,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'item_id', etic.item_id,
                            'item_db_id', etic.item_id,
                            'item_legacy_id', i_cfg.legacy_item_id,
                            'item_slug', i_cfg.slug,
                            'sort_order', etic.sort_order,
                            'is_group_header', etic.is_group_header,
                            'group_title', etic.group_title,
                            'display_value', etic.display_value,
                            'fixed_qty', etic.fixed_qty,
                            'quantity_editable', etic.quantity_editable,
                            'price_editable', etic.price_editable,
                            'dynamic_by_students', etic.dynamic_by_students,
                            'derived_rule_mode', etic.derived_rule_mode,
                            'derived_rule_value', etic.derived_rule_value,
                            'unit_price', etic.unit_price,
                            'default_quantity', etic.default_quantity,
                            'value_visible_to_client', etic.value_visible_to_client,
                            'has_subitems', etic.has_subitems,
                            'subitems', etic.subitems,
                            'has_additional', etic.has_additional,
                            'additional_quantity', etic.additional_quantity,
                            'has_multiplier', etic.has_multiplier,
                            'multiplier_quantity', etic.multiplier_quantity,
                            'variations', etic.variations,
                            'item_role', etic.item_role,
                            'summary_group', etic.summary_group,
                            'selector_slug', etic.selector_slug,
                            'selector_options', etic.selector_options,
                            'include_in_financial_sum', etic.include_in_financial_sum,
                            'display_only', etic.display_only,
                            'formula_slug', etic.formula_slug,
                            'participant_source', etic.participant_source
                        )
                        ORDER BY etic.sort_order ASC NULLS LAST, etic.id ASC
                    )
                    FROM event_template_item_configs etic
                    JOIN items i_cfg ON i_cfg.id = etic.item_id
                    WHERE etic.event_template_id = et.id
                ),
                '[]'
            ) AS event_item_configs,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'slug', etsr.slug,
                            'label', etsr.label,
                            'type', etsr.rule_type,
                            'percentage', (etsr.rule_payload->>'percentage')::numeric,
                            'sources', COALESCE(etsr.rule_payload->'sources', '[]'::jsonb),
                            'numerator', etsr.rule_payload->>'numerator',
                            'denominator', etsr.rule_payload->>'denominator',
                            'value', (etsr.rule_payload->>'value')::numeric,
                            'source', etsr.rule_payload->>'source'
                        )
                        ORDER BY etsr.sort_order ASC NULLS LAST, etsr.id ASC
                    )
                    FROM event_template_summary_rules etsr
                    WHERE etsr.event_template_id = et.id
                ),
                '[]'
            ) AS summary_rules
        FROM event_templates et
        WHERE et.id::text = $1 OR et.legacy_event_id = $1
    `,

    create_event_template: () => `
        INSERT INTO event_templates (legacy_event_id, name, city, type, value, has_administration, unit_price_editable, requires_min_events, closes_summary_block, summary_block_label, group_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `,

    // ---- FAMÍLIA MULTI-CIDADE (group_id) ----
    // Garante group_id no evento de origem (eventos antigos podem estar sem).
    ensure_event_template_group: () => `
        UPDATE event_templates
        SET group_id = COALESCE(group_id, md5(lower(trim(name))))
        WHERE id::text = $1 OR legacy_event_id = $1
        RETURNING id, group_id, name
    `,

    // Clona o evento. $4 = group_id: NULL mantém a família (nova cidade do mesmo
    // evento); preenchido cria família nova (duplicar como evento separado).
    // slug/legacy NULL para não violar os índices únicos.
    clone_event_template: () => `
        INSERT INTO event_templates (legacy_event_id, slug, name, city, type, value, has_administration, unit_price_editable, requires_min_events, closes_summary_block, summary_block_label, group_id)
        SELECT NULL, NULL, COALESCE($2, name), $3, type, value, has_administration, unit_price_editable, requires_min_events, closes_summary_block, summary_block_label, COALESCE($4::varchar, group_id)
        FROM event_templates
        WHERE id = $1
        RETURNING *
    `,

    clone_event_template_items: () => `
        INSERT INTO event_template_items (event_template_id, item_id)
        SELECT $2, item_id FROM event_template_items WHERE event_template_id = $1
        ON CONFLICT DO NOTHING
    `,

    clone_event_template_item_configs: () => `
        INSERT INTO event_template_item_configs (
            event_template_id, item_id, sort_order, is_group_header, group_title, display_value,
            fixed_qty, quantity_editable, price_editable, dynamic_by_students, derived_rule_mode,
            derived_rule_value, item_role, summary_group, selector_slug, selector_options,
            include_in_financial_sum, display_only, formula_slug, participant_source
        )
        SELECT
            $2, item_id, sort_order, is_group_header, group_title, display_value,
            fixed_qty, quantity_editable, price_editable, dynamic_by_students, derived_rule_mode,
            derived_rule_value, item_role, summary_group, selector_slug, selector_options,
            include_in_financial_sum, display_only, formula_slug, participant_source
        FROM event_template_item_configs WHERE event_template_id = $1
    `,

    clone_event_template_summary_rules: () => `
        INSERT INTO event_template_summary_rules (event_template_id, slug, label, rule_type, rule_payload, sort_order)
        SELECT $2, slug, label, rule_type, rule_payload, sort_order
        FROM event_template_summary_rules WHERE event_template_id = $1
    `,

    delete_event_template_summary_rules: () => `
        DELETE FROM event_template_summary_rules WHERE event_template_id = $1
    `,

    // Excluir cidade remove também os eventos daquela cidade (itens/configs/
    // regras caem por CASCADE nas FKs).
    delete_event_templates_by_city: () => `
        DELETE FROM event_templates WHERE city = $1 RETURNING id
    `,

    // Irmãos da família (outras cidades) do evento $1.
    get_event_template_siblings: () => `
        SELECT s.id, s.city
        FROM event_templates src
        JOIN event_templates s ON s.group_id = src.group_id AND s.id <> src.id
        WHERE src.id = $1
        ORDER BY s.created_at ASC, s.id ASC
    `,

    // "Aplicar às outras cidades": copia os campos do evento $1 para o irmão $2
    // (tudo menos cidade/slug/legacy).
    sync_event_template_from_source: () => `
        UPDATE event_templates t SET
            name                = src.name,
            type                = src.type,
            value               = src.value,
            has_administration  = src.has_administration,
            unit_price_editable = src.unit_price_editable,
            requires_min_events = src.requires_min_events,
            closes_summary_block = src.closes_summary_block,
            summary_block_label  = src.summary_block_label,
            updated_at          = NOW()
        FROM event_templates src
        WHERE src.id = $1 AND t.id = $2
    `,

    update_event_template: () => `
        UPDATE event_templates SET
            name                = $1,
            city                = $2,
            type                = $3,
            legacy_event_id     = $4,
            value               = $5,
            has_administration  = $6,
            unit_price_editable = $7,
            requires_min_events = $8,
            closes_summary_block = $9,
            summary_block_label  = $10,
            updated_at          = NOW()
        WHERE id::text = $11 OR legacy_event_id = $11
        RETURNING *
    `,

    delete_event_template: () => `
        DELETE FROM event_templates WHERE id::text = $1 OR legacy_event_id = $1
    `,

    // ---- SUB-ITEMS ----
    get_all_sub_items: () => `
        SELECT * FROM sub_items ORDER BY name ASC
    `,

    get_sub_item_by_id: () => `
        SELECT * FROM sub_items WHERE id = $1
    `,

    create_sub_item: () => `
        INSERT INTO sub_items (name)
        VALUES ($1)
        RETURNING *
    `,

    update_sub_item: () => `
        UPDATE sub_items SET
            name = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `,

    delete_sub_item: () => `
        DELETE FROM sub_items WHERE id = $1
    `,

    // PIVOT SYNC
    delete_event_template_items: () => `
        DELETE FROM event_template_items WHERE event_template_id = $1
    `,

    insert_event_template_item: () => `
        INSERT INTO event_template_items (event_template_id, item_id)
        VALUES ($1, $2)
    `,

    // Inclui o item no evento a partir da TELA DO ITEM. ON CONFLICT porque
    // clicar duas vezes nao pode duplicar a associacao.
    add_item_to_event: () => `
        INSERT INTO event_template_items (event_template_id, item_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING event_template_id
    `,

    remove_item_from_event: () => `
        DELETE FROM event_template_items
        WHERE event_template_id = $1 AND item_id = $2
    `,

    // A versao do item naquele evento sai junto: sem a associacao ela nao
    // teria mais como ser alcancada.
    remove_item_event_config: () => `
        DELETE FROM event_template_item_configs
        WHERE event_template_id = $1 AND item_id = $2
    `,

    delete_event_template_item_configs: () => `
        DELETE FROM event_template_item_configs WHERE event_template_id = $1
    `,

    // Remove apenas os configs de itens que saíram do evento (órfãos), preservando
    // os demais. Usado quando o payload não traz event_item_configs (ex.: UI).
    prune_event_template_item_configs: () => `
        DELETE FROM event_template_item_configs
        WHERE event_template_id = $1
          AND item_id <> ALL($2::int[])
    `,

    insert_event_template_item_config: () => `
        INSERT INTO event_template_item_configs (
            event_template_id,
            item_id,
            sort_order,
            is_group_header,
            group_title,
            display_value,
            fixed_qty,
            quantity_editable,
            price_editable,
            dynamic_by_students,
            derived_rule_mode,
            derived_rule_value
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
    `,

    // ---- CONFIG DO ITEM POR EVENTO ----
    // A mesma estrutura que o evento ja usa (event_template_item_configs),
    // lida pelo lado do ITEM: um registro por evento que usa aquele item.
    get_item_event_configs: () => `
        SELECT
            et.id::text              AS event_template_id,
            et.name                  AS event_name,
            et.city                  AS event_city,
            et.group_id              AS event_group_id,
            c.id::text               AS config_id,
            c.display_value,
            c.fixed_qty::float       AS fixed_qty,
            c.quantity_editable,
            c.price_editable,
            c.dynamic_by_students,
            c.derived_rule_mode,
            c.derived_rule_value::float AS derived_rule_value,
            c.sort_order,
            c.unit_price::float      AS unit_price,
            c.default_quantity,
            c.value_visible_to_client,
            c.has_subitems,
            c.subitems,
            c.has_additional,
            c.additional_quantity,
            c.has_multiplier,
            c.multiplier_quantity,
            c.variations
        FROM event_templates et
        JOIN event_template_items eti
          ON eti.event_template_id = et.id
         AND eti.item_id = $1
        LEFT JOIN event_template_item_configs c
          ON c.event_template_id = et.id
         AND c.item_id = $1
        ORDER BY et.name ASC, et.city ASC
    `,

    // Sem ON CONFLICT de proposito: o indice unico de (evento, item) foi
    // removido em algum momento e a tabela aceita mais de uma linha por par.
    // Entao: existe id -> UPDATE; nao existe -> INSERT.
    update_event_template_item_config: () => `
        UPDATE event_template_item_configs SET
            quantity_editable       = $2,
            price_editable          = $3,
            dynamic_by_students     = $4,
            unit_price              = $5,
            default_quantity        = $6,
            value_visible_to_client = $7,
            has_subitems            = $8,
            subitems                = $9::jsonb,
            has_additional          = $10,
            additional_quantity     = $11,
            has_multiplier          = $12,
            multiplier_quantity     = $13,
            variations              = $14::jsonb
        WHERE id = $1
        RETURNING id
    `,

    insert_item_event_config: () => `
        INSERT INTO event_template_item_configs (
            event_template_id, item_id,
            quantity_editable, price_editable, dynamic_by_students,
            unit_price, default_quantity, value_visible_to_client,
            has_subitems, subitems, has_additional, additional_quantity,
            has_multiplier, multiplier_quantity, variations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb)
        RETURNING id
    `,

    // ---- AUDITORIUMS ----
    get_all_auditoriums: () => `
        SELECT id::text AS id, name, slug, price::float AS price, allow_budget_edit, city FROM auditoriums ORDER BY name ASC
    `,

    get_auditorium_by_id: () => `
        SELECT id::text AS id, name, slug, price::float AS price, allow_budget_edit, city FROM auditoriums WHERE id = $1
    `,

    create_auditorium: () => `
        INSERT INTO auditoriums (name, slug, price, allow_budget_edit, city)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id::text AS id, name, slug, price::float AS price, allow_budget_edit, city
    `,

    update_auditorium: () => `
        UPDATE auditoriums SET name = $1, slug = $2, price = $3, allow_budget_edit = $4, city = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING id::text AS id, name, slug, price::float AS price, allow_budget_edit, city
    `,

    delete_auditorium: () => `
        DELETE FROM auditoriums WHERE id = $1
    `,

    // ---- CONTRACTS ----
    get_all_contracts: () => `
        SELECT id::text AS id, title, variables, created_by_name, created_at, updated_at
        FROM contracts ORDER BY updated_at DESC
    `,

    get_contract_by_id: () => `
        SELECT id::text AS id, title, variables, created_by_name, created_at, updated_at
        FROM contracts WHERE id = $1
    `,

    create_contract: () => `
        INSERT INTO contracts (title, variables, created_by_user_id, created_by_name)
        VALUES ($1, $2::jsonb, $3, $4)
        RETURNING id::text AS id, title, variables, created_by_name, created_at, updated_at
    `,

    update_contract: () => `
        UPDATE contracts SET title = $1, variables = $2::jsonb, updated_at = NOW()
        WHERE id = $3
        RETURNING id::text AS id, title, variables, created_by_name, created_at, updated_at
    `,

    delete_contract: () => `
        DELETE FROM contracts WHERE id = $1
    `,

    // ---- CONTRACT ANNEXES ----
    get_all_contract_annexes: () => `
        SELECT a.id::text AS id, a.budget_id::text AS budget_id, a.budget_code, a.title,
               a.signature_date, a.signature_names, a.courtesy_event_ids, a.created_by_name,
               a.created_at, a.updated_at,
               b.instituicao, b.curso, b.status AS budget_status
        FROM contract_annexes a
        JOIN budgets b ON b.id = a.budget_id
        ORDER BY a.updated_at DESC
    `,

    get_contract_annex_by_id: () => `
        SELECT a.id::text AS id, a.budget_id::text AS budget_id, a.budget_code, a.title,
               a.signature_date, a.signature_names, a.courtesy_event_ids, a.created_by_name,
               a.created_at, a.updated_at,
               b.instituicao, b.curso, b.status AS budget_status
        FROM contract_annexes a
        JOIN budgets b ON b.id = a.budget_id
        WHERE a.id::text = $1
    `,

    get_contract_annex_by_budget: () => `
        SELECT id::text AS id, budget_id::text AS budget_id, budget_code
        FROM contract_annexes
        WHERE budget_id = $1 OR (budget_code IS NOT NULL AND budget_code = $2)
        LIMIT 1
    `,

    create_contract_annex: () => `
        INSERT INTO contract_annexes (budget_id, budget_code, title, signature_date, signature_names, courtesy_event_ids, created_by_user_id, created_by_name)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
        RETURNING id::text AS id, budget_id::text AS budget_id, budget_code, title,
                  signature_date, signature_names, courtesy_event_ids, created_by_name, created_at, updated_at
    `,

    update_contract_annex: () => `
        UPDATE contract_annexes SET
            budget_id = COALESCE($1::uuid, budget_id),
            title = $2,
            signature_date = $3,
            signature_names = $4::jsonb,
            courtesy_event_ids = $5::jsonb,
            updated_at = NOW()
        WHERE id::text = $6
        RETURNING id::text AS id, budget_id::text AS budget_id, budget_code, title,
                  signature_date, signature_names, courtesy_event_ids, created_by_name, created_at, updated_at
    `,

    delete_contract_annex: () => `
        DELETE FROM contract_annexes WHERE id::text = $1
    `,

    // ---- CITIES (Cidade/Local do orçamento) ----
    get_all_cities: () => `
        SELECT id::text AS id, name FROM cities ORDER BY name ASC
    `,

    get_city_by_id: () => `
        SELECT id::text AS id, name FROM cities WHERE id = $1
    `,

    create_city: () => `
        INSERT INTO cities (name)
        VALUES ($1)
        RETURNING id::text AS id, name
    `,

    update_city: () => `
        UPDATE cities SET name = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id::text AS id, name
    `,

    delete_city: () => `
        DELETE FROM cities WHERE id = $1
    `,

    // ---- BUDGET REVIEWS (devolutivas) ----
    get_budget_reviews: () => `
        SELECT
            id::text AS id,
            budget_id::text AS budget_id,
            author_user_id::text AS author_user_id,
            author_name,
            author_role,
            kind,
            message,
            created_at
        FROM budget_reviews
        WHERE budget_id = $1
        ORDER BY created_at ASC, id ASC
    `,

    create_budget_review: () => `
        INSERT INTO budget_reviews (budget_id, author_user_id, author_name, author_role, kind, message)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id::text AS id,
            budget_id::text AS budget_id,
            author_user_id::text AS author_user_id,
            author_name,
            author_role,
            kind,
            message,
            created_at
    `,

    get_budget_owner: () => `
        SELECT created_by_user_id::text AS created_by_user_id, created_by_name
        FROM budgets WHERE id = $1
    `,

    // ---- PROPOSTAS DE LOCACAO (Centro de Eventos Aurora Hall) ----
    get_venue_proposals: () => `
        SELECT id::text AS id, proposal_code, client_name, event_type, guests,
               event_date, event_end_date, event_time, setup_days, teardown_days,
               entrance_id,
               data, subtotal, discount_mode, discount_percent, discount_amount,
               discount_reason, discount_status, discount_reviewed_by,
               discount_reviewed_at, discount_observation, total_value,
               valid_until, status, observation, created_by_name,
               is_locked, approved_at, approved_by, status_observation,
               COALESCE(family_code, proposal_code) AS family_code,
               version, parent_id::text AS parent_id,
               created_at, updated_at
        FROM venue_proposals ORDER BY created_at DESC
    `,

    get_venue_proposal_by_id: () => `
        SELECT id::text AS id, proposal_code, client_name, event_type, guests,
               event_date, event_end_date, event_time, setup_days, teardown_days,
               entrance_id,
               data, subtotal, discount_mode, discount_percent, discount_amount,
               discount_reason, discount_status, discount_reviewed_by,
               discount_reviewed_at, discount_observation, total_value,
               valid_until, status, observation, created_by_name,
               is_locked, approved_at, approved_by, status_observation,
               COALESCE(family_code, proposal_code) AS family_code,
               version, parent_id::text AS parent_id,
               created_at, updated_at
        FROM venue_proposals WHERE id = $1
    `,

    // A familia e a versao chegam prontas do servico. Resolver aqui, com
    // COALESCE sobre $1, colocava o mesmo parametro em dois contextos e o
    // Postgres recusava a query inteira (42P08, text versus character varying).
    create_venue_proposal: () => `
        INSERT INTO venue_proposals (
            proposal_code, client_name, event_type, guests, event_date,
            event_time, setup_days, teardown_days, entrance_id, data, subtotal,
            discount_mode, discount_percent, discount_amount, discount_reason,
            discount_status, total_value, valid_until, status, observation,
            created_by_user_id, created_by_name, event_end_date,
            family_code, version, parent_id
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::jsonb, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22, $23,
            $24, $25, $26
        )
        RETURNING id::text AS id, proposal_code, client_name, event_type, guests,
               event_date, event_end_date, event_time, setup_days, teardown_days,
               entrance_id,
               data, subtotal, discount_mode, discount_percent, discount_amount,
               discount_reason, discount_status, discount_reviewed_by,
               discount_reviewed_at, discount_observation, total_value,
               valid_until, status, observation, created_by_name,
               is_locked, approved_at, approved_by, status_observation,
               COALESCE(family_code, proposal_code) AS family_code,
               version, parent_id::text AS parent_id,
               created_at, updated_at
    `,

    update_venue_proposal: () => `
        UPDATE venue_proposals SET
            client_name      = $1,
            event_type       = $2,
            guests           = $3,
            event_date       = $4,
            event_time       = $5,
            setup_days       = $6,
            teardown_days    = $7,
            entrance_id      = $8,
            data             = $9::jsonb,
            subtotal         = $10,
            discount_mode    = $11,
            discount_percent = $12,
            discount_amount  = $13,
            discount_reason  = $14,
            discount_status  = $15,
            total_value      = $16,
            valid_until      = $17,
            status           = $18,
            observation      = $19,
            event_end_date   = $21,
            updated_at       = NOW()
        WHERE id = $20
        RETURNING id::text AS id, proposal_code, client_name, event_type, guests,
               event_date, event_end_date, event_time, setup_days, teardown_days,
               entrance_id,
               data, subtotal, discount_mode, discount_percent, discount_amount,
               discount_reason, discount_status, discount_reviewed_by,
               discount_reviewed_at, discount_observation, total_value,
               valid_until, status, observation, created_by_name,
               is_locked, approved_at, approved_by, status_observation,
               COALESCE(family_code, proposal_code) AS family_code,
               version, parent_id::text AS parent_id,
               created_at, updated_at
    `,

    // Aprovacao do desconto: acontece na propria tela da proposta, sem passar
    // pela fila de aprovacoes dos orcamentos de formatura.
    // $1 aparece na atribuicao e nos CASE. Sem o `::text` em TODAS as
    // ocorrencias o Postgres deduz varchar num lugar e text no outro e recusa
    // a query inteira (42P08, "inconsistent types deduced for parameter $1").
    review_venue_proposal_discount: () => `
        UPDATE venue_proposals SET
            discount_status      = $1::text,
            discount_reviewed_by = $2,
            discount_reviewed_at = NOW(),
            discount_observation = $3,
            discount_percent     = CASE WHEN $1::text = 'APPROVED' THEN $4 ELSE discount_percent END,
            discount_amount      = CASE WHEN $1::text = 'APPROVED' THEN $5 ELSE discount_amount END,
            total_value          = CASE WHEN $1::text = 'APPROVED' THEN $6 ELSE subtotal END,
            updated_at           = NOW()
        WHERE id = $7
        RETURNING id::text AS id, proposal_code, client_name, event_type, guests,
               event_date, event_end_date, event_time, setup_days, teardown_days,
               entrance_id,
               data, subtotal, discount_mode, discount_percent, discount_amount,
               discount_reason, discount_status, discount_reviewed_by,
               discount_reviewed_at, discount_observation, total_value,
               valid_until, status, observation, created_by_name,
               is_locked, approved_at, approved_by, status_observation,
               COALESCE(family_code, proposal_code) AS family_code,
               version, parent_id::text AS parent_id,
               created_at, updated_at
    `,

    // $1 entra na atribuicao e nos CASE: `::text` em todas as ocorrencias para
    // o Postgres nao deduzir dois tipos para o mesmo parametro (42P08).
    update_venue_proposal_status: () => `
        UPDATE venue_proposals SET
            status             = $1::text,
            status_observation = $2,
            is_locked          = CASE
                WHEN $1::text IN ('APPROVED', 'SENT_FOR_APPROVAL') THEN TRUE
                WHEN $1::text = 'PENDING' THEN FALSE
                ELSE is_locked
            END,
            approved_at = CASE
                WHEN $1::text = 'APPROVED' THEN NOW()
                ELSE approved_at
            END,
            approved_by = CASE
                WHEN $1::text = 'APPROVED' THEN $3
                ELSE approved_by
            END,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id::text AS id, proposal_code, client_name, status, is_locked,
                  approved_at, approved_by, status_observation, total_value
    `,

    // Maior versao ja gravada da familia: a proxima nasce dela + 1.
    get_venue_family_last_version: () => `
        SELECT COALESCE(MAX(version), 0) AS last_version
        FROM venue_proposals
        WHERE COALESCE(family_code, proposal_code) = $1
    `,

    delete_venue_proposal: () => `
        DELETE FROM venue_proposals WHERE id = $1
    `,

    get_venue_settings: () => `
        SELECT data, updated_by_name, updated_at FROM venue_settings WHERE id = 1
    `,

    update_venue_settings: () => `
        UPDATE venue_settings
        SET data = $1::jsonb, updated_by_name = $2, updated_at = NOW()
        WHERE id = 1
        RETURNING data, updated_by_name, updated_at
    `,
};

module.exports = models;
