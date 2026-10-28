// 权益契约（HANDOFF 第 2 节）：
//   GET {PAY_BASE}/api/entitlement?t=<token> → { sku, expires, valid }
//   sku='year' 全站；'L1'..'L7' 单实验；expires=0 表示永久（不看该字段）。
// 这一层只做「token 存取 + 校验 + 缓存 + 判定」，不含任何 UI，也不硬编码商品。
import { PAY_BASE } from './config';

const TOKEN_KEY = 'lb_token';
const CACHE_KEY = 'lb_ent_v1';

/** 有效权益缓存 10 分钟；无效 60 秒（避免反复打接口，又能让刚付款的人很快放行） */
const TTL_VALID = 10 * 60 * 1000;
const TTL_INVALID = 60 * 1000;
/** 校验超时：弱网下课间打不开比拦错人更糟，6 s 后转缓存/重试而不是踢回落地页 */
const FETCH_TIMEOUT = 6000;

/** lb_ + 16 位 URL-safe；放宽到 10 位以上以兼容后续 token 长度调整 */
const TOKEN_RE = /^lb_[A-Za-z0-9_-]{10,}$/;

export interface Entitlement {
  sku: string;
  /** Unix 秒；0 = 永久 */
  expires: number;
  valid: boolean;
}

export interface CachedEntitlement extends Entitlement {
  token: string;
  /** 校验时刻（毫秒） */
  at: number;
}

export function readToken(): string {
  try {
    const t = localStorage.getItem(TOKEN_KEY) ?? '';
    return TOKEN_RE.test(t) ? t : '';
  } catch {
    return ''; // Safari 隐私模式下 localStorage 可能抛异常
  }
}

export function writeToken(token: string): void {
  try {
    if (TOKEN_RE.test(token)) localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 存不了就只在本次会话内有效 */
  }
}

/**
 * 从地址栏 ?t= 取 token 并落库，随后把参数从地址栏抹掉。
 * 抹掉是因为 token 在 query 里会被 Referer、截图、聊天分享原样带出去。
 * 必须读 # 之前的 search：HashRouter 下 /?t=x#/lab/L3 有效，/#/lab/L3?t=x 取不到。
 */
export function captureTokenFromUrl(): string {
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return readToken();
  }
  const fromUrl = url.searchParams.get('t') ?? '';
  if (!TOKEN_RE.test(fromUrl)) return readToken();

  writeToken(fromUrl);
  url.searchParams.delete('t');
  const cleaned = `${url.pathname}${url.search}${url.hash}`;
  try {
    // 保留 history.state：React Router 把导航状态存在这里
    history.replaceState(history.state, '', cleaned);
  } catch {
    /* file:// 下可能受限，忽略即可 */
  }
  return fromUrl;
}

export function readCache(token: string): CachedEntitlement | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedEntitlement;
    if (!c || c.token !== token) return null;
    return c;
  } catch {
    return null;
  }
}

export function isCacheFresh(c: CachedEntitlement): boolean {
  return Date.now() - c.at < (c.valid ? TTL_VALID : TTL_INVALID);
}

export function writeCache(token: string, ent: Entitlement): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...ent, token, at: Date.now() }));
  } catch {
    /* 忽略 */
  }
}

/** 年卡到期判定：expires=0 视为永久 */
export function isExpired(ent: Entitlement): boolean {
  return ent.expires > 0 && ent.expires * 1000 <= Date.now();
}

/** 调收款服务拿权益。失败一律抛错，由上层决定用缓存还是提示重试 */
export async function fetchEntitlement(token: string): Promise<Entitlement> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${PAY_BASE}/api/entitlement?t=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
      // 契约未要求 cookie，避免触发预检
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`entitlement HTTP ${res.status}`);
    const j = (await res.json()) as Partial<Entitlement>;
    return {
      sku: typeof j.sku === 'string' ? j.sku : '',
      expires: Number(j.expires) || 0,
      valid: j.valid === true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** sku 是否覆盖某实验：year 全开，单实验只开自己 */
export function skuCovers(sku: string, labId: string): boolean {
  return sku === 'year' || sku === labId;
}
