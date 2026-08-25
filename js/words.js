'use strict';
/* ---------- 内置通用词库 & 自定义词库管理 ---------- */

const DEFAULT_WORDS = (`time year people way day man thing woman life child world school state family
student group country problem hand part place case week company system program question work government
number night point home water room mother area money story fact month right study book eye job word
business issue side kind head house service friend father power hour game line end member law car city
community name team minute idea kid body back parent face level office door health person art war
history party result change morning reason research girl guy moment air teacher force education about
after again against also always animal answer around away baby ball because been before began begin
behind believe best better between bird black blue boat both bring brother build busy call came care
carry catch cause center certain change check children class clean clear close cold color come common
could country course dark dear deep different done down draw drink drive during each early earth easy
enough even every example fall farm fast feel feet field find fire first fish five follow food form
found four free from full gave good great green ground grow hard have hear help here high hold horse
house hundred idea important interest into keep kind knew know land large last later learn leave left
letter light like line list little live long look made make many mean might mile milk mind miss money
more most morning mother mountain move much must name near need never next night north note nothing
number often once only open order other over page paper part pass people perhaps picture place plan
play point question quick rain read remember rest right river road rock room said same school second
seem sentence several ship short should show side sing small snow some something song soon sound south
spell stand start state stay still stop story street study such sure table take talk tell than that
their them then there these they thing think this those thought three through today together told took
town tree turn under until upon very voice walk want warm watch water well went were what when where
which while white will wind with without wood word work world would write year yellow young
space star rocket ship laser alien orbit comet moon mars pilot radar shield engine cosmic nova flare
drift launch cargo rover probe solar lunar astro meteor nebula photon plasma galaxy universe gravity
station capsule mission signal beacon sector vector warp fusion reactor blaster cannon turret squad
fleet cloud storm thunder rain wind flame frost spark ember stone iron steel copper silver gold crystal
shadow light dream magic sword arrow shield brave swift quiet proud noble ancient future
`).split(/\s+/).filter(Boolean);

// 从任意文本提取有效单词（去重、2-20 个字符）
function parseWords(text){
  const seen = new Set();
  for (const w of text.toLowerCase().split(/[^a-z'\-]+/)){
    if (w.length >= 2 && w.length <= 20 && /[a-z]/.test(w)) seen.add(w);
  }
  return [...seen];
}

// 读取当前词库：优先用户自定义，否则内置通用
function getWords(){
  try{
    const raw = localStorage.getItem('wd_custom_words');
    if (raw){
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length >= 5) return {list: arr, custom: true};
    }
  }catch(e){}
  return {list: DEFAULT_WORDS, custom: false};
}

function saveWords(arr){
  localStorage.setItem('wd_custom_words', JSON.stringify(arr));
}

function clearWords(){
  localStorage.removeItem('wd_custom_words');
}

function shuffled(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
