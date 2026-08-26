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

/* ---------- 内置四级 / 六级核心词库 ----------
   与 wordlists/cet4-core.txt / cet6-core.txt 保持一致，
   供「自定义词库」面板一键选择（file:// 下无法 fetch 本地 txt）。 */
const CET4_WORDS = (`abandon ability abroad absolute absorb abstract abuse academic accelerate access accident accompany accomplish account accurate accuse achieve acquire adapt additional adequate adjust admire admit adopt advance advantage adventure advertise advise advocate affair affect afford agency aggressive agriculture alarm alcohol alert alternative amateur amaze ambition amount amuse analyze ancient anniversary announce annual anxious apologize apparent appeal appearance apply appoint appreciate approach appropriate approve argue arise arrange artificial ashamed assign assist associate assume assure athlete atmosphere attach attack attempt attend attitude attract authority automatic available average avoid award aware awful awkward background balance barely barrier basis battery behave behalf belief benefit besides blame blanket block border bother bound brand brave breathe brief brilliant budget burden burst campaign cancel candidate capable career careless casual celebrate ceremony challenge channel character charity charm chase cheerful chemical chief circumstance citizen civilization claim climate clue clumsy coach combine comfort command comment commerce commit communicate community compare compete complain complete complex compose concentrate concern conclude condition conduct confident confirm conflict confuse congratulate connect conscious consequence consider consist constant construct consult consume contact contain content contest continent continue contract contrary contrast contribute control convenient convince cooperate corporation correspond courage crash create credit crew crime crisis critic crop crowd cruel culture curious current custom damage decade declare decline decorate decrease defeat defend define degree delay delicate deliver demand democracy demonstrate deny depart depend deposit depress describe desert deserve design desire despite destination destroy detail detect determine develop device devote differ digest digital disaster discipline discount discover disease dismiss display distance distinct distinguish distribute district disturb diverse divorce domestic draft
`).split(/\s+/).filter(Boolean);

const CET6_WORDS = (`abolish absurd abundance accessory accommodate accordance acquaint adhere adjacent administer adolescent adversity aesthetic affiliate aggravate aggregate alleviate ambiguous ambitious amend ample analogy anonymous apparatus appraise arbitrary articulate ascend ascertain aspiration assault assert assimilate authorize autonomous avert aviation bleak blunder boost boycott breach brittle casualty catastrophe census chronic circulation cite coalition coincide collaborate collide commend commodity commonplace compensate compile complement complexity comply component comprehend compulsory conceive confer confidential conform consensus consolidate conspicuous constituent constrain contaminate contemplate contempt contend contradictory convene converge corrupt counsel crucial cumulative cynical dedicate deem defiance deficit degenerate deliberate denote denounce deprive derive designate deteriorate diagnose diffuse dilemma diminish discreet discrepancy discrete dispatch disperse distort divert domain dominate drastic dwell eligible eloquent embark embody eminent empirical endeavor endorse endure energetic enrich ensue entail enterprise entity envisage epidemic epoch equivalent erosion essence eternal ethnic evoke exaggerate exceed excel exempt exile exotic expel expire explicit exploit exquisite extinct extract extravagant fabricate facilitate feasible federal feeble flank fling fluctuate formidable fortitude foster fragile fraud friction fulfill furious futile gauge generate genuine glamour glimpse gloomy grace grant grief grim guarantee hamper harness haste haunt hazard heir heritage hierarchy hinder homogeneous hospitality hostage humble hybrid hygiene hypothesis identical ideology ignite ignorance illuminate illusion immerse immune impair impart imperative impetus implement implicit impose incentive incidence inclined indignant indispensable induce infer ingenious inherent inhibit initiate innovation insight inspire integral integrity intellect intelligible intense interact interim intermittent intervene intimate intricate intrinsic intuition inventory invert jeopardize junction latent legitimate liable linger literacy literal lobby lofty luminous lure magnetic magnify magnitude manifest manipulate manuscript margin mediate medieval merchandise merge metaphor migrate militant mingle miniature minimal minimize mock monopoly morale mortal mortgage municipal naive narrate negligible nominal nominate norm notable notify notion notorious nourish novelty nuisance nurture obedient obscure obsession obstruct occupy odds offense offset opaque optimistic orient outbreak outlet outrage overlap overlook overt overthrow overwhelm
`).split(/\s+/).filter(Boolean);

// 内置词库预设：通用 / 四级核心词 / 六级核心词
const LIB_PRESETS = {
  general: {key: 'general', name: '内置通用', words: DEFAULT_WORDS},
  cet4:    {key: 'cet4',    name: '四级核心词', words: CET4_WORDS},
  cet6:    {key: 'cet6',    name: '六级核心词', words: CET6_WORDS},
};

// 从任意文本提取有效单词（去重、2-20 个字符）
function parseWords(text){
  const seen = new Set();
  for (const w of text.toLowerCase().split(/[^a-z'\-]+/)){
    if (w.length >= 2 && w.length <= 20 && /[a-z]/.test(w)) seen.add(w);
  }
  return [...seen];
}

// 当前内置词库预设键（general | cet4 | cet6）
function getPreset(){
  try{
    const p = localStorage.getItem('wd_lib_preset');
    if (p && LIB_PRESETS[p]) return p;
  }catch(e){}
  return 'general';
}

function setPreset(key){
  try{ localStorage.setItem('wd_lib_preset', LIB_PRESETS[key] ? key : 'general'); }catch(e){}
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
  const lib = LIB_PRESETS[getPreset()] || LIB_PRESETS.general;
  return {list: lib.words, custom: false, preset: lib.key};
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
