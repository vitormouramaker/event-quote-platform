require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { postgres, runMigrations } = require('../server/connect');

// O catalogo canonico mora no front (e o mesmo arquivo que o front usa).
// SEED_FILE permite apontar outro caminho (o docker-compose monta a pasta).
const seedFile = process.env.SEED_FILE
  ? path.resolve(process.env.SEED_FILE)
  : path.resolve(__dirname, '../../../frontend/src/features/budgets/migration/canonicalSeed.bundle.json');

function readSeedBundle() {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Arquivo de seed não encontrado: ${seedFile}`);
  }
  return JSON.parse(fs.readFileSync(seedFile, 'utf8'));
}

async function upsertSubItems(client, subItems) {
  for (const subItem of subItems) {
    const existing = await client.query(`SELECT id FROM sub_items WHERE slug = $1`, [subItem.slug]);
    if (existing.rows[0]) {
      await client.query(
        `
          UPDATE sub_items
          SET
            name = $2,
            has_price = $3,
            has_quantity = $4,
            updated_at = NOW()
          WHERE slug = $1
        `,
        [subItem.slug, subItem.name, subItem.has_price === true, subItem.has_quantity === true],
      );
    } else {
      await client.query(
        `
          INSERT INTO sub_items (slug, name, has_price, has_quantity)
          VALUES ($1, $2, $3, $4)
        `,
        [subItem.slug, subItem.name, subItem.has_price === true, subItem.has_quantity === true],
      );
    }
  }
}

async function upsertItems(client, items) {
  const itemIdBySlug = new Map();

  for (const item of items) {
    const params = [
      item.legacy_item_id,
      item.slug,
      item.name,
      null,
      Number(item.unit_price || 0),
      Number(item.default_quantity || 1),
      item.editable === true,
      item.dynamic_by_students === true,
      item.has_subitems === true,
      JSON.stringify(item.subitems || []),
      item.kind,
      item.category,
    ];
    const existing = await client.query(`SELECT id, slug FROM items WHERE slug = $1 OR legacy_item_id = $2 LIMIT 1`, [item.slug, item.legacy_item_id]);
    let ret;
    if (existing.rows[0]) {
      ret = await client.query(
        `
          UPDATE items
          SET
            legacy_item_id = $2,
            slug = $1,
            name = $3,
            description = $4,
            unit_price = $5,
            default_quantity = $6,
            editable = $7,
            dynamic_by_students = $8,
            has_subitems = $9,
            subitems = $10::jsonb,
            item_kind = $11,
            category = $12,
            updated_at = NOW()
          WHERE id = $13
          RETURNING id, slug
        `,
        [
          item.slug,
          item.legacy_item_id,
          item.name,
          null,
          Number(item.unit_price || 0),
          Number(item.default_quantity || 1),
          item.editable === true,
          item.dynamic_by_students === true,
          item.has_subitems === true,
          JSON.stringify(item.subitems || []),
          item.kind,
          item.category,
          existing.rows[0].id,
        ],
      );
    } else {
      ret = await client.query(
        `
          INSERT INTO items (
            legacy_item_id,
            slug,
            name,
            description,
            unit_price,
            default_quantity,
            editable,
            dynamic_by_students,
            has_subitems,
            subitems,
            item_kind,
            category
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
          RETURNING id, slug
        `,
        params,
      );
    }

    itemIdBySlug.set(ret.rows[0].slug, ret.rows[0].id);
  }

  return itemIdBySlug;
}

async function upsertSelectors(client, selectors) {
  for (const selector of selectors) {
    await client.query(
      `
        INSERT INTO catalog_selectors (slug, label, options)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (slug)
        DO UPDATE SET
          label = EXCLUDED.label,
          options = EXCLUDED.options,
          updated_at = NOW()
      `,
      [selector.slug, selector.label, JSON.stringify(selector.options || [])],
    );
  }
}

async function upsertEventTemplates(client, eventTemplates, itemIdBySlug) {
  for (const eventTemplate of eventTemplates) {
    const existing = await client.query(
      `SELECT id FROM event_templates WHERE slug = $1 OR legacy_event_id = $2 LIMIT 1`,
      [eventTemplate.slug, eventTemplate.legacy_event_id],
    );
    let templateRet;
    if (existing.rows[0]) {
      templateRet = await client.query(
        `
          UPDATE event_templates
          SET
            legacy_event_id = $1,
            slug = $2,
            name = $3,
            city = $4,
            type = $5,
            updated_at = NOW()
          WHERE id = $6
          RETURNING id
        `,
        [
          eventTemplate.legacy_event_id,
          eventTemplate.slug,
          eventTemplate.name,
          eventTemplate.city,
          eventTemplate.type,
          existing.rows[0].id,
        ],
      );
    } else {
      templateRet = await client.query(
        `
          INSERT INTO event_templates (legacy_event_id, slug, name, city, type)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          eventTemplate.legacy_event_id,
          eventTemplate.slug,
          eventTemplate.name,
          eventTemplate.city,
          eventTemplate.type,
        ],
      );
    }

    const templateId = templateRet.rows[0].id;

    await client.query(`DELETE FROM event_template_items WHERE event_template_id = $1`, [templateId]);
    await client.query(`DELETE FROM event_template_item_configs WHERE event_template_id = $1`, [templateId]);
    await client.query(`DELETE FROM event_template_summary_rules WHERE event_template_id = $1`, [templateId]);

    for (const itemSlug of eventTemplate.item_slugs) {
      const itemId = itemIdBySlug.get(itemSlug);
      if (!itemId) throw new Error(`Item slug não encontrado para template ${eventTemplate.slug}: ${itemSlug}`);
      await client.query(
        `INSERT INTO event_template_items (event_template_id, item_id) VALUES ($1, $2)`,
        [templateId, itemId],
      );
    }

    for (const config of eventTemplate.event_item_configs) {
      const itemId = itemIdBySlug.get(config.item_slug);
      if (!itemId) throw new Error(`Config item slug não encontrado para template ${eventTemplate.slug}: ${config.item_slug}`);

      await client.query(
        `
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
            derived_rule_value,
            item_role,
            summary_group,
            selector_slug,
            selector_options,
            include_in_financial_sum,
            display_only,
            formula_slug,
            participant_source
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20
          )
        `,
        [
          templateId,
          itemId,
          config.sort_order,
          config.is_group_header === true,
          config.group_title,
          config.display_value,
          config.fixed_qty,
          config.quantity_editable === true,
          config.price_editable === true,
          config.dynamic_by_students === true,
          config.derived_rule_mode,
          config.derived_rule_value,
          config.item_role,
          config.summary_group,
          config.selector_slug,
          JSON.stringify(config.selector_options || []),
          config.include_in_financial_sum !== false,
          config.display_only === true,
          config.formula_slug,
          config.participant_source,
        ],
      );
    }

    for (const [index, summaryRule] of eventTemplate.summary_rules.entries()) {
      await client.query(
        `
          INSERT INTO event_template_summary_rules (
            event_template_id,
            slug,
            label,
            rule_type,
            rule_payload,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        `,
        [
          templateId,
          summaryRule.slug,
          summaryRule.label,
          summaryRule.type,
          JSON.stringify({
            percentage: summaryRule.percentage,
            sources: summaryRule.sources,
            numerator: summaryRule.numerator,
            denominator: summaryRule.denominator,
            value: summaryRule.value,
            source: summaryRule.source,
          }),
          index + 1,
        ],
      );
    }
  }
}

