// 收款服务配置。
// VITE_PAY_BASE 留空 = 不启用锁（开发、离线 U 盘包、演示构建全走这条路），
// 线上构建由 CI 从仓库变量注入，代码里不出现任何域名/白名单。
// 注意：收款页还没上线前**不要**设 PAY_BASE——一旦设了，点「未开通」会跳到一个不存在的地址。
const raw = (import.meta.env.VITE_PAY_BASE ?? '').trim();

/** 收款站根地址，去掉结尾斜杠；空串表示未配置 */
export const PAY_BASE = raw.replace(/\/+$/, '');

/** 是否启用付费守卫 */
export const PAY_ENABLED = PAY_BASE !== '';

/** 拼接收款站路径：payUrl() → 落地页，payUrl('/buy/single') → 选实验 */
export const payUrl = (path = '/'): string => `${PAY_BASE}${path}`;

/**
 * 占位价（元）。收款页还没做，先在这里定死，改价只改这两行。
 * 只在收款链路里出现（校验页/跳转页），模块列表不展示价格——
 * 现在没有可付款的页面，标价只会带来「点了买不了」的投诉。
 */
export const PRICES = {
  single: 9.9,
  year: 99,
};

/** ¥9.9 / ¥99 */
export const priceLabel = (sku: 'single' | 'year'): string => `¥${PRICES[sku]}`;
