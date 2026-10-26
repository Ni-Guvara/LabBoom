// 器材部件词典（P11 点击即解释的文案源）
// 这是 content/apparatus.json 的雏形：先覆盖打点计时器，后续按同样结构补其余器材。
// 字段对齐设计说明 §6.2.1：parts[] 的 name / desc / 所属器具。

export interface PartInfo {
  /** 部件显示名（与课本术语逐字一致） */
  name: string;
  /** 解释卡正文：它是什么、在这里起什么作用 */
  desc: string;
  /** 点击时是否弹解释卡（外壳、脚垫这类不弹） */
  pick?: boolean;
}

export interface ApparatusSpec {
  name: string;
  /** 外形尺寸（米），用于验收与锚点换算 */
  size: [number, number, number];
  /** 关键规格，进解释卡 */
  spec?: string;
  parts: Record<string, PartInfo>;
}

const same = (name: string, desc: string): PartInfo => ({ name, desc });

export const APPARATUS: Record<string, ApparatusSpec> = {
  ticker_timer: {
    name: '电磁打点计时器',
    size: [0.144, 0.0437, 0.07],
    spec: 'J0203 型 · 4~6 V 低压交流 · 50 Hz 时每 0.02 s 打一点',
    parts: {
      base: same('底座', '黑色电木底座，绝缘且坚硬；两侧凹槽配 F 夹可固定在桌沿或斜面端。'),
      base_rib_f: same('固定凸台', '前端凸台，配合 F 夹夹住桌面边缘。'),
      base_rib_b: same('固定凸台', '后端凸台，配合 F 夹夹住桌面边缘。'),
      coil: same('线圈', '接 4~6 V 交流电后产生交变磁场，使振片被反复磁化。'),
      coil_cap_0: same('线圈端盖', '封住线圈绕组两端的塑料端盖。'),
      coil_cap_1: same('线圈端盖', '封住线圈绕组两端的塑料端盖。'),
      coil_seam: same('线圈接缝', '线圈外壳的合模缝。'),
      coil_label: same('铭牌', '标工作电压与型号的铭牌。'),
      coil_bracket: same('线圈支架', '把线圈固定在底座上的钢支架。'),
      magnet_lower: { name: '永久磁铁（下极）', desc: '与上极形成恒定磁场，振片磁极反复变化时在这里被上下吸引。', pick: true },
      magnet_upper: { name: '永久磁铁（上极）', desc: '与下极形成恒定磁场，驱动振片往复振动。', pick: true },
      reed: { name: '振动片', desc: '弹簧钢薄片，随电流方向改变上下振动，频率与电源一致 —— 这就是 0.02 s 的来源。', pick: true },
      reed_clamp: same('振动片压板', '把振片固定在支架上；旋松可调节振片长度（调固有频率）。'),
      needle: { name: '振针', desc: '穿过振片的小螺丝，振动时在复写纸和纸带上打出点迹；长短可调。', pick: true },
      needle_nut_top: same('振针螺母（上）', '调节振针伸出长度。'),
      needle_nut_bot: same('振针螺母（下）', '调节振针伸出长度。'),
      paper_disc: { name: '复写纸', desc: '圆盘形单面复写纸，色面朝下压在纸带上；被纸带拖动会缓慢转动，使点迹清晰。', pick: true },
      paper_boss: same('复写纸轴帽', '压住复写纸中心孔，防止它脱离立轴。'),
      spindle: same('复写纸立轴', '支撑复写纸圆盘，可拨动，用来换工作面。'),
      spindle_arm: same('拨纸臂', '连接立轴与支架，拨动立轴时整个复写纸盘一起移动。'),
      spindle_knob: same('拨柄', '手指拨动处。'),
      limit_0_top: { name: '限位孔', desc: '门形金属限位框，限制纸带只能沿直线通过，防止左右摆动带来误差。', pick: true },
      limit_0_leg_f: same('限位框立柱', '限位框的两条立柱。'),
      limit_0_leg_b: same('限位框立柱', '限位框的两条立柱。'),
      limit_1_top: { name: '限位孔', desc: '纸带出口一侧的限位框。', pick: true },
      limit_1_leg_f: same('限位框立柱', '限位框的两条立柱。'),
      limit_1_leg_b: same('限位框立柱', '限位框的两条立柱。'),
      tape: { name: '纸带', desc: '随运动物体一起被拖动，点迹间距就是位移，相邻计数点间隔 0.1 s。', pick: true },
      post_brass_a: same('接线柱', '接学生电源的 4~6 V 交流输出。'),
      post_brass_b: same('接线柱', '接学生电源的 4~6 V 交流输出。'),
      post_cap_red: { name: '接线柱（红）', desc: '通常接火线端；红黑/红绿成对出现，接线时别接反。', pick: true },
      post_cap_green: { name: '接线柱（绿）', desc: '通常接零线端，与红色柱构成回路。', pick: true },
      wire_red_a: same('红色导线', '线圈到接线柱的引线。'),
      wire_red_b: same('红色导线', '线圈到接线柱的引线。'),
      wire_black: same('黑色导线', '另一路引线。'),
      foot_lf: same('橡胶脚垫', '防滑减振，避免整机共振影响打点稳定性。'),
      foot_rf: same('橡胶脚垫', '防滑减振，避免整机共振影响打点稳定性。'),
      foot_lb: same('橡胶脚垫', '防滑减振，避免整机共振影响打点稳定性。'),
      foot_rb: same('橡胶脚垫', '防滑减振，避免整机共振影响打点稳定性。'),
    },
  },

  air_track: {
    name: '气垫导轨',
    size: [1.2764, 0.11, 0.0904],
    spec: '1200 mm 工作面 · 三角型材 · 气浮孔 φ1 mm / 孔距 25 mm · 可调地脚',
    parts: {
      rail_body: {
        name: '导轨主体',
        desc: '铝合金挤压型材，截面是三角尖顶 —— 顶角做成尖的，是为了让气膜只在一条窄带上托住滑行器，摩擦面积最小。',
        pick: true,
      },
      air_holes_r: {
        name: '气浮孔',
        desc: '斜面上两排 φ1 mm 小孔，孔距 25 mm。气泵把空气压进型材内腔，从小孔喷出形成气膜，滑行器就浮在气膜上，摩擦可视为零。',
        pick: true,
      },
      air_holes_l: {
        name: '气浮孔',
        desc: '另一侧斜面的一排小孔，与对侧共同形成对称气膜，否则滑行器会被顶偏。',
        pick: true,
      },
      scale_ticks: {
        name: '刻度线',
        desc: '侧面标尺，最小分度 1 mm，每 5 mm 加长、每 10 mm 最长。光电门位置与滑行器位移都靠它读。',
        pick: true,
      },
      scale_strip: same('标尺底板', '浅色底衬，让刻线在金属型材上看得清。'),
      bumper_l: {
        name: '缓冲挡板',
        desc: '两端的塑料挡块，挡住冲到尽头的滑行器，避免它撞出导轨。',
        pick: true,
      },
      bumper_r: same('缓冲挡板', '两端的塑料挡块，挡住冲到尽头的滑行器，避免它撞出导轨。'),
      spring_l_0: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      spring_l_1: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      spring_l_2: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      spring_r_0: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      spring_r_1: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      spring_r_2: same('缓冲弹簧', '圈簧吸收撞击能量，把一次硬碰变成可恢复的弹性碰撞。'),
      hook_l: {
        name: '牵引挂钩',
        desc: '挂细线用。测加速度时细线从这头绕过定滑轮吊沙桶。',
        pick: true,
      },
      hook_r: same('牵引挂钩', '挂细线用。测加速度时细线从这头绕过定滑轮吊沙桶。'),
      foot_pad_l: {
        name: '地脚底盘',
        desc: '橡胶底盘，增大接触面积并防滑。调平是气垫导轨实验的第一步，不水平就会多出一个重力分量。',
        pick: true,
      },
      foot_pad_r: same('地脚底盘', '橡胶底盘，增大接触面积并防滑。'),
      foot_screw_l: {
        name: '调平螺杆',
        desc: '旋进旋出改变这一端的高度。测加速度前沿导轨方向调平：滑行器能停住不动即为水平。',
        pick: true,
      },
      foot_screw_r: same('调平螺杆', '旋进旋出改变这一端的高度。'),
      foot_nut_l: same('锁紧螺母', '调平后锁死，防止实验中螺杆自己转松。'),
      foot_nut_r: same('锁紧螺母', '调平后锁死，防止实验中螺杆自己转松。'),
      foot_mount_l: same('地脚安装座', '把螺杆固定在型材底面的钢座。'),
      foot_mount_r: same('地脚安装座', '把螺杆固定在型材底面的钢座。'),
      air_port: {
        name: '进气嘴',
        desc: '黄铜快接接头，接气泵的软管。实验全程必须持续供气，一旦停气气膜消失，滑行器就变成直接摩擦。',
        pick: true,
      },
      air_port_ring: same('进气嘴法兰', '压紧在型材端面上，防止漏气。'),
      air_hose: {
        name: '进气软管',
        desc: '橡胶软管，连向气泵。管径和长度都会影响出气量，所以别随意拉扯打折。',
        pick: true,
      },
      air_hose_clamp: same('管夹', '卡住软管，防止气压把管子顶脱。'),
    },
  },

  sled: {
    name: '滑行器',
    size: [0.1722, 0.0966, 0.062],
    spec: '155 mm · 底部倒 V 槽 · 顶部配重槽 · 挡光片 20 mm',
    parts: {
      body_v: {
        name: '倒 V 型槽',
        desc: '底部的倒 V 形凹槽，与导轨三角顶面配合。气膜就在这两条斜面上形成 —— 槽壁越贴合，气膜越稳定，晃动越小。',
        pick: true,
      },
      body_tray: {
        name: '配重槽',
        desc: '顶部开口的矩形槽，用来加配重片改变质量。探究「a 与 m 的关系」时全靠它。',
        pick: true,
      },
      weight: {
        name: '配重片',
        desc: '50 g 一片。加片时质量变了而拉力不变，正好用来验证 a ∝ 1/m。',
        pick: true,
      },
      flag_post: same('挡光片支架', '把挡光片固定在滑行器顶部，保证它垂直穿过光电门。'),
      flag: {
        name: '挡光片',
        desc: '宽 20 mm 的遮光片。它通过光电门时遮光时间 Δt 就是计时依据，v = d/Δt —— 所以片宽必须量准。',
        pick: true,
      },
      bumper_l: same('缓冲头', '两端塑料头，撞到导轨挡板时先接触它。'),
      bumper_r: same('缓冲头', '两端塑料头，撞到导轨挡板时先接触它。'),
      hook_l: same('牵引挂钩', '挂细线，用来被沙桶拖动或互相牵引。'),
      hook_r: same('牵引挂钩', '挂细线，用来被沙桶拖动或互相牵引。'),
      level_bubble: {
        name: '水准泡',
        desc: '气泡居中说明导轨已调平。比肉眼观察滑行器是否停住更灵敏。',
        pick: true,
      },
    },
  },
};

/** 取部件信息，未知部件降级成「部件 + 空说明」而不是报错 */
export function partInfo(apparatusId: string, partId: string): PartInfo {
  const spec = APPARATUS[apparatusId];
  const hit = spec?.parts[partId];
  if (hit) return hit;
  return { name: partId.replace(/_/g, ' '), desc: '（该部件尚未补录说明）' };
}