async function upsertLegacyAliases(client, aliases) {
  for (const alias of aliases) {
    await client.query(
      `
        INSERT INTO legacy_aliases (alias_type, legacy_key, canonical_slug, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (alias_type, legacy_key)
        DO UPDATE SET
          canonical_slug = EXCLUDED.canonical_slug,
          notes = EXCLUDED.notes,
          updated_at = NOW()
      `,
      [alias.alias_type, alias.legacy_key, alias.canonical_slug, alias.notes || null],
    );
  }
}

async function main() {
  const bundle = readSeedBundle();
  await runMigrations();

  // --if-empty: so semeia banco sem catalogo (usado na subida do Docker, para
  // nao desfazer o que foi editado na tela a cada reinicio).
  if (process.argv.includes('--if-empty')) {
    const ret = await postgres.query('SELECT COUNT(*)::int AS n FROM event_templates');
    if (ret.rows[0].n > 0) {
      console.log('[OK] Catalogo ja existe; seed ignorado (--if-empty)');
      await postgres.end();
      return;
    }
  }

  const client = await postgres.connect();
  try {
    await client.query('BEGIN');

    await upsertSubItems(client, bundle.subItems || []);
    const itemIdBySlug = await upsertItems(client, bundle.items || []);
    await upsertSelectors(client, bundle.selectors || []);
    await upsertEventTemplates(client, bundle.eventTemplates || [], itemIdBySlug);
    await upsertLegacyAliases(client, bundle.legacyAliases || []);

    await client.query('COMMIT');
    console.log('[OK] Seed canônico aplicado com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha ao aplicar seed canônico:', error.message || error);
  process.exit(1);
});
