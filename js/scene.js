'use strict';
/* ---------- Three.js 场景 ----------
   相机与地球固定不动；方向键 / 触屏拖动只平移飞船，松开自动回中。
   第三人称（默认）：能看到飞船全貌；第一人称：驾驶舱随飞船平移。
   陨石运动：从深空起点直线冲向地球表面落点，e.p（0→1）为进度。 */
const Scene3D = (() => {
  const FOV = 62;
  const ZOOM_FOV = 36;      // 按住 Ctrl 时的变焦视场
  const EARTH = {x: 0, y: -24, z: -72, r: 16};   // 地球中心与半径（压低，让上方留出陨石来袭空间）

  // 两种视角的相机位姿（姿态锁定，不随输入转动）
  const POSE_THIRD = {pos: new THREE.Vector3(0, 1.7, 4.2), pitch: -.26};
  const POSE_FIRST = {pos: new THREE.Vector3(0, 0, 0), pitch: .05};

  let renderer, scene, camera;
  let earth, atmo, starPts;
  let ship, shipMuzzle, engineGlows = [];
  let rig, gun, gunMuzzle;
  let flash;                // 枪口点光源（场景级，开火时挪到当前枪口）
  let lasers = [], bursts = [];
  let gunKick = 0;
  const GUN_Z = -0.9;
  const _v = new THREE.Vector3();

  let viewMode = 'third';
  try{ viewMode = localStorage.getItem('wd_view') === 'first' ? 'first' : 'third'; }catch(e){}
  const camPos = POSE_THIRD.pos.clone();
  let zoomHeld = false;

  /* ---------- 飞船移动（方向键 / 触屏拖动）----------
     只平移飞船本体：相机、地球、星空全部保持不动；松开后平滑回中 */
  const keys = {};                            // 方向键按住状态
  const move = {x: 0, y: 0, tx: 0, ty: 0};    // 当前偏移 / 目标偏移（归一化 -1~1）
  const RANGE_X = 3.4, RANGE_Y = 2.2;         // 最大移动范围（世界单位）
  let manual = false;                         // 是否处于手动移动（松开自动回中）
  function bindMoveInput(){
    window.addEventListener('keydown', e => {
      if (e.key === 'Control'){ zoomHeld = true; return; }
      if (e.key.indexOf('Arrow') === 0){ keys[e.key] = true; manual = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'Control'){ zoomHeld = false; return; }
      if (e.key.indexOf('Arrow') === 0) keys[e.key] = false;
    });
    window.addEventListener('blur', () => { zoomHeld = false; for (const k in keys) keys[k] = false; });
    // 触屏：拖动即拖动飞船
    let last = null;
    window.addEventListener('touchstart', e => {
      last = {x: e.touches[0].clientX, y: e.touches[0].clientY};
    }, {passive: true});
    window.addEventListener('touchmove', e => {
      if (!last) return;
      const t = e.touches[0];
      manual = true;
      move.tx += (t.x - last.x) * .0035;
      move.ty -= (t.y - last.y) * .0045;
      move.tx = Math.max(-1, Math.min(1, move.tx));
      move.ty = Math.max(-1, Math.min(1, move.ty));
      last = {x: t.x, y: t.y};
    }, {passive: true});
  }
  function updateMoveInput(dt){
    if (keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp || keys.ArrowDown){
      move.tx = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
      move.ty = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
    } else if (manual){
      // 松开后飞船平滑回中
      const decay = Math.max(0, 1 - dt * 4);
      move.tx *= decay;
      move.ty *= decay;
      if (Math.abs(move.tx) < .02 && Math.abs(move.ty) < .02){ move.tx = 0; move.ty = 0; manual = false; }
    }
  }

  /* ---------- 贴图 ---------- */
  function loadTex(dataUri){
    const t = new THREE.TextureLoader().load(dataUri);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function shipMaterial(extra = {}){
    const hasTex = typeof SHIP_TEXTURE !== 'undefined';
    const mat = new THREE.MeshStandardMaterial(Object.assign({
      color: 0x9aa6c4, metalness: .75, roughness: .42
    }, extra));
    if (hasTex){
      mat.map = loadTex(SHIP_TEXTURE);
      if (typeof SHIP_NORMAL !== 'undefined'){
        mat.normalMap = loadTex(SHIP_NORMAL);
        mat.normalScale = new THREE.Vector2(.6, .6);
      }
    }
    return mat;
  }

  /* ---------- 初始化 ---------- */
  function init(canvasEl){
    renderer = new THREE.WebGLRenderer({canvas: canvasEl, antialias: true});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.Fog(0x05070f, 70, 140);   // 深空远处淡出
    camera = new THREE.PerspectiveCamera(FOV, 1, .1, 220);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0x8899bb, .55));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.15);
    sun.position.set(6, 5, 3);
    scene.add(sun);

    // 地球（贴图内嵌 base64，file:// 离线可用；位置压低，完整圆盘可见）
    const tex = new THREE.TextureLoader().load(EARTH_TEXTURE);
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH.r, 48, 48),
      new THREE.MeshStandardMaterial({map: tex, roughness: 1, metalness: 0, fog: false})
    );
    earth.position.set(EARTH.x, EARTH.y, EARTH.z);
    scene.add(earth);
    // 大气辉光
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH.r * 1.03, 48, 48),
      new THREE.MeshBasicMaterial({color: 0x3a86ff, transparent: true, opacity: .18,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false})
    );
    atmo.position.copy(earth.position);
    scene.add(atmo);

    // 星空
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++){
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 55);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starPts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xcfe8ff, size: .35, sizeAttenuation: true, transparent: true, opacity: .9, fog: false
    }));
    scene.add(starPts);

    buildShip();
    buildGun();
    buildCockpit();
    // 枪口闪光光源（场景级）
    flash = new THREE.PointLight(0x53f5ff, 0, 10);
    scene.add(flash);

    applyViewMode();
    bindMoveInput();
    resize();
  }

  /* ---------- 第三人称：飞船（相机外的完整模型） ---------- */
  function buildShip(){
    ship = new THREE.Group();
    const hull = shipMaterial();
    const dark = shipMaterial({color: 0x4a5468, metalness: .6, roughness: .55});

    // 六棱机身 + 机头锥
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(.26, .4, 2.2, 6), hull);
    fuselage.rotation.x = -Math.PI / 2;
    ship.add(fuselage);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.26, .9, 6), hull);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.55;
    ship.add(nose);
    // 座舱盖
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 12),
      new THREE.MeshStandardMaterial({color: 0x0e2233, metalness: .9, roughness: .15,
        emissive: 0x1a4a5a, emissiveIntensity: .8}));
    canopy.scale.set(1, .55, 1.6);
    canopy.position.set(0, .22, -.5);
    ship.add(canopy);
    // 后掠主翼
    for (const sx of [-1, 1]){
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, .05, .72), hull);
      wing.position.set(sx * .88, -.04, .4);
      wing.rotation.y = sx * .48;
      ship.add(wing);
      // 翼尖
      const tip = new THREE.Mesh(new THREE.BoxGeometry(.34, .07, .3), dark);
      tip.position.set(sx * 1.52, -.04, .76);
      tip.rotation.y = sx * .48;
      ship.add(tip);
    }
    // 垂尾
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.05, .5, .55), dark);
    fin.position.set(0, .38, .75);
    fin.rotation.x = -.25;
    ship.add(fin);
    // 双引擎 + 尾焰辉光
    for (const sx of [-1, 1]){
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .55, 10), dark);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx * .34, 0, 1.05);
      ship.add(eng);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(.11, 12),
        new THREE.MeshBasicMaterial({color: 0x53f5ff, transparent: true, opacity: .9,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false}));
      glow.position.set(sx * .34, 0, 1.34);
      ship.add(glow);
      engineGlows.push(glow);
    }
    // 机头炮口能量核
    shipMuzzle = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 12),
      new THREE.MeshBasicMaterial({color: 0x53f5ff, fog: false}));
    shipMuzzle.position.set(0, 0, -2.05);
    ship.add(shipMuzzle);

    ship.position.set(0, -1.55, -7);
    scene.add(ship);
  }

  /* ---------- 第一人称：驾驶舱（挂在相机上） ---------- */
  function buildCockpit(){
    rig = new THREE.Group();
    const hull = shipMaterial({color: 0x6b7590});
    const dark = new THREE.MeshStandardMaterial({color: 0x12161f, metalness: .6, roughness: .6});

    // 底部控制台
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, .34, .5), hull);
    panel.position.set(0, -.66, -1.15);
    panel.rotation.x = -.28;
    rig.add(panel);
    // 台面发光按钮
    [0x53f5ff, 0xffb454, 0xff5d5d, 0x53f5ff, 0x8affc1].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.07, .02, .05),
        new THREE.MeshBasicMaterial({color: c, fog: false}));
      b.position.set(-.32 + i * .16, -.5 + Math.abs(i - 2) * .008, -1.02);
      b.rotation.x = -.28;
      rig.add(b);
    });
    // 两侧 A 柱 + 柱脚斜撑
    for (const sx of [-1, 1]){
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(.09, 1.7, .13), dark);
      pillar.position.set(sx * .98, .05, -1.15);
      pillar.rotation.z = sx * .42;
      rig.add(pillar);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(.07, .7, .1), hull);
      strut.position.set(sx * .68, -.52, -1.05);
      strut.rotation.z = sx * .5;
      rig.add(strut);
    }
    // 顶部横梁
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.75, .09, .14), dark);
    beam.position.set(0, .68, -1.2);
    rig.add(beam);

    camera.add(rig);
  }

  /* ---------- 第一人称：炮枪（挂在相机上） ---------- */
  function buildGun(){
    gun = new THREE.Group();
    const metal = shipMaterial({color: 0x8892ac, metalness: .85, roughness: .35});
    const dark  = new THREE.MeshStandardMaterial({color: 0x161b28, metalness: .7, roughness: .5});

    const body = new THREE.Mesh(new THREE.BoxGeometry(.22, .16, .36), metal);
    gun.add(body);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, .035, .4), dark);
    rail.position.set(0, .095, -.03);
    gun.add(rail);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.075, .22, .1), dark);
    grip.position.set(0, -.17, .1); grip.rotation.x = .35;
    gun.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.16, .03, .12), dark);
    guard.position.set(0, -.1, -.05);
    gun.add(guard);
    // 双枪管
    for (const sx of [-1, 1]){
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.028, .036, .5, 10), metal);
      barrel.rotation.x = -Math.PI / 2;
      barrel.position.set(sx * .07, .02, -.36);
      gun.add(barrel);
    }
    // 枪口能量核
    gunMuzzle = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 12),
      new THREE.MeshBasicMaterial({color: 0x53f5ff, fog: false}));
    gunMuzzle.position.set(0, .02, -.62);
    gun.add(gunMuzzle);

    gun.position.set(0, -.42, GUN_Z);
    gun.rotation.x = -.06;
    camera.add(gun);
  }

  /* ---------- 视角切换 ---------- */
  function applyViewMode(){
    const third = viewMode === 'third';
    ship.visible = third;
    rig.visible = !third;
    gun.visible = !third;
  }
  function toggleView(){
    viewMode = viewMode === 'third' ? 'first' : 'third';
    try{ localStorage.setItem('wd_view', viewMode); }catch(e){}
    applyViewMode();
    return viewMode;
  }

  /* ---------- 坐标工具 ---------- */
  // 陨石的世界位置（含逐字母缩小的比例）
  function shrinkOf(e){
    return .35 + .65 * (1 - e.typed / e.word.length);
  }
  function posOf(e){
    return _v.set(e.pos.x, e.pos.y, e.pos.z);
  }
  // 世界坐标 → 屏幕像素（含陨石半径的像素尺寸，供 DOM 标签定位）
  function toScreen(e){
    const dist = camera.position.distanceTo(posOf(e));
    const p = posOf(e).clone().project(camera);
    return {
      x: (p.x * .5 + .5) * window.innerWidth,
      y: (-p.y * .5 + .5) * window.innerHeight,
      rPx: (e.wr * .028 * shrinkOf(e)) / (TAN_H() * dist) * (window.innerHeight / 2),
      d: dist
    };
  }
  const TAN_H = () => Math.tan(camera.fov * Math.PI / 360);

  /* ---------- 陨石 ---------- */
  function jitterGeo(seed){
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++){
      _v.fromBufferAttribute(pos, i).multiplyScalar(seed[i % seed.length]);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  function syncEnemy(e, t, target){
    if (!e._mesh){
      e._mesh = new THREE.Mesh(jitterGeo(e.seed), new THREE.MeshStandardMaterial({
        color: e.gold ? 0x9a7420 : 0x4a5266,
        flatShading: true, roughness: .9, metalness: .1
      }));
      scene.add(e._mesh);
    }
    const m = e._mesh;
    m.position.copy(posOf(e));
    m.scale.setScalar(e.wr * .028 * shrinkOf(e));   // 每命中一个字母就缩小一截（整体已放大）
    m.rotation.set(e.rot, e.rot * .7, 0);
    // 击中白闪（120ms）优先于其他状态光效
    if (performance.now() - e.hitT < 120){
      m.material.emissive.setHex(0xffffff);
      m.material.emissiveIntensity = 1.6;
    } else if (e.gold){
      m.material.emissive.setHex(0x604510);
      m.material.emissiveIntensity = .8 + Math.sin(t * 5) * .3;
    } else if (target === e){
      m.material.emissive.setHex(0x0a3a44);
      m.material.emissiveIntensity = 1;
    } else if (e.p > .78){   // 逼近地球警戒：红色脉冲
      m.material.emissive.setHex(0x551111);
      m.material.emissiveIntensity = .6 + Math.abs(Math.sin(t * 9)) * .8;
    } else {
      m.material.emissive.setHex(0x000000);
    }
  }
  function free(e){
    if (e._mesh){
      scene.remove(e._mesh);
      e._mesh.geometry.dispose();
      e._mesh.material.dispose();
      e._mesh = null;
    }
  }

  /* ---------- 射击 / 爆炸 / 命中碎屑 ---------- */
  function fire(e, color){
    // 当前视角对应的枪口：第三人称 = 机头，第一人称 = 舱内炮枪
    const src = viewMode === 'third' ? shipMuzzle : gunMuzzle;
    const a = new THREE.Vector3();
    src.getWorldPosition(a);
    const b = posOf(e).clone();
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.012, .012, len, 5, 1, true),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false})
    );
    mesh.position.copy(a).lerp(b, .5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    scene.add(mesh);
    lasers.push({mesh, age: 0, life: .13});
    flash.position.copy(a);
    flash.color.set(color);
    flash.intensity = 3;
    src.material.color.set(color);
    gunKick = .08;
  }
  function spawnBurst(center, n, colorHex, scaleK){
    const positions = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++){
      positions[i * 3] = center.x; positions[i * 3 + 1] = center.y; positions[i * 3 + 2] = center.z;
      vel.push(new THREE.Vector3().randomDirection().multiplyScalar((.8 + Math.random() * 2.2) * scaleK));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      color: colorHex, size: .09 * scaleK, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    scene.add(pts);
    bursts.push({pts, vel, age: 0, life: .7});
  }
  // 击毁 / 撞击爆炸
  function explode(e, colorHex){
    const dist = camera.position.distanceTo(posOf(e));
    spawnBurst(posOf(e).clone(), e.gold ? 42 : 26,
      colorHex || (e.gold ? 0xffd65a : 0xff9a4d), Math.max(.5, dist / 25));
  }
  // 单字母命中：少量碎屑
  function chip(e, color){
    spawnBurst(posOf(e).clone(), 6, color === '#53f5ff' ? 0x9ff8ff : 0xffd65a,
      Math.max(.3, camera.position.distanceTo(posOf(e)) / 40));
  }

  /* ---------- 帧渲染 ---------- */
  function render(dt, t, running, shake, target, enemies){
    earth.rotation.y += dt * .03;
    atmo.rotation.y = earth.rotation.y;
    starPts.rotation.y += dt * (running ? .012 : .004);

    // 方向键 / 触屏：只平移飞船，相机与地球不动
    updateMoveInput(dt);

    // 相机位姿：向当前视角的基准位姿平滑过渡（姿态锁定）
    const pose = viewMode === 'third' ? POSE_THIRD : POSE_FIRST;
    camPos.lerp(pose.pos, Math.min(1, dt * 5));

    // 飞船移动偏移平滑
    const kM = Math.min(1, dt * 6);
    move.x += (move.tx * RANGE_X - move.x) * kM;
    move.y += (move.ty * RANGE_Y - move.y) * kM;

    // Ctrl 变焦
    const targetFov = zoomHeld ? ZOOM_FOV : FOV;
    if (Math.abs(camera.fov - targetFov) > .05){
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }

    // 相机：固定朝向 + 震动 + 待机呼吸；第一人称时随飞船平移
    const sx = shake > .01 ? (Math.random() - .5) * shake * .004 : 0;
    const sy = shake > .01 ? (Math.random() - .5) * shake * .004 : 0;
    const fpShift = viewMode === 'first' ? 1 : 0;
    camera.position.set(
      camPos.x + move.x * fpShift + sx,
      camPos.y + move.y * fpShift + sy + (running ? 0 : Math.sin(t * .5) * .06),
      camPos.z
    );
    camera.rotation.set(pose.pitch, 0, 0);

    // 飞船平移（第三人称可见时）：整体挪动 + 顺势倾斜
    if (viewMode === 'third'){
      ship.position.x = move.x;
      ship.position.y = -1.55 + Math.sin(t * 1.6) * .05 + move.y;
      ship.rotation.z = -move.x * .22 + Math.sin(t * .9) * .02;
      ship.rotation.y = move.x * .1;
      ship.rotation.x = -move.y * .12;
      for (const gl of engineGlows){
        const s = 1 + Math.sin(t * 22 + gl.position.x * 10) * .18;
        gl.scale.setScalar(s);
      }
    }

    // 第一人称炮枪：后坐回弹 + 呼吸浮动
    gunKick = Math.max(0, gunKick - dt * .5);
    gun.position.z = GUN_Z + gunKick;
    gun.position.y = -.42 + Math.sin(t * 1.8) * .006;

    flash.intensity = Math.max(0, flash.intensity - dt * 40);

    // 激光衰减
    for (const l of lasers){
      l.age += dt;
      l.mesh.material.opacity = .9 * Math.max(0, 1 - l.age / l.life);
    }
    lasers = lasers.filter(l => {
      if (l.age >= l.life){
        scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose();
        return false;
      }
      return true;
    });

    // 爆炸 / 碎屑粒子
    for (const b of bursts){
      b.age += dt;
      const pos = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++){
        b.vel[i].y -= dt * .8;
        pos.setXYZ(i,
          pos.getX(i) + b.vel[i].x * dt,
          pos.getY(i) + b.vel[i].y * dt,
          pos.getZ(i) + b.vel[i].z * dt);
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.age / b.life);
    }
    bursts = bursts.filter(b => {
      if (b.age >= b.life){
        scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose();
        return false;
      }
      return true;
    });

    // 同步陨石网格
    if (enemies) for (const e of enemies) syncEnemy(e, t, target);

    renderer.render(scene, camera);
  }

  function resize(){
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return {init, resize, render, fire, explode, chip, free, toScreen, toggleView, EARTH};
})();
