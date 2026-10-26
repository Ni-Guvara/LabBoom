// 器材模型试验台（开发用）：验证 Blender 产出的 glb 能否无缝替换现有程序化器材
// 路由：/#/model/ticker_timer
// 三件事在这页验收：① 尺寸/落地是否对 ② 点击部件能否拾取取到 partId ③ 与程序化模型并排比观感
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { loadApparatus } from '@/engine/loader';
import { APPARATUS, partInfo } from '@/content/apparatusParts';
import { airTrack, cart, tableTop, tickerTimer } from '@/labs/_shared/instruments';

type Mode = 'glb' | 'code';

/** 程序化模型对照：同一件器材的「现有代码版」，用来比观感 */
const CODE_MODEL: Record<string, () => THREE.Group> = {
  ticker_timer: () => tickerTimer(),
  air_track: () => airTrack(),
  sled: () => cart(),
};

/** 观察方向（相机相对模型的方位，单位向量方向即可，距离由 frameCamera 自动算）：
 *  长条件要贴近平视、矮件要俯视、滑行器要从低角度才看得见底部 V 槽 */
const VIEW_DIR: Record<string, [number, number, number]> = {
  ticker_timer: [0.55, 0.42, 0.72],
  air_track: [0.30, 0.24, 0.92],
  sled: [0.45, 0.18, 0.87],
};

/** 按包围盒把相机放到「刚好装得下整个模型」的距离上，避免长条件两端出画 */
function frameCamera(cam: THREE.PerspectiveCamera, box: THREE.Box3, dir: [number, number, number]) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const vfov = THREE.MathUtils.degToRad(cam.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (cam.aspect || 1.6));
  const needV = size.y / 2 / Math.tan(vfov / 2);
  const needH = Math.max(size.x, size.z) / 2 / Math.tan(hfov / 2);
  const dist = Math.max(needV, needH, 0.12) * 1.45;
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
  cam.position.copy(center).add(d);
  return center;
}

/** 锚定标注（P12）：每件器材挑几个必须能点中的关键部件 */
const ANCHORS_BY_ID: Record<string, Array<[string, string]>> = {
  ticker_timer: [
    ['coil', '线圈'],
    ['reed', '振动片'],
    ['needle', '振针'],
    ['paper_disc', '复写纸'],
    ['tape', '纸带'],
  ],
  air_track: [
    ['rail_body', '导轨主体'],
    ['air_holes_r', '气浮孔'],
    ['scale_ticks', '刻度线'],
    ['foot_screw_l', '调平螺杆'],
    ['air_port', '进气嘴'],
  ],
  sled: [
    ['body_v', '倒 V 型槽'],
    ['body_tray', '配重槽'],
    ['flag', '挡光片'],
    ['weight', '配重片'],
  ],
};

