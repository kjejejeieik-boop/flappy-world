// ═══════════════════════════════════════════════════════
//  FLAPPY WORLD — Game Engine v2  (all bugs fixed)
//  Fixes: sound, death/fall, game-over stuck, respawn
// ═══════════════════════════════════════════════════════

// ══════════════════════════════════════════
//  CANVAS SETUP
// ══════════════════════════════════════════
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const WRAPPER = document.getElementById('gameWrapper');

let W, H;
function resizeCanvas() {
  canvas.width  = WRAPPER.clientWidth;
  canvas.height = WRAPPER.clientHeight;
  W = canvas.width;
  H = canvas.height;
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); initBackground(); });

// ══════════════════════════════════════════
//  THEMES
// ══════════════════════════════════════════
const THEMES = [
  { name:'Sky',   skyTop:'#1a0550', skyBot:'#3a1a80', groundTop:'#5ade7a', groundMid:'#3ab558', groundBot:'#2a8040', pipeTop:'#3bde76', pipeDark:'#28a055', pipeHighlight:'#7affa3', pipeShadow:'rgba(0,0,0,0.4)', bgStars:true,  dot:'#7affaa' },
  { name:'City',  skyTop:'#0a0a1a', skyBot:'#1a1040', groundTop:'#666',    groundMid:'#444',    groundBot:'#222',    pipeTop:'#999',    pipeDark:'#555',    pipeHighlight:'#ccc',    pipeShadow:'rgba(0,0,0,0.5)', bgStars:true,  dot:'#aaa'    },
  { name:'Space', skyTop:'#000010', skyBot:'#060020', groundTop:'#7a5a3a', groundMid:'#5a3a20', groundBot:'#3a2010', pipeTop:'#cc7722', pipeDark:'#aa5511', pipeHighlight:'#ffaa44', pipeShadow:'rgba(0,0,0,0.5)', bgStars:true,  dot:'#ff8844' },
  { name:'Ocean', skyTop:'#001840', skyBot:'#003070', groundTop:'#d4a855', groundMid:'#b88830', groundBot:'#8a6020', pipeTop:'#00aacc', pipeDark:'#007799', pipeHighlight:'#80eeff', pipeShadow:'rgba(0,0,0,0.4)', bgStars:false, dot:'#40ddff' },
];
let themeIdx = 0, T = THEMES[0];
const themeDotsEl = document.getElementById('themeDots');
THEMES.forEach((th, i) => {
  const d = document.createElement('div');
  d.className = 'theme-dot' + (i===0?' active':'');
  d.style.background = th.dot;
  d.addEventListener('click', () => {
    themeIdx=i; T=THEMES[i];
    document.querySelectorAll('.theme-dot').forEach((el,j)=>el.classList.toggle('active',j===i));
    initBackground();
  });
  themeDotsEl.appendChild(d);
});

// ══════════════════════════════════════════
//  AUDIO  — fixed: resume suspended ctx, proper gain fade
// ══════════════════════════════════════════
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if (audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, type, dur, vol=0.22) {
  try {
    const ac=ensureAudio();
    const osc=ac.createOscillator(), gain=ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type=type; osc.frequency.value=freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+dur);
    osc.start(ac.currentTime); osc.stop(ac.currentTime+dur);
  } catch(e){}
}
function sfxFlap()    { playTone(520,'sine',0.10,0.20); playTone(380,'triangle',0.08,0.14); }
function sfxScore()   { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.12,0.16),i*55)); }
function sfxCoin()    { playTone(880,'sine',0.08,0.18); setTimeout(()=>playTone(1320,'sine',0.08,0.10),60); }
function sfxHit()     { playTone(180,'sawtooth',0.25,0.40); setTimeout(()=>playTone(100,'sawtooth',0.20,0.30),60); setTimeout(()=>playTone(60,'sawtooth',0.15,0.35),140); }
function sfxPowerup() { [300,500,700,900,1200].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.12,0.16),i*45)); }

