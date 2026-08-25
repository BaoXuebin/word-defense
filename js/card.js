'use strict';
/* ---------- 战绩卡：900×1200（小红书 3:4），Canvas 绘制 ----------
   配色与装饰随段位变化：段位越高主题越华丽，星级行直观展示段位档位 */

const RANK_TIERS = ['和平主义者', '太空菜鸟', '见习炮手', '轨道卫士', '王牌飞行员', '星际指挥官', '银河传说'];
const CARD_THEMES = [
  {ink: '#a7aec0', bgTop: '#0e1119', earth: 'rgba(96,104,126,.42)',  star: '#cfe8ff'}, // 和平主义者 · 银灰
  {ink: '#79b8ff', bgTop: '#0a1526', earth: 'rgba(52,110,190,.5)',   star: '#cfe4ff'}, // 太空菜鸟 · 蓝
  {ink: '#8affc1', bgTop: '#0a1f18', earth: 'rgba(46,150,110,.45)',  star: '#d2ffe9'}, // 见习炮手 · 绿
  {ink: '#53f5ff', bgTop: '#0d1226', earth: 'rgba(46,111,183,.55)',  star: '#cfe8ff'}, // 轨道卫士 · 青
  {ink: '#c78bff', bgTop: '#170e28', earth: 'rgba(140,80,220,.45)',  star: '#eadcff'}, // 王牌飞行员 · 紫
  {ink: '#ffb454', bgTop: '#1f1506', earth: 'rgba(200,130,50,.5)',   star: '#ffe9c4'}, // 星际指挥官 · 琥珀
  {ink: '#ffd65a', bgTop: '#241a04', earth: 'rgba(230,170,60,.55)',  star: '#fff3cf', legend: true}, // 银河传说 · 金
];