export function ModelStudio({ apparatusId }: { apparatusId: string }) {
  const spec = APPARATUS[apparatusId];
  const [mode, setMode] = useState<Mode>('glb');
  const [picked, setPicked] = useState<string | null>(null);
  const [stats, setStats] = useState<{ parts: number; tris: number; size: string; mat: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const apiRef = useRef<SceneApi | null>(null);
  const glbRef = useRef<THREE.Object3D | null>(null);
  const codeRef = useRef<THREE.Object3D | null>(null);
  const helperRef = useRef<THREE.BoxHelper | null>(null);

  const setup = useMemo(
    () => async (api: SceneApi) => {
      apiRef.current = api;
      // 台面按器材实际尺寸铺：导轨 1.27 m 长，用 0.9 m 台面会一半悬空
      const dim = spec?.size ?? [0.2, 0.1, 0.1];
      api.scene.add(tableTop(Math.max(0.7, dim[0] * 1.15), Math.max(0.6, dim[2] * 3.2)));

      // 参照组：现有程序化模型（先不放，切到 code 时才挂）
      const code = CODE_MODEL[apparatusId]?.();
      codeRef.current = code ?? null;

      try {
        const model = await loadApparatus(apparatusId);
        api.scene.add(model.root);
        glbRef.current = model.root;
        api.draggable(model.root, { plane: 'floor' });

        let tris = 0;
        const mats = new Set<THREE.Material>();
        model.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) {
            const g = m.geometry as THREE.BufferGeometry;
            tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
            const mm = m.material;
            if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
            else if (mm) mats.add(mm);
          }
        });
        setStats({
          parts: model.parts.size,
          tris: Math.round(tris),
          mat: mats.size,
          size: `${Math.round(model.size.x * 1000)} × ${Math.round(model.size.z * 1000)} × ${Math.round(model.size.y * 1000)} mm`,
        });

        // 锚定标注（§4.2 P12）：挂在部件本体上，随镜头转
        for (const [pid, label] of ANCHORS_BY_ID[apparatusId] ?? []) {
          const mesh = model.parts.get(pid);
          if (mesh) api.addAnchor(mesh, label, () => setPicked(pid));
        }

        // 取景：按机身中心 + 实际尺寸，不按包围盒自动取
        // （打点计时器的纸带把包围盒拉到 260 mm，自动取景会缩成一个点）
        const box = new THREE.Box3().setFromObject(model.root);
        const center = frameCamera(api.camera, box, VIEW_DIR[apparatusId] ?? [0.55, 0.42, 0.72]);
        api.setTarget(new THREE.Vector3(center.x, center.y * 0.8, center.z));

        // 自检钩子：把模型与相机挂到 window，便于脚本按部件投影坐标点击验证拾取
        (window as unknown as Record<string, unknown>).__labboomModel = {
          root: model.root,
          parts: model.parts,
          camera: api.camera,
          THREE,
        };
      } catch (e) {
        setErr(`模型加载失败：${(e as Error).message}`);
      }

      // P11 点击即解释：从命中的 mesh 往上找带 partId 的节点
      api.pick((obj) => {
        if (!obj) {
          setPicked(null);
          if (helperRef.current) helperRef.current.visible = false;
          return;
        }
        let cur: THREE.Object3D | null = obj;
        while (cur && !cur.userData?.partId) cur = cur.parent;
        const pid = (cur?.userData?.partId as string | undefined) ?? obj.name;
        setPicked(pid);
        if (!helperRef.current) {
          helperRef.current = new THREE.BoxHelper(obj, 0x5ad1ff);
          // 高亮框必须退出拾取：Line 的射线阈值默认 1 个世界单位，
          // 不关掉的话它会挡在所有器材前面，后续每次点击都命中这个框
          helperRef.current.raycast = () => {};
          helperRef.current.frustumCulled = false;
          api.scene.add(helperRef.current);
        } else {
          helperRef.current.setFromObject(obj);
          helperRef.current.visible = true;
        }
      });

      return () => {
        glbRef.current?.removeFromParent();
        codeRef.current?.removeFromParent();
        helperRef.current?.removeFromParent();
        helperRef.current = null;
      };
    },
    [apparatusId],
  );

  const switchMode = (m: Mode) => {
    setMode(m);
    const api = apiRef.current;
    if (!api) return;
    if (m === 'glb') {
      codeRef.current?.removeFromParent();
      if (glbRef.current) api.scene.add(glbRef.current);
    } else {
      glbRef.current?.removeFromParent();
      if (codeRef.current) {
        api.scene.add(codeRef.current);
        api.draggable(codeRef.current, { plane: 'floor' });
      }
    }
  };

  const info = picked ? partInfo(apparatusId, picked) : null;

  return (
    <div style={page}>
      <div style={topBar}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>器材模型试验台 · {spec?.name ?? apparatusId}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
            Blender → glb → three · 点击任意部件看解释卡 · 双击聚焦 · 拖动平移
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['glb', 'code'] as Mode[]).map((m) => (
            <button
              key={m}
              className="pill"
              onClick={() => switchMode(m)}
              style={{ padding: '8px 16px', fontSize: 13, opacity: mode === m ? 1 : 0.5 }}
            >
              {m === 'glb' ? 'Blender 模型' : '现有程序化模型'}
            </button>
          ))}
        </div>
      </div>

      <div style={mainRow}>
        <div style={stageWrap}>
          <SceneHost setup={setup} dark />
          {err && <div style={errBox}>{err}</div>}
          <div className="en-up" style={hoverHint}>悬停 2 s 显示锚定标注</div>
        </div>

        <div style={sideCol}>
          <div className="glass" style={card}>
            <div style={cardTitle}>模型规格</div>
            {stats ? (
              <ul style={list}>
                <li>部件数 <b>{stats.parts}</b></li>
                <li>三角面 <b>{stats.tris.toLocaleString()}</b></li>
                <li>包围盒（长×深×高）<b>{stats.size}</b></li>
                <li>材质 <b>{stats.mat}</b> 份（复用，不逐件复制）</li>
              </ul>
            ) : (
              <div style={dim}>加载中…</div>
            )}
          </div>

          <div className="glass" style={card} data-part={picked ?? ''} id="part-card">
            <div style={cardTitle}>部件解释卡（P11）</div>
            {info ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{info.name}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-text-dim)' }}>{info.desc}</div>
                <div style={{ fontSize: 11, marginTop: 8, color: 'var(--c-text-faint)' }} className="en">
                  partId: {picked}
                </div>
              </>
            ) : (
              <div style={dim}>点一下场景里的任意部件</div>
            )}
          </div>

          <div className="glass" style={card}>
            <div style={cardTitle}>关键部件（点击定位）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(ANCHORS_BY_ID[apparatusId] ?? []).map(([pid, label]) => (
                <button
                  key={pid}
                  className="pill"
                  style={{ padding: '6px 12px', fontSize: 12, opacity: picked === pid ? 1 : 0.65 }}
                  onClick={() => setPicked(pid)}
                >
                  {label}
                </button>
              ))}
            </div>
            {spec?.spec && (
              <div style={{ fontSize: 12, marginTop: 10, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>{spec.spec}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px 40px' };
const topBar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const mainRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 12, minHeight: 520 };
const stageWrap: React.CSSProperties = { position: 'relative', minHeight: 520, borderRadius: 16, overflow: 'hidden' };
const sideCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
// flexShrink: 0 —— 三张卡片在 520 高的栏里会被纵向压缩，解释卡正文就被切掉了
const card: React.CSSProperties = { padding: 14, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 };
const cardTitle: React.CSSProperties = { fontSize: 11, letterSpacing: 1.5, color: 'var(--c-text-faint)', textTransform: 'uppercase' };
const list: React.CSSProperties = { margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 2, color: 'var(--c-text-dim)' };
const dim: React.CSSProperties = { fontSize: 13, color: 'var(--c-text-faint)' };
const hoverHint: React.CSSProperties = { position: 'absolute', right: 12, bottom: 10, zIndex: 4, fontSize: 10.5, letterSpacing: 1, color: 'var(--c-text-faint)', opacity: 0.6, pointerEvents: 'none' };
const errBox: React.CSSProperties = { position: 'absolute', left: 12, top: 12, zIndex: 5, padding: '8px 12px', borderRadius: 8, background: 'rgba(200,60,50,0.85)', fontSize: 12 };