// ══════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════
const GROUND_H=80, PIPE_W=64, PIPE_CAP_H=24, PIPE_CAP_W=PIPE_W+12;
const BASE_SPEED=2.8, BASE_GAP=185, MIN_GAP=125;
const GRAVITY=0.50, JUMP_FORCE=-9.4, PIPE_INTERVAL=88;
const POWERUPS=[
  {type:'slow',   label:'⏱ SLOW MO', color:'#80d0ff', duration:5000},
  {type:'shield', label:'🛡 SHIELD',  color:'#ffd84d', duration:4000},
  {type:'tiny',   label:'🔻 TINY',    color:'#c080ff', duration:6000},
];

// ══════════════════════════════════════════
//  GAME STATE
//  state: 'start' | 'playing' | 'dying' | 'dead'
// ══════════════════════════════════════════
let state='start', score=0, bestScore=+localStorage.getItem('fw_best')||0;
let frameCount=0, scrollX=0, gameSpeed=BASE_SPEED, gapSize=BASE_GAP;
let groundOffset=0, deathFlash=0, dyingTimer=0;
let activePU=null, puTimeout=null;
let bird, pipes, particles, coins, powerupItems;

// ══════════════════════════════════════════
//  PARALLAX BACKGROUND
// ══════════════════════════════════════════
let bgLayers=[];
function initBackground() {
  bgLayers=[];
  if(T.bgStars) {
    const stars=[];
    for(let i=0;i<100;i++) stars.push({x:Math.random()*W,y:Math.random()*H*0.85,r:Math.random()*1.8+0.3,op:Math.random()*0.6+0.3,tw:Math.random()*2+1});
    bgLayers.push({type:'stars',items:stars,speed:0});
  }
  const clouds=[];
  for(let i=0;i<6;i++) clouds.push({x:Math.random()*W,y:Math.random()*H*0.5,w:80+Math.random()*120,h:30+Math.random()*50,op:0.06+Math.random()*0.09});
  bgLayers.push({type:'clouds',items:clouds,speed:0.2});
  const hills=[];
  for(let i=0;i<8;i++) hills.push({x:i*(W/4)+Math.random()*30-15,h:H*0.25+Math.random()*H*0.2,w:60+Math.random()*80});
  bgLayers.push({type:'hills',items:hills,speed:0.5});
}
function drawBackground(sx) {
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,T.skyTop); g.addColorStop(1,T.skyBot);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const now=performance.now()/1000;
  bgLayers.forEach(layer=>{
    const ox=(sx*layer.speed)%W;
    if(layer.type==='stars') {
      layer.items.forEach(s=>{
        ctx.globalAlpha=s.op*(0.5+0.5*Math.sin(now*s.tw+s.x));
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }); ctx.globalAlpha=1;
    } else if(layer.type==='clouds') {
      layer.items.forEach(c=>{
        const cx=((c.x-ox)%(W+200)+W+200)%(W+200)-100;
        const g2=ctx.createRadialGradient(cx,c.y,0,cx,c.y,c.w);
        g2.addColorStop(0,`rgba(255,255,255,${c.op*1.5})`); g2.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=g2; ctx.beginPath(); ctx.ellipse(cx,c.y,c.w,c.h,0,0,Math.PI*2); ctx.fill();
      });
    } else if(layer.type==='hills') {
      ctx.globalAlpha=0.35;
      layer.items.forEach(h=>{
        const hx=((h.x-ox*0.5)%(W+200)+W+200)%(W+200);
        for(let rep=0;rep<2;rep++){
          const rx=hx+rep*(W+200); if(rx<-100||rx>W+100) continue;
          ctx.beginPath();
          if(T.name==='City') ctx.rect(rx-h.w/2,H-GROUND_H-h.h,h.w,h.h);
          else { ctx.moveTo(rx-h.w,H-GROUND_H); ctx.bezierCurveTo(rx-h.w/2,H-GROUND_H-h.h*0.5,rx+h.w/2,H-GROUND_H-h.h*0.5,rx+h.w,H-GROUND_H); }
          ctx.closePath(); ctx.fillStyle=hexDarken(T.skyBot,-0.28); ctx.fill();
        }
      }); ctx.globalAlpha=1;
    }
  });
}
function hexDarken(hex,amt) {
  let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,Math.min(255,r+amt*255))|0},${Math.max(0,Math.min(255,g+amt*255))|0},${Math.max(0,Math.min(255,b+amt*255))|0})`;
}

// ══════════════════════════════════════════
//  GROUND
// ══════════════════════════════════════════
function drawGround() {
  const gy=H-GROUND_H;
  const gg=ctx.createLinearGradient(0,gy,0,H);
  gg.addColorStop(0,T.groundTop); gg.addColorStop(0.25,T.groundMid); gg.addColorStop(1,T.groundBot);
  ctx.fillStyle=gg; ctx.fillRect(0,gy,W,GROUND_H);
  ctx.fillStyle=T.groundTop; ctx.fillRect(0,gy,W,8);
  ctx.strokeStyle='rgba(0,0,0,0.09)'; ctx.lineWidth=1;
  const off=groundOffset%40;
  for(let tx=-off;tx<W;tx+=40){ctx.beginPath();ctx.moveTo(tx,gy+10);ctx.lineTo(tx,H);ctx.stroke();}
  const sg=ctx.createLinearGradient(0,gy,0,gy+16);
  sg.addColorStop(0,'rgba(0,0,0,0.28)'); sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg; ctx.fillRect(0,gy,W,16);
}

// ══════════════════════════════════════════
//  BIRD
// ══════════════════════════════════════════
function createBird() {
  return {x:W*0.22,y:H*0.45,vy:0,radius:18,wingAngle:0,wingDir:1,rotation:0,dead:false,shielded:false,tiny:false};
}
function updateBird() {
  const mult=activePU?.type==='slow'?0.42:1.0;
  bird.vy+=GRAVITY*mult; if(bird.vy>14) bird.vy=14;
  bird.y+=bird.vy*mult;
  bird.wingAngle+=0.3*bird.wingDir*(bird.vy<0?2:1)*mult;
  if(Math.abs(bird.wingAngle)>0.75) bird.wingDir*=-1;
  const tgt=Math.min(Math.max(bird.vy*3.5,-28),90);
  bird.rotation+=(tgt-bird.rotation)*0.18;
  if(bird.y-bird.radius<0){bird.y=bird.radius;bird.vy=0;}
  const bSize=bird.tiny?bird.radius*0.55:bird.radius;
  if(bird.y+bSize>=H-GROUND_H) {
    bird.y=H-GROUND_H-bSize;
    if(bird.shielded){bird.vy=-4;} else {bird.dead=true;}
  }
}
function drawBirdAt(x,y) {
  const scale=bird.tiny?0.55:1, r=18;
  ctx.save(); ctx.translate(x,y); ctx.rotate(bird.rotation*Math.PI/180); ctx.scale(scale,scale);
  if(bird.shielded) {
    const t=performance.now()/1000;
    ctx.save(); ctx.globalAlpha=0.28+0.14*Math.sin(t*6);
    const sg=ctx.createRadialGradient(0,0,r,0,0,r*2.4);
    sg.addColorStop(0,'rgba(255,220,0,0.55)'); sg.addColorStop(1,'rgba(255,180,0,0)');
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(0,0,r*2.4,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=0.5+0.2*Math.sin(t*9); ctx.strokeStyle='#ffd84d'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(0,0,r*1.7,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
  const bg=ctx.createRadialGradient(-4,-4,2,0,0,r);
  bg.addColorStop(0,'#ffe88a'); bg.addColorStop(0.5,'#ffca28'); bg.addColorStop(1,'#f08c00');
  ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(0,0,r,r*0.88,0,0,Math.PI*2); ctx.fill();
  ctx.save(); ctx.rotate(bird.wingAngle*0.5);
  const wg=ctx.createLinearGradient(-r*0.8,-r*0.3,-r*0.1,r*0.5);
  wg.addColorStop(0,'#ff9a2e'); wg.addColorStop(1,'#e06000'); ctx.fillStyle=wg;
  ctx.beginPath(); ctx.ellipse(-r*0.35,r*0.2+bird.wingAngle*r*0.4,r*0.55,r*0.28,-0.4+bird.wingAngle*0.3,0,Math.PI*2); ctx.fill(); ctx.restore();
  const bel=ctx.createRadialGradient(4,4,2,4,4,r*0.5);
  bel.addColorStop(0,'#fff9e0'); bel.addColorStop(1,'#ffdf80'); ctx.fillStyle=bel;
  ctx.beginPath(); ctx.ellipse(r*0.2,r*0.25,r*0.45,r*0.35,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(r*0.38,-r*0.2,r*0.28,r*0.28,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#1a1a2e'; ctx.beginPath(); ctx.arc(r*0.44,-r*0.2,r*0.13,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(r*0.48,-r*0.24,r*0.055,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ff8000'; ctx.beginPath(); ctx.moveTo(r*0.65,-r*0.05); ctx.lineTo(r*1.12,r*0.05); ctx.lineTo(r*0.65,r*0.16); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#cc5000'; ctx.beginPath(); ctx.moveTo(r*0.65,-r*0.01); ctx.lineTo(r*1.12,r*0.05); ctx.lineTo(r*0.65,r*0.06); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,140,90,0.38)'; ctx.beginPath(); ctx.ellipse(r*0.2,r*0.08,r*0.22,r*0.14,0.2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// bird preview animation
const prevCanvas=document.getElementById('birdPreview'), prevCtx=prevCanvas.getContext('2d');
let prevAngle=0, prevDir=1;
function animateBirdPreview() {
  prevCtx.clearRect(0,0,90,90);
  prevAngle+=0.18*prevDir; if(Math.abs(prevAngle)>0.7) prevDir*=-1;
  prevCtx.save(); prevCtx.translate(45,45); prevCtx.rotate(-8*Math.PI/180);
  const r=18;
  const bg=prevCtx.createRadialGradient(-4,-4,2,0,0,r);
  bg.addColorStop(0,'#ffe88a'); bg.addColorStop(0.5,'#ffca28'); bg.addColorStop(1,'#f08c00');
  prevCtx.fillStyle=bg; prevCtx.beginPath(); prevCtx.ellipse(0,0,r,r*0.88,0,0,Math.PI*2); prevCtx.fill();
  prevCtx.save(); prevCtx.rotate(prevAngle*0.5); prevCtx.fillStyle='#e06000';
  prevCtx.beginPath(); prevCtx.ellipse(-r*0.35,r*0.2+prevAngle*r*0.4,r*0.55,r*0.28,-0.4+prevAngle*0.3,0,Math.PI*2); prevCtx.fill(); prevCtx.restore();
  const bel=prevCtx.createRadialGradient(4,4,2,4,4,r*0.5); bel.addColorStop(0,'#fff9e0'); bel.addColorStop(1,'#ffdf80');
  prevCtx.fillStyle=bel; prevCtx.beginPath(); prevCtx.ellipse(r*0.2,r*0.25,r*0.45,r*0.35,0,0,Math.PI*2); prevCtx.fill();
  prevCtx.fillStyle='#fff'; prevCtx.beginPath(); prevCtx.ellipse(r*0.38,-r*0.2,r*0.28,r*0.28,0,0,Math.PI*2); prevCtx.fill();
  prevCtx.fillStyle='#1a1a2e'; prevCtx.beginPath(); prevCtx.arc(r*0.44,-r*0.2,r*0.13,0,Math.PI*2); prevCtx.fill();
  prevCtx.fillStyle='rgba(255,255,255,0.9)'; prevCtx.beginPath(); prevCtx.arc(r*0.48,-r*0.24,r*0.055,0,Math.PI*2); prevCtx.fill();
  prevCtx.fillStyle='#ff8000'; prevCtx.beginPath(); prevCtx.moveTo(r*0.65,-r*0.05); prevCtx.lineTo(r*1.12,r*0.05); prevCtx.lineTo(r*0.65,r*0.16); prevCtx.closePath(); prevCtx.fill();
  prevCtx.restore();
  requestAnimationFrame(animateBirdPreview);
}
animateBirdPreview();

// ══════════════════════════════════════════
//  PIPES
// ══════════════════════════════════════════
function createPipe() {
  const topH=60+Math.random()*(H-GROUND_H-gapSize-120);
  return {x:W+20,topH,scored:false};
}
function drawPipe(pipe) {
  const {x,topH}=pipe, botY=topH+gapSize, botH=H-GROUND_H-botY;
  _pipeBody(x-PIPE_W/2,0,PIPE_W,topH);
  _pipeCap(x-PIPE_CAP_W/2,topH-PIPE_CAP_H,PIPE_CAP_W,PIPE_CAP_H,false);
  _pipeBody(x-PIPE_W/2,botY,PIPE_W,botH);
  _pipeCap(x-PIPE_CAP_W/2,botY,PIPE_CAP_W,PIPE_CAP_H,true);
  const gg=ctx.createLinearGradient(x-PIPE_CAP_W/2,0,x+PIPE_CAP_W/2,0);
  gg.addColorStop(0,'rgba(255,255,255,0)'); gg.addColorStop(0.5,'rgba(255,255,255,0.04)'); gg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gg; ctx.fillRect(x-PIPE_CAP_W/2,topH,PIPE_CAP_W,gapSize);
}
function _pipeBody(x,y,w,h) {
  if(h<=0) return;
  const g=ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,T.pipeDark); g.addColorStop(0.3,T.pipeHighlight); g.addColorStop(0.6,T.pipeTop); g.addColorStop(1,T.pipeDark);
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  ctx.fillStyle=T.pipeShadow; ctx.fillRect(x,y,4,h); ctx.fillRect(x+w-4,y,4,h);
}
function _pipeCap(x,y,w,h,top) {
  const g=ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,T.pipeDark); g.addColorStop(0.25,T.pipeHighlight); g.addColorStop(0.55,T.pipeTop); g.addColorStop(1,T.pipeDark);
  ctx.fillStyle=g; const rad=6; ctx.beginPath();
  if(top){ctx.moveTo(x+rad,y);ctx.lineTo(x+w-rad,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rad);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+rad);ctx.quadraticCurveTo(x,y,x+rad,y);}
  else{ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h-rad);ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);ctx.lineTo(x+rad,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rad);ctx.lineTo(x,y);}
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fillRect(x+8,y+2,w*0.3,h-4);
}

// ══════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════
function spawnParticles(x,y,color,count=10) {
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,spd=2+Math.random()*6;
    particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd-3,life:1,decay:0.025+Math.random()*0.03,r:3+Math.random()*5,color,gravity:0.25});}
}
function updateParticles(){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;p.life-=p.decay;if(p.life<=0)particles.splice(i,1);}}
function drawParticles(){particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}

// ══════════════════════════════════════════
//  COINS
// ══════════════════════════════════════════
function spawnCoin(pipe){if(Math.random()>0.45)return;coins.push({x:pipe.x,y:pipe.topH+gapSize/2,r:11,angle:0,collected:false});}
function updateCoins(spd){
  for(let i=coins.length-1;i>=0;i--){const c=coins[i];c.x-=spd;c.angle+=0.08;
    const br=(bird.tiny?bird.radius*0.55:bird.radius)+c.r;
    if(!c.collected&&Math.hypot(c.x-bird.x,c.y-bird.y)<br){c.collected=true;score++;sfxCoin();spawnParticles(c.x,c.y,'#ffd84d',12);document.getElementById('hudScore').textContent=score;}
    if(c.x<-30||c.collected)coins.splice(i,1);}
}
function drawCoins(){
  coins.forEach(c=>{if(c.collected)return;
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(0.82+0.18*Math.abs(Math.sin(c.angle)),1);
    const cg=ctx.createRadialGradient(0,0,2,0,0,c.r);cg.addColorStop(0,'#ffe770');cg.addColorStop(0.7,'#ffd020');cg.addColorStop(1,'#cc8800');
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,0,c.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.45)';ctx.font=`${c.r*1.4}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',0,1);ctx.restore();
    ctx.save();ctx.globalAlpha=0.25+0.1*Math.sin(c.angle*3);
    const gg=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,c.r*2.2);gg.addColorStop(0,'rgba(255,220,0,0.5)');gg.addColorStop(1,'rgba(255,220,0,0)');
    ctx.fillStyle=gg;ctx.beginPath();ctx.arc(c.x,c.y,c.r*2.2,0,Math.PI*2);ctx.fill();ctx.restore();});
}

