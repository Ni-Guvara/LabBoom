// 权益状态机。全站只校验一次，各处订阅同一份结果。
import { create } from 'zustand';
import { PAY_ENABLED } from './config';
import {
  fetchEntitlement,
  isCacheFresh,
  isExpired,
  readCache,
  readToken,
  skuCovers,
  writeCache,
  type CachedEntitlement,
  type Entitlement,
} from './entitlement';

export type PayStatus =
  | 'disabled' // 未配置收款站：不启用锁
  | 'idle'
  | 'checking'
  | 'ok' // 有有效权益
  | 'locked' // 无 token / token 无效
  | 'expired' // 年卡到期
  | 'offline'; // 有 token 但校验不通且无缓存

interface PayState {
  status: PayStatus;
  sku: string;
  expires: number;
  /** 用缓存兜底的离线校验结果 */
  stale: boolean;
  init: () => Promise<void>;
  recheck: () => Promise<void>;
  hasYear: () => boolean;
  /** 该实验是否已开通 */
  canOpen: (labId: string) => boolean;
}

const applyEnt = (ent: Entitlement): Pick<PayState, 'status' | 'sku' | 'expires'> => {
  if (!ent.valid || !ent.sku) return { status: 'locked', sku: '', expires: 0 };
  if (isExpired(ent)) return { status: 'expired', sku: ent.sku, expires: ent.expires };
  return { status: 'ok', sku: ent.sku, expires: ent.expires };
};

export const usePayStore = create<PayState>((set, get) => ({
  status: PAY_ENABLED ? 'idle' : 'disabled',
  sku: '',
  expires: 0,
  stale: false,

  init: () => {
    if (!PAY_ENABLED) {
      set({ status: 'disabled' });
      return Promise.resolve();
    }
    if (get().status !== 'idle' && get().status !== 'checking') return Promise.resolve();
    return run(set, false);
  },

  recheck: () => {
    if (!PAY_ENABLED) return Promise.resolve();
    return run(set, true);
  },

  hasYear: () => get().status === 'ok' && get().sku === 'year',

  canOpen: (labId) => {
    const s = get();
    return s.status === 'ok' && skuCovers(s.sku, labId);
  },
}));

/** 并发去重：StrictMode 双调用 / 多个组件同时 init 只打一次接口 */
let inflight: Promise<void> | null = null;

function run(set: (p: Partial<PayState>) => void, force: boolean): Promise<void> {
  if (inflight) return inflight;

  const token = readToken();
  if (!token) {
    set({ status: 'locked', sku: '', expires: 0, stale: false });
    return Promise.resolve();
  }

  const cached = readCache(token);
  if (!force && cached && isCacheFresh(cached)) {
    set({ ...applyEnt(cached), stale: false });
    return Promise.resolve();
  }

  set({ status: 'checking' });
  inflight = (async () => {
    try {
      const ent = await fetchEntitlement(token);
      writeCache(token, ent);
      set({ ...applyEnt(ent), stale: false });
    } catch {
      // 校验不通：有缓存就按缓存放行（老师课间断网不能因为打不开接口就被踢走），
      // 没有缓存才提示重试——不跳落地页，避免把已付费的人当成未付费。
      const fallback: CachedEntitlement | null = cached;
      if (fallback) set({ ...applyEnt(fallback), stale: true });
      else set({ status: 'offline', sku: '', expires: 0, stale: false });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
