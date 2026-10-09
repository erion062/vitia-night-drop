export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Connection / fallback copy for the customer app (server messages are already Albanian). */
export function customerError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'S’ka lidhje. Kontrollo internetin dhe provo sërish.';
    if (e.status === 401) return e.message && !e.message.startsWith('Request failed') ? e.message : 'Hyr në llogari që të vazhdosh.';
    if (e.status === 403 && /origin|cross-origin/i.test(e.message)) {
      return 'Kërkesa u bllokua. Rifresko faqen dhe provo sërish.';
    }
    if (e.status === 502 || e.status === 503 || e.status === 504) {
      return 'Shërbyesi s’përgjigjet. Po provojmë sërish…';
    }
    if (e.message.startsWith('Request failed')) return 'Kërkesa dështoi. Provo sërish.';
    return e.message;
  }
  if (e instanceof Error) {
    if (e.message === 'No connection. Check your internet and try again.') return 'S’ka lidhje. Kontrollo internetin dhe provo sërish.';
    if (e.message === 'Something went wrong') return 'Diçka shkoi keq. Provo sërish.';
    return e.message;
  }
  return 'Diçka shkoi keq. Provo sërish.';
}
