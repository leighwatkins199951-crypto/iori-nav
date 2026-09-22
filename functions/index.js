import { ensureSchemaReady } from './lib/schema-migration';

export async function onRequest({ request, env }) {
  await ensureSchemaReady(env);
  const response = await env.ASSETS.fetch(new URL('/index.html', request.url));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(response.body, { status: response.status, headers });
}
