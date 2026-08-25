'use strict';
/* ============================================================
   卖家可修改区 —— 发货前建议改 SHOP_NAME
   ============================================================ */
const CONFIG = {
  SHOP_NAME: '星际打字防线',   // 战绩卡底部引流文字，改成你的店铺名 / 小红书号

  // 难度参数（数值越大越难）—— 全部随波次线性递增，避免陡坎后陷入平坦
  LIVES: 3,                    // 生命值
  SPEED_BASE: 58,              // 首波陨石速度
  WAVE_SPEED_RAMP: 9,          // 每提升一波的速度增量（约 32 波才到顶）
  SPEED_MAX: 340,              // 速度上限（远期才触及）

  // 波次参数
  WAVE_BASE: 10,               // 首波陨石数量（每波保持 10 个以上）
  WAVE_ADD: 1,                 // 每波递增数量
  WAVE_MAX: 16,                // 单波数量上限（第 7 波满编）
  WAVE_REST: 2600,             // 波与波之间的休整间隔（毫秒）
  WAVE_REST_RAMP: 90,          // 每提升一波的休整缩短（毫秒）
  WAVE_REST_MIN: 1200,         // 休整下限
  WAVE_TRICKLE: 430,           // 首波的波内出场间隔（毫秒）
  WAVE_TRICKLE_RAMP: 38,       // 每提升一波的出场间隔缩短——波次越高越接近同时出现
  WAVE_TRICKLE_MIN: 45,        // 出场间隔下限（约等于齐射）

  // 佯攻参数
  MISS_CHANCE: 0.3,            // 佯攻陨石比例（轨迹与地球擦肩而过，无伤飞离）

  // 彩蛋参数
  EGG_CHANCE: 0.02,            // 彩蛋陨石出现概率（开局 10 秒后生效）
  EGG_BONUS: 500,              // 彩蛋加分
  OVERDRIVE_COMBO: 16,         // 连击达到此值触发狂暴模式
};

// 彩蛋词库：金色陨石，击毁得高分
const EGG_WORDS = ['xiaohongshu', 'xianyu', 'hongbao', 'maomao', 'jiayou', 'wanan', 'facai'];

// 工具函数
const $ = id => document.getElementById(id);
