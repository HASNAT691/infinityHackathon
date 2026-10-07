// Thin fetch wrapper. The session cookie is sent automatically (same origin via Vite proxy).
export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    method: options.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.errors?.[0]?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
