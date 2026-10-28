// 收款服务配置。
// VITE_PAY_BASE 留空 = 不启用锁（开发、离线 U 盘包、演示构建全走这条路），
// 线上构建由 CI 从仓库变量注入，代码里不出现任何域名/价格/白名单。
const raw = (import.meta.env.VITE_PAY_BASE ?? '').trim();

/** 收款站根地址，去掉结尾斜杠；空串表示未配置 */
export const PAY_BASE = raw.replace(/\/+$/, '');

/** 是否启用付费守卫 */
export const PAY_ENABLED = PAY_BASE !== '';

/** 拼接收款站路径：payUrl() → 落地页，payUrl('/buy/single') → 选实验 */
export const payUrl = (path = '/'): string => `${PAY_BASE}${path}`;