// ══════════════════════════════════════════
//  POWER-UPS
// ══════════════════════════════════════════
function maybeSpawnPowerup(){if(Math.random()<0.006&&!activePU)powerupItems.push({x:W+20,y:110+Math.random()*(H-GROUND_H-220),pu:POWERUPS[Math.floor(Math.random()*POWERUPS.length)],angle:0});}
function updatePowerups(spd){
  for(let i=powerupItems.length-1;i>=0;i--){const it=powerupItems[i];it.x-=spd;it.angle+=0.06;
    if(Math.hypot(it.x-bird.x,it.y-bird.y)<28){activatePowerup(it.pu);powerupItems.splice(i,1);}else if(it.x<-40)powerupItems.splice(i,1);}
}
function drawPowerups(){
  const now=performance.now()/1000;
  powerupItems.forEach(it=>{
    ctx.save();ctx.translate(it.x,it.y);ctx.rotate(it.angle*0.3);
    ctx.globalAlpha=0.38+0.18*Math.sin(now*4);
    const pg=ctx.createRadialGradient(0,0,5,0,0,30);pg.addColorStop(0,it.pu.color+'cc');pg.addColorStop(1,'transparent');
    ctx.fillStyle=pg;ctx.beginPath();ctx.arc(0,0,30,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.beginPath();for(let a=0;a<6;a++){const ang=a*Math.PI/3-Math.PI/6;a===0?ctx.moveTo(Math.cos(ang)*18,Math.sin(ang)*18):ctx.lineTo(Math.cos(ang)*18,Math.sin(ang)*18);}
    ctx.closePath();ctx.fillStyle=it.pu.color;ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=2;ctx.stroke();
    ctx.font='bold 13px Nunito';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(it.pu.label.split(' ')[0],0,1);ctx.restore();});
}
function activatePowerup(pu){
  sfxPowerup();if(puTimeout)clearTimeout(puTimeout);
  activePU=pu;bird.shielded=pu.type==='shield';bird.tiny=pu.type==='tiny';
  document.getElementById('powerupHud').innerHTML=`<div class="pu-badge" style="border:2px solid ${pu.color}">${pu.label}</div>`;
  puTimeout=setTimeout(()=>{activePU=null;bird.shielded=false;bird.tiny=false;document.getElementById('powerupHud').innerHTML='';},pu.duration);
}

// ══════════════════════════════════════════
//  COLLISION
// ══════════════════════════════════════════
function checkCollisions(){
  if(bird.shielded)return;
  const bSize=bird.tiny?bird.radius*0.55:bird.radius, margin=5;
  for(const pipe of pipes){
    const pl=pipe.x-PIPE_CAP_W/2,pr=pipe.x+PIPE_CAP_W/2;
    if(bird.x+bSize-margin<pl||bird.x-bSize+margin>pr)continue;
    if(bird.y-bSize+margin<pipe.topH||bird.y+bSize-margin>pipe.topH+gapSize){bird.dead=true;return;}
  }
}

// ══════════════════════════════════════════
//  SCORE
// ══════════════════════════════════════════
function checkScore(){
  pipes.forEach(pipe=>{
    if(!pipe.scored&&pipe.x<bird.x-bird.radius){
      pipe.scored=true;score++;sfxScore();
      spawnParticles(bird.x+30,bird.y-20,'#ffd84d',8);spawnParticles(bird.x+30,bird.y-20,'#fff',4);
      document.getElementById('hudScore').textContent=score;
      gameSpeed=Math.min(BASE_SPEED+score*0.07,7.5); gapSize=Math.max(BASE_GAP-score*1.8,MIN_GAP);
    }
  });
}

// ══════════════════════════════════════════
//  DEATH  — fixed: no setTimeout, uses dyingTimer in loop
// ══════════════════════════════════════════
function triggerDeath(){
  sfxHit();
  spawnParticles(bird.x,bird.y,'#ff4444',22); spawnParticles(bird.x,bird.y,'#ffaa22',16);
  deathFlash=1; state='dying'; dyingTimer=0;
  if(score>bestScore){bestScore=score;localStorage.setItem('fw_best',bestScore);document.getElementById('goNewBadge').classList.remove('hidden');}
  else document.getElementById('goNewBadge').classList.add('hidden');
  document.getElementById('goScore').textContent=score;
  document.getElementById('goBest').textContent=bestScore;
  document.getElementById('hudBest').textContent=bestScore;
  document.getElementById('startBest').textContent=bestScore;
}

// ══════════════════════════════════════════
//  SCREENS
// ══════════════════════════════════════════
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');}
function hideAllScreens(){document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));}
function showHUD(){document.getElementById('hud').classList.remove('hidden');}
function hideHUD(){document.getElementById('hud').classList.add('hidden');}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function initGame(){
  score=0;frameCount=0;scrollX=0;gameSpeed=BASE_SPEED;gapSize=BASE_GAP;
  groundOffset=0;deathFlash=0;dyingTimer=0;activePU=null;
  bird=createBird();pipes=[];particles=[];coins=[];powerupItems=[];
  if(puTimeout){clearTimeout(puTimeout);puTimeout=null;}
  document.getElementById('powerupHud').innerHTML='';
  document.getElementById('hudScore').textContent='0';
  document.getElementById('hudBest').textContent=bestScore;
  initBackground();
}
function startGame(){
  ensureAudio();
  initGame();
  state='playing';
  hideAllScreens();
  showHUD();
}

