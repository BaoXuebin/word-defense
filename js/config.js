'use strict';
/* ============================================================
   卖家可修改区 —— 发货前建议改 SHOP_NAME
   ============================================================ */
const CONFIG = {
  SHOP_NAME: '星际打字防线',   // 战绩卡底部引流文字，改成你的店铺名 / 小红书号

  // 难度参数 —— 出怪与速度随「得分」线性递增：打得越好，来得越快
  // 平衡目标：TPM≈100 的玩家可存活并拿到 10000+ 分（约 3-4 分钟）
  LIVES: 4,                    // 生命值
  MAX_ENEMIES: 6,              // 同屏陨石上限
  SPAWN_START: 3800,           // 起始出怪间隔（毫秒）
  SPAWN_RAMP: 0.05,            // 每得 1 分缩短的出怪间隔（毫秒）
  SPAWN_MIN: 2100,             // 出怪间隔下限
  SPEED_BASE: 52,              // 初始陨石速度
  SPEED_RAMP: 0.007,           // 每得 1 分的速度增量
  SPEED_MAX: 170,              // 速度上限

  // 佯攻参数
  MISS_CHANCE: 0.2,            // 佯攻陨石比例（轨迹与地球擦肩而过，无伤飞离）

  // 彩蛋参数
  EGG_CHANCE: 0.02,            // 彩蛋陨石出现概率（开局 10 秒后生效）
  EGG_BONUS: 500,              // 彩蛋加分
  OVERDRIVE_COMBO: 16,         // 连击达到此值触发狂暴模式
};

// 彩蛋词库：金色陨石，击毁得高分
const EGG_WORDS = ['xiaohongshu', 'xianyu', 'hongbao', 'maomao', 'jiayou', 'wanan', 'facai'];

// 工具函数
const $ = id => document.getElementById(id);
