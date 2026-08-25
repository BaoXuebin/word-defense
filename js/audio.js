'use strict';
/* ---------- WebAudio 合成音效，零外部资源 ---------- */

let AC = null;
function ac(){
  if (!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} }
  return AC;
}

// 短促电子音：打字、击键反馈
function blip(freq, dur = .05, type = 'square', vol = .035){
  if (!S.sound) return;
  const a = ac(); if (!a) return;
  try{
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }catch(e){}
}

// 爆炸噪声
function boomSound(){
  if (!S.sound) return;
  const a = ac(); if (!a) return;
  try{
    const len = a.sampleRate * .3, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.value = .18;
    s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start();
  }catch(e){}
}

// 彩蛋 / 解锁提示音：上行琶音
function arpeggio(){
  [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, .09, 'triangle', .05), i * 90));
}
