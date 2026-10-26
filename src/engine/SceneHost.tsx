// three.js 场景容器：渲染循环 + 轨道控制 + 拾取优先拖拽 + 锚定标注 + 矢量箭头
// P1 交互定案：左键落器材=拖器材 / 左键落空白=旋转 / 中键永远只做导航 / Shift+中键=平移
// 渲染：真实投影（接触阴影）+ RoomEnvironment 环境光照，器材不再"浮"在台面上
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { studioBackdrop, studioBackwall, studioEnvironment, studioLights } from './studio';

export interface DragOptions {
  /** 贴台面平移（默认）或锁定垂直方向 */
  plane?: 'floor' | 'vertical';
  /**
   * 拖动许可。返回 false 时该器材完全不参与拖拽（事件不拦截，左键照样转相机）。
   * 用来做「布置阶段可摆、运行阶段锁死」，而不是靠改 scene 的注册表。
   */
  canDrag?: () => boolean;
  /**
   * 把拖动约束到台面上的一条轴。导轨上滑动的器材（计时器、光电门）只需一个自由度：
   * 不约束的话鼠标一斜就把器材拽离导轨，装配关系散架。
   */
  axis?: 'x' | 'z';
  /** 沿约束轴的中心坐标允许区间（m），超出即夹住 */
  min?: number;
  max?: number;
  onMove?: (pos: THREE.Vector3) => void;
}

export interface SceneApi {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** offset：数字=只抬高 y；Vector3=三轴偏移（用于错开邻近器材的标注，避免文字叠在一起） */
  addAnchor: (obj: THREE.Object3D, text: string, onClick?: () => void, offset?: number | THREE.Vector3) => CSS2DObject;
  /** 更新已有标注的文字（参数改变时同步器材数值） */
  setAnchorText: (obj2d: CSS2DObject, text: string) => void;
  pick: (cb: (obj: THREE.Object3D | null) => void) => void;
  onTick: (fn: (dt: number) => void) => void;
  /** 注册可拖拽器材：未注册的对象不参与拖拽，保持"左键空白=旋转" */
  draggable: (obj: THREE.Object3D, opts?: DragOptions) => void;
  /** 双击/F 聚焦：把该器材设为旋转中心并飞过去 */
  focusOn: (obj: THREE.Object3D) => void;
  /** 设定轨道旋转中心（默认原点）：器材高于台面时用它把取景中心抬到实验区 */
  setTarget: (v: THREE.Vector3) => void;
}

interface SceneHostProps {
  setup: (api: SceneApi) => Promise<() => void> | (() => void);
  dark?: boolean;
}

const DEAD_ZONE = 4; // px，防误触

