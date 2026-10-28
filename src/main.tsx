import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { captureTokenFromUrl } from './pay/entitlement';
import './styles/tokens.css';
import 'katex/dist/katex.min.css';

// 渲染前先收开通凭证：地址栏里的 ?t= 读一次就落库并抹掉（防止被分享链接/Referer 带走）
captureTokenFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
