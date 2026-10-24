// 共享工具：线性最小二乘拟合 y = a*x + b + CSV 导出（实验台复用）
export interface Fit { a: number; b: number; r2: number }

export function linearFit(points: { x: number; y: number }[]): Fit | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - (a * p.x + b)) ** 2;
  }
  const r2 = ssTot < 1e-12 ? 1 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

export function toCSV(headers: string[], rows: (number | string)[][]): string {
  const esc = (v: number | string) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v));
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function downloadCSV(filename: string, headers: string[], rows: (number | string)[][]) {
  const blob = new Blob([toCSV(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
