export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  return fetch(new Request(env.WORKER_URL + url.pathname + url.search, request));
}
