import { DB_SCHEMA, SCHEMA_VERSION, PREVIOUS_SCHEMA_VERSION } from '../constants';
import { PRODUCT_SEED } from './product-seed';

let schemaReady = false;
let schemaReadyPromise = null;

async function runBaseSchema(db) {
  const statements = DB_SCHEMA.split(';')
    .map(stmt => stmt.trim())
    .filter(Boolean)
    .map(stmt => db.prepare(stmt));

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

async function runIncrementalMigrations(env) {
  await env.NAV_DB.batch([
    env.NAV_DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_catelog_id ON sites(catelog_id)'),
    env.NAV_DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_sort_order ON sites(sort_order)'),
    env.NAV_DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_private_sort ON sites(is_private, sort_order)'),
    env.NAV_DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_catelog_name ON sites(catelog_name)'),
    env.NAV_DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_url ON sites(url)')
  ]);

  const [sitesColumns, categoryColumns, pendingColumns] = await Promise.all([
    env.NAV_DB.prepare('PRAGMA table_info(sites)').all(),
    env.NAV_DB.prepare('PRAGMA table_info(category)').all(),
    env.NAV_DB.prepare('PRAGMA table_info(pending_sites)').all(),
  ]);
  const sitesCols = new Set((sitesColumns.results || []).map(column => column.name));
  const categoryCols = new Set((categoryColumns.results || []).map(column => column.name));
  const pendingCols = new Set((pendingColumns.results || []).map(column => column.name));

  const alterStatements = [];
  const sitesMissingCatalogName = !sitesCols.has('catelog_name');
  const pendingMissingCatalogName = !pendingCols.has('catelog_name');

  if (!sitesCols.has('is_private')) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE sites ADD COLUMN is_private INTEGER DEFAULT 0'));
  }
  if (sitesMissingCatalogName) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE sites ADD COLUMN catelog_name TEXT'));
  }
  if (!sitesCols.has('product_type')) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE sites ADD COLUMN product_type TEXT'));
  }
  if (pendingMissingCatalogName) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE pending_sites ADD COLUMN catelog_name TEXT'));
  }
  if (!categoryCols.has('is_private')) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE category ADD COLUMN is_private INTEGER DEFAULT 0'));
  }
  if (!categoryCols.has('parent_id')) {
    alterStatements.push(env.NAV_DB.prepare('ALTER TABLE category ADD COLUMN parent_id INTEGER DEFAULT 0'));
  }

  for (const statement of alterStatements) {
    try {
      await statement.run();
    } catch (error) {
      console.warn('Schema alter skipped:', error.message);
    }
  }

  if (sitesMissingCatalogName) {
    await env.NAV_DB.prepare(`
      UPDATE sites
      SET catelog_name = (
        SELECT catelog FROM category WHERE category.id = sites.catelog_id
      )
      WHERE catelog_name IS NULL
    `).run();
  }

  if (pendingMissingCatalogName) {
    await env.NAV_DB.prepare(`
      UPDATE pending_sites
      SET catelog_name = (
        SELECT catelog FROM category WHERE category.id = pending_sites.catelog_id
      )
      WHERE catelog_name IS NULL
    `).run();
  }
}

async function seedProductCatalogue(env) {
  const existing = await env.NAV_DB.prepare('SELECT COUNT(*) AS total FROM sites').first();
  if (Number(existing?.total || 0) > 0) return;

  const categoryNames = ['Courier Packaging Bags', 'Plastic Granules', 'Pillows'];
  for (let i = 0; i < categoryNames.length; i += 1) {
    await env.NAV_DB.prepare(`INSERT INTO category (catelog, sort_order, parent_id, is_private)
      SELECT ?, ?, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM category WHERE catelog = ?)`)
      .bind(categoryNames[i], i + 1, categoryNames[i]).run();
  }

  const packaging = await env.NAV_DB.prepare('SELECT id FROM category WHERE catelog = ? LIMIT 1')
    .bind(categoryNames[0]).first();
  if (!packaging) return;

  const statement = env.NAV_DB.prepare(`INSERT INTO sites
    (name, url, logo, desc, catelog_id, catelog_name, product_type, sort_order, is_private)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`);
  const rows = PRODUCT_SEED.map(product => statement.bind(
    product.name,
    'https://wa.me/85256426295',
    `/${product.image}`,
    product.description,
    packaging.id,
    categoryNames[0],
    product.category,
    product.id,
  ));
  for (let offset = 0; offset < rows.length; offset += 40) {
    await env.NAV_DB.batch(rows.slice(offset, offset + 40));
  }

  await env.NAV_DB.batch([
    env.NAV_DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('home_site_name', 'BEST CHOICE')`),
    env.NAV_DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('home_site_description', 'Reliable packaging and product supply for brands, retailers and ecommerce operations worldwide.')`),
    env.NAV_DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('home_footer_text', 'Worldwide B2B enquiries welcome.')`),
  ]);
}

export async function ensureSchemaReady(env) {
  if (!env || !env.NAV_DB) return;
  if (schemaReady) return;
  if (schemaReadyPromise) {
    await schemaReadyPromise;
    return;
  }

  schemaReadyPromise = (async () => {
    const kv = env.NAV_AUTH;

    if (kv) {
      try {
        const migrated = await kv.get(`schema_migrated_${SCHEMA_VERSION}`);
        if (migrated) {
          schemaReady = true;
          return;
        }
      } catch (error) {
        console.warn('Schema version check failed:', error);
      }
    }

    try {
      await runBaseSchema(env.NAV_DB);
      await runIncrementalMigrations(env);
      await seedProductCatalogue(env);

      if (kv) {
        await kv.put(`schema_migrated_${SCHEMA_VERSION}`, 'true');

        if (PREVIOUS_SCHEMA_VERSION && PREVIOUS_SCHEMA_VERSION !== SCHEMA_VERSION) {
          try {
            await kv.delete(`schema_migrated_${PREVIOUS_SCHEMA_VERSION}`);
          } catch (cleanupError) {
            console.warn('Previous schema marker cleanup failed:', cleanupError);
          }
        }
      }

      schemaReady = true;
    } catch (error) {
      console.error('Schema migration failed:', error);
    }
  })().finally(() => {
    schemaReadyPromise = null;
  });

  await schemaReadyPromise;
}
