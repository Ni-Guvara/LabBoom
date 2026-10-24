// three.js 场景容器：渲染循环 + 轨道控制 + 拾取 + 锚定标注 + 矢量箭头
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface SceneApi {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  addAnchor: (obj: THREE.Object3D, text: string, onClick?: () => void) => CSS2DObject;
  pick: (cb: (obj: THREE.Object3D | null) => void) => void;
  onTick: (fn: (dt: number) => void) => void;
}

interface SceneHostProps {
  setup: (api: SceneApi) => Promise<() => void> | (() => void);
  dark?: boolean;
}

export function SceneHost({ setup, dark = true }: SceneHostProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const labelDiv = labelRef.current!;

    const scene = new THREE.Scene();
    scene.background = dark ? new THREE.Color('#0b1220') : new THREE.Color('#e9eef5');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(6, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer({ element: labelDiv });
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);

    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.35 : 0.7));
    const spot = new THREE.SpotLight(0xffffff, dark ? 2.4 : 1.2, 0, Math.PI / 5, 0.4);
    spot.position.set(0, 12, 6);
    scene.add(spot);
    scene.add(new THREE.HemisphereLight(0x88aaff, 0x202840, dark ? 0.4 : 0.2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 30;

    const addAnchor: SceneApi['addAnchor'] = (obj, text, onClick) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText =
        'padding:3px 10px;border-radius:999px;background:rgba(11,18,32,0.78);border:1px solid rgba(77,166,255,0.5);color:#f5f7fa;font-size:12px;white-space:nowrap;backdrop-filter:blur(6px);pointer-events:auto;cursor:pointer;';
      if (onClick) el.addEventListener('click', onClick);
      const obj2d = new CSS2DObject(el);
      obj2d.position.set(0, 0.6, 0);
      obj.add(obj2d);
      return obj2d;
    };

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pickCb: ((o: THREE.Object3D | null) => void) | null = null;
    const pick: SceneApi['pick'] = (cb) => { pickCb = cb; };
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(scene.children, true);
      pickCb?.(hits[0]?.object ?? null);
    };
    renderer.domElement.addEventListener('click', onClick);

    let tickFn: ((dt: number) => void) | null = null;
    const onTick: SceneApi['onTick'] = (fn) => { tickFn = fn; };

    const api: SceneApi = { scene, camera, addAnchor, pick, onTick };
    let cleanup: (() => void) | undefined;
    let mounted = true;

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      if (tickFn) tickFn(clock.getDelta());
      renderer.render(scene, camera);
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
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      cleanup?.();
      renderer.dispose();
      while (mount.firstChild) mount.removeChild(mount.firstChild);
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