// ══════════════════════════════════════════
//  GAME LOOP  — fixed death flow
// ══════════════════════════════════════════
function gameLoop(){
  requestAnimationFrame(gameLoop);

  // ── START idle ──
  if(state==='start'){
    drawBackground(scrollX); drawGround();
    scrollX+=0.8; groundOffset+=0.8;
    return;
  }

  // ── PLAYING ──
  if(state==='playing'){
    const spd=activePU?.type==='slow'?gameSpeed*0.42:gameSpeed;
    frameCount++;scrollX+=spd;groundOffset+=spd;
    if(frameCount%PIPE_INTERVAL===0){const p=createPipe();pipes.push(p);spawnCoin(p);}
    for(let i=pipes.length-1;i>=0;i--){pipes[i].x-=spd;if(pipes[i].x<-PIPE_CAP_W)pipes.splice(i,1);}
    updateBird(); maybeSpawnPowerup(); updatePowerups(spd); updateCoins(spd); updateParticles();
    if(!bird.dead){checkCollisions();checkScore();}
    if(bird.dead){triggerDeath();}  // triggered once; triggerDeath sets state='dying'
  }

  // ── DYING — bird falls, flash, then after delay show game over ──
  if(state==='dying'){
    dyingTimer++;
    groundOffset+=1; scrollX+=1;
    bird.vy+=GRAVITY; bird.y+=bird.vy;
    bird.rotation=Math.min(bird.rotation+4,90);
    updateParticles();
    if(deathFlash>0) deathFlash=Math.max(0,deathFlash-0.04);
    // show game over after bird has fully fallen (~80 frames ≈ 1.3s)
    if(dyingTimer>=80){
      state='dead';
      hideHUD();
      showScreen('gameOverScreen');
    }
  }

  // ── DEAD — game over screen visible, bg keeps scrolling ──
  if(state==='dead'){
    scrollX+=0.5; groundOffset+=0.5;
    updateParticles();
  }

  // ═══ RENDER ═══
  drawBackground(scrollX);

  // red flash on death
  if(deathFlash>0){
    ctx.fillStyle=`rgba(255,60,60,${deathFlash*0.5})`;
    ctx.fillRect(0,0,W,H);
  }

  pipes.forEach(drawPipe);
  drawCoins(); drawPowerups();
  if(state==='playing'||state==='dying') drawBirdAt(bird.x,bird.y);
  drawParticles(); drawGround();
}

// ══════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════
function handleTap(){
  ensureAudio();
  if(state==='playing'&&!bird.dead){
    bird.vy=JUMP_FORCE; sfxFlap();
    spawnParticles(bird.x-12,bird.y+10,'rgba(255,220,100,0.8)',4);
  }
}
document.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();handleTap();}});
canvas.addEventListener('mousedown',handleTap);
canvas.addEventListener('touchstart',e=>{e.preventDefault();handleTap();},{passive:false});

document.getElementById('btnPlay').addEventListener('click',startGame);
document.getElementById('btnRestart').addEventListener('click',()=>{ensureAudio();startGame();});
document.getElementById('btnMenu').addEventListener('click',()=>{
  state='start';showScreen('startScreen');hideHUD();
  document.getElementById('startBest').textContent=bestScore;
});

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
document.getElementById('startBest').textContent=bestScore;
document.getElementById('hudBest').textContent=bestScore;
initBackground(); showScreen('startScreen'); gameLoop();
