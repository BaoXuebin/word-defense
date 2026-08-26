'use strict';
/* ============================================================
   卖家可修改区 —— 发货前建议改 SHOP_NAME
   ============================================================ */
const CONFIG = {
  SHOP_NAME: '星际打字防线',   // 战绩卡底部引流文字，改成你的店铺名 / 小红书号
  SITE_URL: 'https://word-defense.2aigc.space',   // 官网地址（预留）
  GA_ID: 'G-5EQ9BRNGJQ',       // Google Analytics 衡量 ID，留空则不加载统计

  // 基础规则
  LIVES: 3,                    // 生命值（地球被撞 3 次防线崩溃）
  RUN_MS: 180000,              // 一局节奏基准：3 分钟

  // 难度档位：3 分钟内出现的陨石总数 total；出怪间隔从 I0 线性收紧到 I1，
  // 同屏上限 cap 逐档放宽。时间走到头剩余的配额作为「终局波」一次全部出现。
  // 击碎当局全部陨石即胜利。地狱难度需先在「终极」获胜解锁。
  DIFFS: [
    {name: '简单', I0: 4200, I1: 1800, cap: 4, total: 60},    // 约 60 枚
    {name: '中等', I0: 3200, I1: 800,  cap: 5, total: 90},    // 约 90 枚
    {name: '终极', I0: 2600, I1: 400,  cap: 6, total: 120},   // 约 120 枚
    {name: '地狱', I0: 1300, I1: 200,  cap: 8, total: 240},   // 约 240 枚
  ],

  // 陨石速度：随对局进行（时间）线性提升，个体系数快慢不一
  SPEED_BASE: 52,              // 初始陨石速度
  SPEED_MAX: 190,              // 速度上限

  // 彩蛋参数
  EGG_CHANCE: 0.02,            // 彩蛋陨石出现概率（开局 10 秒后生效）
  EGG_BONUS: 500,              // 彩蛋加分
  OVERDRIVE_COMBO: 16,         // 连击达到此值触发狂暴模式
};

// 顶层 const 不会挂到 window，显式暴露，便于 index.html 的 GA 脚本判断
window.CONFIG = CONFIG;

// 彩蛋词库：金色陨石，击毁得高分
const EGG_WORDS = ['xiaohongshu', 'xianyu', 'hongbao', 'maomao', 'jiayou', 'wanan', 'facai'];

// 工具函数
const $ = id => document.getElementById(id);
