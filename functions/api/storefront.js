import { jsonResponse } from '../_middleware';
import { ensureSchemaReady } from '../lib/schema-migration';

export async function onRequestGet({ env }) {
  await ensureSchemaReady(env);

  const [categories, products, settings] = await Promise.all([
    env.NAV_DB.prepare(`SELECT id, catelog AS name, sort_order
      FROM category WHERE is_private = 0 ORDER BY sort_order, id`).all(),
    env.NAV_DB.prepare(`SELECT id, name, url, logo AS image, desc AS description,
      catelog_id AS categoryId, catelog_name AS division, COALESCE(product_type, 'all') AS category
      FROM sites WHERE is_private = 0 ORDER BY sort_order, id`).all(),
    env.NAV_DB.prepare(`SELECT key, value FROM settings
      WHERE key IN ('home_site_name','home_site_description','home_footer_text','home_title_color')`).all(),
  ]);

  return jsonResponse({
    code: 200,
    data: {
      categories: categories.results || [],
      products: products.results || [],
      settings: Object.fromEntries((settings.results || []).map(({ key, value }) => [key, value])),
    },
  });
}