export function SceneHost({ setup, dark = true }: SceneHostProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const labelDiv = labelRef.current!;

    const scene = new THREE.Scene();
    // 影棚渐变背景：中心柔光、四周压暗，比纯色更像棚拍
    const backdrop = studioBackdrop(dark);
    scene.background = backdrop;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 200);
    camera.position.set(1.6, 1.1, 2.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 电影级高光滚降：金属不会直接曝成一片白，暗部也有层次
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = dark ? 1.05 : 1.0;
    renderer.shadowMap.enabled = true;
    // VSM：可以真正"糊"开阴影（PCFSoft 的核固定 3×3，产品图里会是硬边黑块）
    renderer.shadowMap.type = THREE.VSMShadowMap;
    // 标注层由 React 持有：StrictMode 二次挂载时它可能已被清理，需补回挂载点
    if (labelDiv.parentElement !== mount) mount.appendChild(labelDiv);
    // 画布必须排在标注层之前，否则 WebGL 画面会盖住 CSS2D 锚点
    mount.insertBefore(renderer.domElement, labelDiv);

    const labelRenderer = new CSS2DRenderer({ element: labelDiv });
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);

    // 后景墙：挡住台面后边缘之外的纯黑背景，避免出现"黑→台面"的硬断层
    const backwall = studioBackwall();
    scene.add(backwall);

    // 三点布光（主光带 2048 软阴影 + 冷补光 + 背后轮廓光）
    studioLights(scene, dark);

    // 环境光照（PBR 反射来源）：三块柔光板 → 金属上出现有形状的高光带
    const env = studioEnvironment(renderer, dark);
    scene.environment = env.texture;

    // ---------- 后处理：4×MSAA + 轻泛光（高光微微晕开，器材才有"摄影"感） ----------
    const cw = mount.clientWidth || 1;
    const ch = mount.clientHeight || 1;
    const hdrTarget = new THREE.WebGLRenderTarget(cw, ch, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, hdrTarget);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(cw, ch);
    composer.addPass(new RenderPass(scene, camera));
    // 阈值必须抬到 1.2 以上：阈值 0.9 时，钢片/镜面的一小块高光会被晕成拳头大的白斑，
    // 反而把器材形状糊掉。抬阈值后只有真正的过曝点才轻微溢出。
    const bloom = new UnrealBloomPass(new THREE.Vector2(cw, ch), 0.18, 0.45, 1.25);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.15;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

    // ---------- 标注 ----------
    // 标注默认隐藏：器材一多就会糊满屏幕。悬停某个器材满 2 s 才弹出它自己的标注。
    const HOLD_MS = 2000;
    interface AnchorItem { obj: THREE.Object3D; obj2d: CSS2DObject; el: HTMLElement }
    const anchors: AnchorItem[] = [];
    const anchorByObj = new Map<THREE.Object3D, AnchorItem>();
    let shownEl: HTMLElement | null = null;
    let hoverItem: AnchorItem | null = null;
    let hoverSince = 0;

    const showLabel = (el: HTMLElement) => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0) scale(1)';
      el.style.pointerEvents = 'auto';
    };
    const hideLabel = (el: HTMLElement) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(2px) scale(.96)';
      el.style.pointerEvents = 'none';
    };

    const addAnchor: SceneApi['addAnchor'] = (obj, text, onClick, offset = 0.06) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText =
        'padding:3px 10px;border-radius:999px;background:rgba(11,18,32,0.78);border:1px solid rgba(77,166,255,0.5);color:#f5f7fa;font-size:12px;white-space:nowrap;backdrop-filter:blur(6px);pointer-events:none;cursor:pointer;opacity:0;transform:translateY(2px) scale(.96);transition:opacity .18s ease,transform .18s ease;';
      if (onClick) el.addEventListener('click', onClick);
      const obj2d = new CSS2DObject(el);
      if (typeof offset === 'number') obj2d.position.set(0, offset, 0);
      else obj2d.position.copy(offset);
      obj.add(obj2d);
      const item: AnchorItem = { obj, obj2d, el };
      anchors.push(item);
      anchorByObj.set(obj, item);
      return obj2d;
    };

    /** 让场景在数值变化时同步刷新某条标注文字（标注在悬停前也是隐藏的，改文字不会闪） */
    const setAnchorText: SceneApi['setAnchorText'] = (obj2d, text) => {
      if (obj2d.element.textContent !== text) obj2d.element.textContent = text;
    };

    // ---------- 拾取与拖拽 ----------
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const dragRoots = new Map<THREE.Object3D, DragOptions>();
    const draggable: SceneApi['draggable'] = (obj, opts) => { dragRoots.set(obj, opts ?? {}); };

    /** 只更新射线，不做求交（拖动时每帧都要算，求交太贵） */
    const setRay = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
    };

    const toNdc = (e: PointerEvent) => {
      setRay(e);
      return ray.intersectObjects(scene.children, true);
    };

    const rootOf = (o: THREE.Object3D | undefined): THREE.Object3D | null => {
      let cur: THREE.Object3D | null = o ?? null;
      while (cur) {
        if (dragRoots.has(cur)) return cur;
        cur = cur.parent;
      }
      return null;
    };

    let pickCb: ((o: THREE.Object3D | null) => void) | null = null;
    const pick: SceneApi['pick'] = (cb) => { pickCb = cb; };
    let focused: THREE.Object3D | null = null;

    interface Pending {
      root: THREE.Object3D;
      opts: DragOptions;
      startX: number;
      startY: number;
      started: boolean;
      startPos: THREE.Vector3;
      /** 按下时器材所在的高度平面（世界 y）：整段拖动都在这个平面上解算 */
      plane: THREE.Plane;
      /** 按下瞬间鼠标射线与该平面的交点，作为位移零点 */
      startWorld: THREE.Vector3;
      point: THREE.Vector3;
      vertical: boolean;
    }
    let pending: Pending | null = null;
    let suppressClick = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 中键/右键只做导航
      const hits = toNdc(e);
      const root = rootOf(hits[0]?.object);
      if (!root) return; // 落空白 → 交给 OrbitControls 旋转
      // 命中器材：拦截事件，避免 OrbitControls 同时开始旋转相机
      const opts = dragRoots.get(root)!;
      // 锁定态（运行/分析页、物理量已绑定的器材）直接放行给相机，不做任何拦截
      if (opts.canDrag && !opts.canDrag()) return;
      e.stopImmediatePropagation();
      const vertical = opts.plane === 'vertical';
      const worldPos = new THREE.Vector3();
      root.getWorldPosition(worldPos);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -worldPos.y);
      const startWorld = worldPos.clone();
      ray.ray.intersectPlane(plane, startWorld);
      pending = {
        root,
        opts,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        startPos: root.position.clone(),
        plane,
        startWorld,
        point: new THREE.Vector3(),
        vertical,
      };
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pending) return;
      if (!pending.started) {
        const d = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (d < DEAD_ZONE) return; // 4px 死区：点选不位移
        pending.started = true;
        controls.enabled = false; // 相机与器材互斥锁定
      }
      setRay(e);
      const opts = pending.opts;
      const parent = pending.root.parent;
      if (pending.vertical || e.shiftKey) {
        // 垂直升降：用屏幕纵向位移换算
        const dy = (pending.startY - e.clientY) * 0.002;
        pending.root.position.y = Math.max(0, pending.startPos.y + dy);
      } else if (ray.ray.intersectPlane(pending.plane, pending.point)) {
        // 用「位移增量」而不是绝对交点：position 是父级局部坐标，而射线解出的是世界坐标，
        // 直接赋值会让挂在 group 下的器材（导轨上的计时器/光电门）一拖就跳半个机身。
        const delta = pending.point.clone().sub(pending.startWorld);
        if (parent) {
          const q = new THREE.Quaternion();
          parent.getWorldQuaternion(q).invert();
          delta.applyQuaternion(q);
        }
        pending.root.position.x = pending.startPos.x + delta.x;
        pending.root.position.z = pending.startPos.z + delta.z;
      }
      // 单自由度器材（导轨上的计时器/光电门）：另一个水平轴钉回原位，再夹在行程内
      if (opts.axis === 'x') {
        pending.root.position.z = pending.startPos.z;
        if (opts.min !== undefined) pending.root.position.x = Math.max(opts.min, pending.root.position.x);
        if (opts.max !== undefined) pending.root.position.x = Math.min(opts.max, pending.root.position.x);
      } else if (opts.axis === 'z') {
        pending.root.position.x = pending.startPos.x;
        if (opts.min !== undefined) pending.root.position.z = Math.max(opts.min, pending.root.position.z);
        if (opts.max !== undefined) pending.root.position.z = Math.min(opts.max, pending.root.position.z);
      }
      dragRoots.get(pending.root)?.onMove?.(pending.root.position);
    };

    const endDrag = (e: PointerEvent) => {
      if (pending?.started) suppressClick = true;
      pending = null;
      controls.enabled = true;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const onClick = (e: MouseEvent) => {
      if (suppressClick) { suppressClick = false; return; }
      const hits = toNdc(e as unknown as PointerEvent);
      const obj = hits[0]?.object ?? null;
      focused = rootOf(obj ?? undefined) ?? obj;
      pickCb?.(obj);
    };

    const onDblClick = (e: MouseEvent) => {
      const hits = toNdc(e as unknown as PointerEvent);
      const root = rootOf(hits[0]?.object) ?? hits[0]?.object;
      if (root) focusOn(root);
    };

    // ---------- 悬停 2 s 显示标注 ----------
    let lastHoverAt = 0;
    const anchorAt = (e: PointerEvent): AnchorItem | null => {
      const hits = toNdc(e);
      for (const h of hits) {
        let cur: THREE.Object3D | null = h.object;
        while (cur) {
          const item = anchorByObj.get(cur);
          if (item) return item;
          cur = cur.parent;
        }
      }
      return null;
    };
    const clearShown = () => {
      if (shownEl) { hideLabel(shownEl); shownEl = null; }
    };
    const onHoverMove = (e: PointerEvent) => {
      if (pending) { clearShown(); hoverItem = null; return; } // 拖器材时不弹标注
      const now = performance.now();
      if (now - lastHoverAt < 90) return; // 射线检测节流
      lastHoverAt = now;
      const item = anchorAt(e);
      if (item !== hoverItem) {
        if (shownEl !== item?.el) clearShown();
        hoverItem = item;
        hoverSince = now;
      }
    };
    const onHoverLeave = () => { clearShown(); hoverItem = null; };
    renderer.domElement.addEventListener('pointermove', onHoverMove);
    renderer.domElement.addEventListener('pointerleave', onHoverLeave);

    // 捕获阶段注册：命中器材时先拦截，OrbitControls 才不会同时旋转相机
    renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove, { capture: true });
    renderer.domElement.addEventListener('pointerup', endDrag, { capture: true });
    renderer.domElement.addEventListener('pointercancel', endDrag, { capture: true });
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('dblclick', onDblClick);

    // ---------- 相机聚焦 / 视图预设 ----------
    interface Tween { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; k: number }
    let tween: Tween | null = null;

    const flyTo = (target: THREE.Vector3, position: THREE.Vector3) => {
      tween = { from: camera.position.clone(), to: position, tFrom: controls.target.clone(), tTo: target, k: 0 };
    };

    const frameRadius = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      return sphere;
    };

    const focusOn: SceneApi['focusOn'] = (obj) => {
      const sphere = frameRadius(obj);
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      const dist = Math.max(0.35, sphere.radius / Math.tan((camera.fov * Math.PI) / 360) * 1.5);
      flyTo(sphere.center.clone(), sphere.center.clone().addScaledVector(dir, dist));
    };

    const setView = (kind: 'front' | 'right' | 'top' | 'home') => {
      const t = controls.target.clone();
      const d = camera.position.distanceTo(t) || 2;
      if (kind === 'home') { flyTo(new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(1.6, 1.1, 2.0)); return; }
      const dir = kind === 'front' ? new THREE.Vector3(0, 0.25, 1) : kind === 'right' ? new THREE.Vector3(1, 0.25, 0.001) : new THREE.Vector3(0.001, 1, 0.001);
      flyTo(t, t.clone().addScaledVector(dir.normalize(), d));
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '1') setView('front');
      else if (e.key === '3') setView('right');
      else if (e.key === '7') setView('top');
      else if (e.key === 'Home') setView('home');
      else if (e.key === 'f' || e.key === 'F') { if (focused) focusOn(focused); }
    };
    window.addEventListener('keydown', onKey);

    let tickFn: ((dt: number) => void) | null = null;
    const onTick: SceneApi['onTick'] = (fn) => { tickFn = fn; };

    const setTarget: SceneApi['setTarget'] = (v) => {
      controls.target.copy(v);
      controls.update();
    };

    const api: SceneApi = { scene, camera, addAnchor, setAnchorText, pick, onTick, draggable, focusOn, setTarget };
    // 调试口：自检脚本据此读相机/拖拽表，做局部特写与「器材是否可拖」的自动化验证
    (window as unknown as Record<string, unknown>).__labboomScene = {
      scene, camera, controls, dragRoots, renderer,
      /** 屏幕坐标 → 射线命中列表（name + 距离），用于核对"这一下点到了什么" */
      pickAt: (cx: number, cy: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const v2 = new THREE.Vector2(
          ((cx - rect.left) / rect.width) * 2 - 1,
          -((cy - rect.top) / rect.height) * 2 + 1,
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(v2, camera);
        return rc.intersectObjects(scene.children, true).slice(0, 6).map((h) => {
          const chain: string[] = [];
          let c: THREE.Object3D | null = h.object;
          while (c && chain.length < 5) { chain.push(c.name || c.type); c = c.parent; }
          return { chain: chain.join('<'), dist: +h.distance.toFixed(3) };
        });
      },
    };
    let cleanup: (() => void) | undefined;
    let mounted = true;

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (tween) {
        tween.k = Math.min(1, tween.k + 0.08);
        const e = 1 - Math.pow(1 - tween.k, 3);
        camera.position.lerpVectors(tween.from, tween.to, e);
        controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
        if (tween.k >= 1) tween = null;
      }
      controls.update();
      if (tickFn) tickFn(clock.getDelta());
      composer.render();
      // 悬停计时到点才点亮标注
      if (hoverItem && !shownEl && performance.now() - hoverSince >= HOLD_MS) {
        showLabel(hoverItem.el);
        shownEl = hoverItem.el;
      }
      labelRenderer.render(scene, camera);
    };

    Promise.resolve(setup(api)).then((c) => {
      if (!mounted) return;
      cleanup = c ?? undefined;
      loop();
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      renderer.domElement.removeEventListener('pointermove', onPointerMove, { capture: true });
      renderer.domElement.removeEventListener('pointerup', endDrag, { capture: true });
      renderer.domElement.removeEventListener('pointercancel', endDrag, { capture: true });
      renderer.domElement.removeEventListener('pointermove', onHoverMove);
      renderer.domElement.removeEventListener('pointerleave', onHoverLeave);
      anchors.length = 0;
      anchorByObj.clear();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      controls.dispose();
      cleanup?.();
      env.dispose();
      backdrop.dispose();
      backwall.geometry.dispose();
      bloom.dispose();
      composer.dispose();
      hdrTarget.dispose();
      renderer.dispose();
      // 只摘掉自建画布，标注层归 React 管理（整层清空会让二次挂载丢失锚点容器）
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
      <div ref={labelRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
    </div>
  );
}

// 矢量箭头 helper（P3 原语）：长度∝大小，颜色按类型
export const VECTOR_COLORS: Record<string, number> = {
  force: 0xff5a5a, velocity: 0x5eea7b, accel: 0xffb14d, field: 0xb98bff, mag: 0x4da6ff,
};
export function makeArrow(from: THREE.Vector3, vec: THREE.Vector3, type: keyof typeof VECTOR_COLORS) {
  const dir = vec.clone().normalize();
  const len = vec.length();
  const color = VECTOR_COLORS[type] ?? 0xffffff;
  return new THREE.ArrowHelper(dir, from, len, color, Math.min(0.4, len * 0.2), Math.min(0.2, len * 0.1));
}
