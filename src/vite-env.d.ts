/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 收款站根地址（如 https://pay.example.com）。留空 = 不启用付费守卫：开发/离线包/演示构建都走这条路 */
  readonly VITE_PAY_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