// hex → rgba
function tint(hex, a){
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function drawCard(st){
  const c = $('card-canvas'), g = c.getContext('2d');
  const SERIF = '"Songti SC","STSong","Noto Serif SC","SimSun",serif';
  const MONO = 'ui-monospace,"Cascadia Mono","Courier New",monospace';
  const tier = Math.max(0, RANK_TIERS.indexOf(st.rank));
  const th = CARD_THEMES[tier] || CARD_THEMES[3];
  const acc = th.ink;

  // 背景（随段位染色）
  const bg = g.createLinearGradient(0, 0, 0, 1200);
  bg.addColorStop(0, th.bgTop); bg.addColorStop(1, '#06080f');
  g.fillStyle = bg; g.fillRect(0, 0, 900, 1200);
  // 星星（传说级混入金星）
  for (let i = 0; i < 140; i++){
    g.globalAlpha = .2 + Math.random() * .6;
    g.fillStyle = th.legend && Math.random() < .35 ? '#ffd65a' : th.star;
    g.beginPath(); g.arc(Math.random() * 900, Math.random() * 1200, Math.random() * 1.8 + .4, 0, 6.28); g.fill();
  }
  g.globalAlpha = 1;
  // 底部地球弧（颜色随段位）
  const eg = g.createRadialGradient(450, 1350, 300, 450, 1350, 520);
  eg.addColorStop(0, th.earth); eg.addColorStop(1, 'transparent');
  g.fillStyle = eg;
  g.beginPath(); g.arc(450, 1350, 520, 0, 6.28); g.fill();
  // 高段位：分数背后的辉光
  if (tier >= 4){
    const rg = g.createRadialGradient(450, 560, 40, 450, 560, 310);
    rg.addColorStop(0, tint(acc, .14)); rg.addColorStop(1, 'transparent');
    g.fillStyle = rg; g.fillRect(130, 280, 640, 560);
  }
  // 边框（随段位染色）
  g.strokeStyle = tint(acc, .55); g.lineWidth = 3;
  g.strokeRect(36, 36, 828, 1128);
  g.strokeStyle = tint(acc, .18); g.lineWidth = 1;
  g.strokeRect(52, 52, 796, 1096);
  // 指挥官 / 传说：四角饰角
  if (tier >= 5){
    g.strokeStyle = acc; g.lineWidth = 5; g.lineCap = 'round';
    [[36, 36, 1, 1], [864, 36, -1, 1], [36, 1164, 1, -1], [864, 1164, -1, -1]].forEach(([x, y, dx, dy]) => {
      g.beginPath();
      g.moveTo(x + dx * 46, y); g.lineTo(x, y); g.lineTo(x, y + dy * 46);
      g.stroke();
    });
    g.lineCap = 'butt'; g.lineWidth = 1;
  }
  // 传说：分数外围虚线光环 + 双彗星划痕
  if (th.legend){
    g.strokeStyle = tint(acc, .5); g.lineWidth = 2; g.setLineDash([12, 16]);
    g.beginPath(); g.arc(450, 570, 196, 0, 6.28); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = tint(acc, .35); g.lineWidth = 3;
    g.beginPath(); g.moveTo(120, 250); g.lineTo(300, 175); g.stroke();
    g.beginPath(); g.moveTo(780, 950); g.lineTo(600, 1025); g.stroke();
    g.lineWidth = 1;
  }
  // 标题
  g.textAlign = 'center';
  g.fillStyle = acc; g.font = `600 26px ${MONO}`;
  g.fillText('W O R D   D E F E N S E', 450, 130);
  g.fillStyle = '#dfe6f3'; g.font = `900 62px ${SERIF}`;
  g.fillText('星际打字防线', 450, 215);
  // 段位
  g.fillStyle = acc;
  g.shadowColor = tint(acc, .6); g.shadowBlur = 28;
  g.font = `900 74px ${SERIF}`;
  g.fillText(st.rank, 450, 360);
  g.shadowBlur = 0;
  // 段位星级（和平主义者不显示星）
  if (tier > 0){
    g.fillStyle = acc; g.shadowColor = tint(acc, .55); g.shadowBlur = 14;
    g.font = `20px ${MONO}`;
    g.fillText(Array(tier).fill('★').join(' '), 450, 404);
    g.shadowBlur = 0;
  }
  // 总分
  g.fillStyle = '#7d8797'; g.font = `22px ${MONO}`;
  g.fillText('— 总分 SCORE —', 450, 470);
  g.fillStyle = acc;
  g.shadowColor = tint(acc, .55); g.shadowBlur = 34;
  g.font = `700 150px ${MONO}`;
  g.fillText(String(st.score), 450, 615);
  g.shadowBlur = 0;
  // 数据行
  const rows = [
    ['击毁', st.kill, '最大连击', st.combo],
    ['WPM', st.wpm, '正确率', st.acc + '%'],
  ];
  rows.forEach((r, i) => {
    const y = 730 + i * 88;
    g.fillStyle = '#7d8797'; g.font = `20px ${MONO}`;
    g.fillText(r[0], 260, y - 30); g.fillText(r[2], 640, y - 30);
    g.fillStyle = '#dfe6f3'; g.font = `600 38px ${MONO}`;
    g.fillText(String(r[1]), 260, y + 14); g.fillText(String(r[3]), 640, y + 14);
  });
  g.fillStyle = '#7d8797'; g.font = `20px ${MONO}`;
  g.fillText('坚持时长', 450, 905);
  g.fillStyle = '#dfe6f3'; g.font = `600 38px ${MONO}`;
  g.fillText(st.time, 450, 950);
  // 彩蛋行（有彩蛋才显示）
  if (st.eggs > 0){
    g.fillStyle = '#ffb454'; g.font = `600 26px ${SERIF}`;
    g.fillText('✦ 发现彩蛋 × ' + st.eggs + ' ✦', 450, 1000);
  }
  // 底部
  g.strokeStyle = 'rgba(125,135,151,.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(150, 1020); g.lineTo(750, 1020); g.stroke();
  g.fillStyle = '#7d8797'; g.font = `20px ${MONO}`;
  g.fillText(new Date().toLocaleDateString('zh-CN'), 450, 1062);
  g.fillStyle = acc; g.font = `600 24px ${SERIF}`;
  g.fillText(CONFIG.SHOP_NAME + ' · 长按保存 来挑战我', 450, 1110);
  $('card-preview').src = c.toDataURL('image/png');
}
