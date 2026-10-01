/*
  Rizo Defense Canvas Renderer — v80 Strategy & Feel
  ----------------------------------
  Presentation only. Simulation remains in game-v79-defense.js.
  The renderer never owns HP, path progress, targeting, rewards, or timing.
*/
(() => {
  "use strict";

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInQuad = t => { const u = clamp(t, 0, 1); return u * u; };
  const easeOutBack = t => { const u = clamp(t, 0, 1) - 1, c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * u * u * u + c1 * u * u; };
  const TAU = Math.PI * 2;

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(Math.abs(r), Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function colorWithAlpha(color, alpha) {
    if (!color || color[0] !== "#") return color || `rgba(255,255,255,${alpha})`;
    const raw = color.slice(1);
    const hex = raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw.slice(0, 6);
    const n = Number.parseInt(hex, 16);
    if (!Number.isFinite(n)) return color;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function balloonBodyPath(ctx,x,y,w,h,type="puff") {
    const fleet=type==="fleet",wide=type==="brick"||type==="lead"||type==="shell",split=type==="split";
    const left=wide?.54:fleet?.42:split?.47:.50,right=wide?.52:fleet?.44:split?.50:.48,top=fleet?.56:.53,bottom=wide?.45:.47,neck=wide?.09:.075;
    ctx.beginPath();
    ctx.moveTo(x-w*.02,y-h*(top-.015));
    ctx.bezierCurveTo(x+w*right*.18,y-h*(top+.03),x+w*right*.92,y-h*.53,x+w*right,y-h*.09);
    ctx.bezierCurveTo(x+w*(right*.98),y+h*.11,x+w*(wide?.30:.23),y+h*(bottom-.03),x+w*.06,y+h*.47);
    ctx.quadraticCurveTo(x+w*.025,y+h*.53,x+w*neck,y+h*.54);
    ctx.lineTo(x,y+h*.62);
    ctx.lineTo(x-w*neck,y+h*.54);
    ctx.quadraticCurveTo(x-w*.025,y+h*.53,x-w*.06,y+h*.47);
    ctx.bezierCurveTo(x-w*(wide?.32:.24),y+h*(bottom-.02),x-w*left,y+h*.12,x-w*left*.97,y-h*.08);
    ctx.bezierCurveTo(x-w*left*.9,y-h*.50,x-w*left*.18,y-h*(top+.01),x-w*.02,y-h*(top-.015));
    ctx.closePath();
  }
  function drawBalloonFace(ctx,x,y,w,h,enemy){
    const heavy=enemy.type==="lead"||enemy.type==="brick"||enemy.type==="shell"||Boolean(enemy.bossId),fast=enemy.type==="fleet";
    const eyeY=y+h*(heavy?.04:.05),eyeRx=Math.max(1.55,w*.036),eyeRy=Math.max(2.1,h*(heavy?.040:.046)),eyeOffset=w*(fast?.115:.13);
    ctx.fillStyle="#111019";
    if(heavy){ctx.save();ctx.translate(x-eyeOffset,eyeY);ctx.rotate(-.18);ctx.beginPath();ctx.ellipse(0,0,eyeRx*1.05,eyeRy*.88,0,0,TAU);ctx.fill();ctx.restore();ctx.save();ctx.translate(x+eyeOffset,eyeY);ctx.rotate(.18);ctx.beginPath();ctx.ellipse(0,0,eyeRx*1.05,eyeRy*.88,0,0,TAU);ctx.fill();ctx.restore();}
    else{ctx.beginPath();ctx.ellipse(x-eyeOffset,eyeY,eyeRx,eyeRy,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(x+eyeOffset,eyeY,eyeRx,eyeRy,0,0,TAU);ctx.fill();}
    ctx.strokeStyle="#111019";ctx.lineWidth=1.2;
    if(fast||enemy.stormCharging){ctx.beginPath();ctx.moveTo(x-eyeOffset-eyeRx*1.15,eyeY-h*.05);ctx.lineTo(x-eyeOffset+eyeRx*.8,eyeY-h*.07);ctx.moveTo(x+eyeOffset-eyeRx*.8,eyeY-h*.07);ctx.lineTo(x+eyeOffset+eyeRx*1.15,eyeY-h*.05);ctx.stroke();}
    else if(heavy){ctx.beginPath();ctx.moveTo(x-eyeOffset-eyeRx*1.1,eyeY-h*.04);ctx.lineTo(x-eyeOffset+eyeRx*1.1,eyeY-h*.055);ctx.moveTo(x+eyeOffset-eyeRx*1.1,eyeY-h*.055);ctx.lineTo(x+eyeOffset+eyeRx*1.1,eyeY-h*.04);ctx.stroke();}
    const mouthY=y+h*.20;
    ctx.beginPath();
    if(heavy){ctx.moveTo(x-w*.10,mouthY);ctx.lineTo(x+w*.10,mouthY);ctx.moveTo(x-w*.07,mouthY-h*.015);ctx.lineTo(x-w*.03,mouthY+h*.03);ctx.moveTo(x+w*.03,mouthY-h*.015);ctx.lineTo(x+w*.07,mouthY+h*.03);} 
    else if(fast){ctx.moveTo(x-w*.085,mouthY+h*.02);ctx.lineTo(x-w*.01,mouthY-h*.01);ctx.lineTo(x+w*.085,mouthY+h*.02);} 
    else{ctx.moveTo(x-w*.08,mouthY);ctx.lineTo(x+w*.08,mouthY+h*.07);ctx.moveTo(x+w*.08,mouthY);ctx.lineTo(x-w*.08,mouthY+h*.07);} 
    ctx.stroke();
  }

  class DefenseCanvasRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas?.getContext?.("2d", { alpha: true, desynchronized: true }) || canvas?.getContext?.("2d") || null;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.unitScale = 1;
      this.lastTier = -1;
      this.enabled = Boolean(this.ctx);
      this.stats = { frames: 0, enemies: 0, projectiles: 0, effects: 0, resizes: 0 };
      this.options = options;
    }

    resize(cssWidth, cssHeight, tier = 0) {
      if (!this.enabled) return false;
      const width = Math.max(1, Math.round(cssWidth || this.canvas.clientWidth || 1));
      const height = Math.max(1, Math.round(cssHeight || this.canvas.clientHeight || 1));
      const device = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
      // A phone does not need a 3x backing store for small cartoon balloons. Q1
      // deliberately lowers pixel density before gameplay logic is touched.
      const cap = tier >= 2 ? 1.08 : tier === 1 ? 1.5 : 2.0;
      const dpr = Math.min(device, cap);
      if (width === this.width && height === this.height && Math.abs(dpr - this.dpr) < .01 && tier === this.lastTier) return false;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.lastTier = tier;
      this.unitScale = Math.max(.82, Math.min(1.18, width / 390));
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in this.ctx) this.ctx.imageSmoothingQuality = "high";
      this.stats.resizes += 1;
      return true;
    }

    clear() {
      if (!this.enabled) return;
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    point(entity, alpha = 1) {
      const x = Number.isFinite(entity?.prevX) ? entity.prevX + (entity.x - entity.prevX) * alpha : Number(entity?.x) || 0;
      const y = Number.isFinite(entity?.prevY) ? entity.prevY + (entity.y - entity.prevY) * alpha : Number(entity?.y) || 0;
      return { x: x * this.width, y: y * this.height };
    }

    drawProjectile(shot, alpha = 1) {
      const ctx=this.ctx,p=this.point(shot,alpha),kind=String(shot.kind||"spark"),color=shot.renderColor||"#fff2cf";
      const dx=(shot.x-(shot.prevX??shot.x))*this.width,dy=(shot.y-(shot.prevY??shot.y))*this.height,angle=Math.atan2(dy,dx),r=shot.doctrineStrike?4.6:3.2;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.lineCap="round";ctx.lineJoin="round";
      const trail=(len,width,trailColor=color)=>{ctx.strokeStyle=colorWithAlpha(trailColor,.34);ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(-len,0);ctx.lineTo(-r*.6,0);ctx.stroke();};
      if(kind==="needle"||kind==="rivet"||kind==="pin"){
        const power=kind==="rivet",control=kind==="pin",basicColor=power?"#ff9a56":control?"#7fe2c4":"#eee6d6";trail(r*(power?5.6:control?4.6:4.9),r*(power?1.35:.85),basicColor);ctx.fillStyle=basicColor;ctx.strokeStyle="#17151b";ctx.lineWidth=power?1.6:1.25;ctx.beginPath();if(power){ctx.moveTo(r*2.25,0);ctx.lineTo(r*.45,-r*.72);ctx.lineTo(-r*1.75,-r*.48);ctx.lineTo(-r*1.75,r*.48);ctx.lineTo(r*.45,r*.72);}else{ctx.moveTo(r*2.15,0);ctx.lineTo(-r*1.65,r*.42);ctx.lineTo(-r*1.65,-r*.42);}ctx.closePath();ctx.fill();ctx.stroke();if(control){ctx.fillStyle="#fff8ea";ctx.beginPath();ctx.arc(-r*.65,0,r*.30,0,TAU);ctx.fill();}if(shot.doubleStitch){ctx.strokeStyle=basicColor;ctx.lineWidth=Math.max(1,r*.42);ctx.beginPath();ctx.moveTo(-r*1.65,r*1.08);ctx.lineTo(r*1.7,r*1.08);ctx.stroke();ctx.fillStyle="#fff8ea";ctx.beginPath();ctx.arc(r*.95,r*1.08,Math.max(1,r*.22),0,TAU);ctx.fill();}
      }else if(kind==="ember"){
        trail(r*7.8,r*2.55,"#ff6b36");
        ctx.fillStyle="rgba(255,108,60,.20)";ctx.beginPath();ctx.moveTo(r*2.9,0);ctx.quadraticCurveTo(r*.7,-r*2.05,-r*1.6,-r*1.3);ctx.quadraticCurveTo(-r*.35,0,-r*1.6,r*1.3);ctx.quadraticCurveTo(r*.7,r*2.05,r*2.9,0);ctx.fill();
        ctx.fillStyle="#19131a";ctx.strokeStyle="#ffbf69";ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(r*1.75,0);ctx.lineTo(r*.15,-r*.52);ctx.lineTo(-r*1.55,0);ctx.lineTo(r*.15,r*.52);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle="#5a2418";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-r*.95,-r*.9);ctx.lineTo(r*2.25,0);ctx.lineTo(-r*.95,r*.9);ctx.stroke();
        ctx.fillStyle="#ff6a38";for(const oy of [-1.15,0,1.15]){ctx.beginPath();ctx.arc(-r*1.55,oy,r*.26,0,TAU);ctx.fill();}
        ctx.fillStyle="#ffe59a";ctx.beginPath();ctx.arc(r*.5,0,r*.38,0,TAU);ctx.fill();
      }else if(kind==="void"){
        trail(r*5.5,r*1.35,"#b77bff");ctx.strokeStyle="#efe0ff";ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(-r*4,0);ctx.lineTo(-r*2.6,-r*.85);ctx.lineTo(-r*1.5,r*.65);ctx.lineTo(-r*.5,-r*.35);ctx.stroke();ctx.fillStyle="#9f66e8";ctx.strokeStyle="#21142c";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(r*1.55,0);ctx.lineTo(0,r*1.25);ctx.lineTo(-r*1.15,0);ctx.lineTo(0,-r*1.25);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(r*.25,-r*.15,r*.28,0,TAU);ctx.fill();
      }else if(kind==="frost"){
        trail(r*5,r*1.2,"#aef3ff");ctx.fillStyle="#dffcff";ctx.strokeStyle="#2d5661";ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(r*2.25,0);ctx.lineTo(-r*.2,r*.85);ctx.lineTo(-r*1.35,0);ctx.lineTo(-r*.2,-r*.85);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle="#7fd9e8";ctx.beginPath();ctx.moveTo(r*.9,0);ctx.lineTo(-r*.2,0);ctx.stroke();
      }else if(kind==="stone"){
        trail(r*4.5,r*2.5,"#6c6373");ctx.fillStyle="#4c4b57";ctx.strokeStyle="#17151b";ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(r*1.55,-r*.35);ctx.lineTo(r*.75,r*1.2);ctx.lineTo(-r*.95,r*.72);ctx.lineTo(-r*1.3,-r*.55);ctx.lineTo(r*.1,-r*1.25);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle="#a89b89";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-r*.45,-r*.55);ctx.lineTo(r*.55,-r*.25);ctx.stroke();
      }else if(kind==="toxic"){
        trail(r*4.3,r*1.4,"#75e95b");ctx.fillStyle="#8cff6a";ctx.strokeStyle="#214b2c";ctx.lineWidth=1.35;ctx.beginPath();ctx.ellipse(0,0,r*1.35,r,0,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle="#e9ffd9";ctx.beginPath();ctx.arc(-r*.35,-r*.28,r*.26,0,TAU);ctx.fill();
      }else if(kind==="bubble"){
        trail(r*3.7,r*.9,"#ff88cc");ctx.fillStyle="rgba(255,120,195,.45)";ctx.strokeStyle="#692647";ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(0,0,r*1.45,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle="rgba(255,255,255,.7)";ctx.beginPath();ctx.arc(-r*.42,-r*.42,r*.26,0,TAU);ctx.fill();
      }else if(kind==="moss"){
        trail(r*4,r*1.1,"#60c879");ctx.fillStyle="#69c978";ctx.strokeStyle="#214b2e";ctx.lineWidth=1.35;ctx.beginPath();ctx.ellipse(0,0,r*1.55,r*.82,-.2,0,TAU);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-r*1.15,0);ctx.lineTo(r*.95,0);ctx.stroke();
      }else{
        trail(r*4.8,r*1.15);ctx.fillStyle=color;ctx.strokeStyle="#24252b";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(r*2.1,0);ctx.lineTo(-r*.55,r*.78);ctx.lineTo(-r*.15,0);ctx.lineTo(-r*.55,-r*.78);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#fff7dd";ctx.beginPath();ctx.arc(r*.55,-r*.18,r*.28,0,TAU);ctx.fill();
      }
      if(shot.doctrineStrike){ctx.strokeStyle=shot.doctrineStrike==="power"?"#ffd45a":"#bff4d6";ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,r*2.1,0,TAU);ctx.stroke();}
      ctx.restore();
    }

    drawEnemy(enemy, alpha = 1, gameTime = 0, tier = 0) {
      const ctx = this.ctx;
      const p = this.point(enemy, alpha);
      const boss = Boolean(enemy.bossId);
      const scale = this.unitScale * (boss ? 1.62 : enemy.type === "brick" ? 1.18 : enemy.type === "lead" ? 1.14 : enemy.type === "shell" ? 1.08 : enemy.type === "fleet" ? .84 : 1);
      const w = (boss ? 40 : 34) * scale;
      const h = (boss ? 52 : 43) * scale;
      const color = enemy.renderColor || "#ff5b68";
      const health = clamp(enemy.hp / Math.max(.001, enemy.maxHp), 0, 1);
      const camo = Boolean(enemy.renderCamo);
      const phase = Boolean(enemy.phaseActive);
      const revealed = Boolean(enemy.renderRevealed);
      const hit = Number(enemy.hitFlash) > 0;
      const skin = enemy.renderSkin || "clean";
      const burnActive = Number(enemy.burnUntil) > gameTime;
      const poisonActive = Number(enemy.poisonUntil) > gameTime;
      const frostActive = Number(enemy.slowUntil) > gameTime;
      const rootActive = Number(enemy.rootUntil) > gameTime;
      const alphaBase = phase ? .43 : camo ? .58 : 1;
      const bob = tier >= 2 ? 0 : Math.sin(gameTime * 3.6 + (enemy.phaseOffset || 0)) * 1.25 * scale;
      let x=p.x,y=p.y+bob;if(hit&&Number.isFinite(enemy.hitFromX)&&Number.isFinite(enemy.hitFromY)&&tier<2){const hx=p.x-enemy.hitFromX*this.width,hy=(p.y+bob)-enemy.hitFromY*this.height,hl=Math.hypot(hx,hy)||1,push=2.2*clamp(enemy.hitFlash/.12);x+=hx/hl*push;y+=hy/hl*push;}

      ctx.save();
      ctx.globalAlpha = alphaBase;

      // Grounding shadow is intentionally cheap and communicates route contact.
      if (tier < 2) {
        ctx.fillStyle = "rgba(10,8,14,.18)";
        ctx.beginPath();
        ctx.ellipse(x, y + h * .42, w * .36, h * .09, 0, 0, TAU);
        ctx.fill();
      }

      // Brief deformation reads as contact, while the simulation stays untouched.
      if(hit && tier<2){const squash=clamp(enemy.hitFlash/.12)*.055;ctx.translate(x,y);ctx.scale(1+squash,1-squash);ctx.translate(-x,-y);}

      // Balloon body.
      balloonBodyPath(ctx,x,y,w,h,enemy.type);ctx.fillStyle=hit?"#fff7e6":color;ctx.fill();ctx.lineWidth=boss?2.55:enemy.type==="shell"?2.15:1.8;ctx.strokeStyle="#111019";ctx.stroke();
      if (enemy.relayBoosted && !boss) {
        ctx.save();ctx.strokeStyle="#5fe0b7";ctx.lineWidth=tier>=2?1.5:2;ctx.setLineDash(tier>=2?[]:[3*scale,3*scale]);ctx.beginPath();ctx.ellipse(x,y,w*.61,h*.60,0,0,TAU);ctx.stroke();ctx.restore();
      }
      if ((enemy.signalStaggerUntil||0) > gameTime && !boss) {
        ctx.save();ctx.strokeStyle="#b8fff0";ctx.lineWidth=tier>=2?1.4:2;ctx.setLineDash([2*scale,3*scale]);for(const side of [-1,1]){ctx.beginPath();ctx.arc(x+side*w*.34,y-h*.08,w*.20,side>0?Math.PI*.65:-Math.PI*.35,side>0?Math.PI*1.35:Math.PI*.35);ctx.stroke();}ctx.restore();
      }

      // Two ink plates model volume without glossy gradients or filters.
      if (!hit) {
        ctx.save();balloonBodyPath(ctx,x,y,w,h,enemy.type);ctx.clip();ctx.fillStyle="rgba(35,22,40,.19)";
        ctx.beginPath();ctx.ellipse(x+w*.26,y+h*.09,w*.39,h*.48,-.15,0,TAU);ctx.fill();
        ctx.fillStyle="rgba(255,244,202,.19)";
        ctx.beginPath();ctx.ellipse(x-w*.16,y-h*.19,w*.28,h*.27,-.35,0,TAU);ctx.fill();
        ctx.restore();
      }

      // Cheap identity texture for armor/split classes, no filters or gradients.
      if (enemy.type === "lead" && tier < 2) {
        ctx.save();balloonBodyPath(ctx,x,y,w,h,enemy.type);ctx.clip();ctx.fillStyle="rgba(35,43,52,.30)";ctx.fillRect(x-w*.5,y-h*.5,w,h);ctx.strokeStyle="#d7dde4";ctx.lineWidth=2.3;for(const oy of [-.24,.06,.34]){ctx.beginPath();ctx.moveTo(x-w*.43,y+h*oy);ctx.lineTo(x+w*.43,y+h*oy);ctx.stroke();}ctx.restore();
      } else if (enemy.type === "brick" && tier < 2) {
        ctx.save();balloonBodyPath(ctx,x,y,w,h,enemy.type);ctx.clip();ctx.strokeStyle="#6d3427";ctx.lineWidth=2.1;for(const oy of [-.25,.02,.28]){ctx.beginPath();ctx.moveTo(x-w*.48,y+h*oy);ctx.lineTo(x+w*.48,y+h*oy);ctx.stroke();}for(const ox of [-.25,.18]){ctx.beginPath();ctx.moveTo(x+w*ox,y-h*.48);ctx.lineTo(x+w*(ox+.08),y+h*.48);ctx.stroke();}ctx.restore();
      } else if (enemy.type === "shell" && tier < 2) {
        ctx.save();balloonBodyPath(ctx,x,y,w,h,enemy.type);ctx.clip();ctx.strokeStyle = colorWithAlpha("#fff2cf", .25);
        ctx.lineWidth = 3;
        for (let ix = x - w; ix < x + w; ix += 8 * scale) {
          ctx.beginPath(); ctx.moveTo(ix, y - h); ctx.lineTo(ix + h, y + h); ctx.stroke();
        }
        ctx.restore();
      } else if (enemy.type === "split" && tier < 2) {
        ctx.fillStyle = "#ffb5e1";
        ctx.strokeStyle = "#111019";
        ctx.lineWidth = 1.65;
        ctx.beginPath();
        ctx.arc(x + w * .43, y - h * .08, w * .18, 0, TAU);
        ctx.fill(); ctx.stroke();
      }

      // Status art is clipped to the balloon, preventing the square-edge bug.
      if (skin !== "clean" && skin !== "cracked" && skin !== "shredded") {
        ctx.save();
        balloonBodyPath(ctx,x,y,w*.94,h*.94,enemy.type);ctx.clip();
        if (skin === "burn") {
          ctx.fillStyle = "rgba(54,27,24,.56)";ctx.fillRect(x-w*.5,y+h*.03,w,h*.56);
          ctx.strokeStyle = "rgba(255,214,122,.42)";ctx.lineWidth = 1.2;for (const oy of [.10,.20,.31]) {ctx.beginPath();ctx.moveTo(x-w*.22,y+h*oy);ctx.lineTo(x+w*.16,y+h*(oy+.02));ctx.stroke();}
          ctx.fillStyle = "#ff7a38";for (const [ox,oy,hs] of [[-.29,.41,1],[0,.39,1.12],[.28,.42,.94]]) {ctx.beginPath();ctx.moveTo(x+w*(ox-.09),y+h*(oy+.02));ctx.quadraticCurveTo(x+w*(ox-.03),y+h*.05,x+w*ox,y-h*.07*hs);ctx.quadraticCurveTo(x+w*(ox+.10),y+h*.17,x+w*(ox+.11),y+h*(oy+.02));ctx.closePath();ctx.fill();}
          ctx.fillStyle="#ffd45a";ctx.beginPath();ctx.ellipse(x,y+h*.31,w*.13,h*.13,0,0,TAU);ctx.fill();ctx.fillStyle="#2b1715";for(const [ox,oy,rr] of [[-.18,.23,.045],[.16,.18,.038],[.02,.34,.03]]){ctx.beginPath();ctx.arc(x+w*ox,y+h*oy,w*rr,0,TAU);ctx.fill();}
          ctx.fillStyle="rgba(255,210,102,.9)";for(const [ox,oy,rr] of [[-.26,-.10,.03],[.22,-.18,.028],[.04,-.28,.025]]){ctx.beginPath();ctx.arc(x+w*ox,y+h*oy,w*rr,0,TAU);ctx.fill();}
        } else if (skin === "poison") {
          ctx.fillStyle = "rgba(109,255,92,.35)";ctx.fillRect(x-w*.5,y-h*.5,w,h);
          ctx.fillStyle = "#8cff6a";
          for (const [ox, oy, r] of [[-.22,-.17,.10],[.20,.04,.085],[-.03,.27,.075]]) {ctx.beginPath();ctx.arc(x+w*ox,y+h*oy,w*r,0,TAU);ctx.fill();ctx.strokeStyle="#286f37";ctx.lineWidth=1;ctx.stroke();}
        } else if (skin === "frost") {
          ctx.strokeStyle = "#d9fbff";ctx.lineWidth=2.5;for(let i=0;i<7;i++){const a=i*TAU/7,ex=x+Math.cos(a)*w*.43,ey=y+Math.sin(a)*h*.43;ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(x+Math.cos(a)*w*.25,y+Math.sin(a)*h*.25);ctx.stroke();}
        } else if (skin === "root") {
          ctx.strokeStyle = "#79c76a"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y+h*.29, w*.33, Math.PI*.08, Math.PI*.92); ctx.stroke();
        }
        ctx.restore();
      }

      // Statuses can overlap in simulation. Keep each identity visible instead of letting
      // burn hide poison, root, or frost until its timer expires. Low tiers use fewer marks.
      if (burnActive || poisonActive || frostActive || rootActive) {
        ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
        if (burnActive) {
          const count=tier>=2?1:3;for(let i=0;i<count;i++){const ox=(i-(count-1)/2)*w*.18,phaseOffset=(enemy.phaseOffset||0)+i*.7,flame=h*(tier>=2?.085:.115)*(1+.10*Math.sin(gameTime*8+phaseOffset));ctx.fillStyle=i%2?"#ffd45a":"#ff6a38";ctx.strokeStyle="#55251a";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+ox-w*.045,y+h*.43);ctx.quadraticCurveTo(x+ox-w*.02,y+h*.43-flame*.58,x+ox,y+h*.43-flame);ctx.quadraticCurveTo(x+ox+w*.065,y+h*.43-flame*.42,x+ox+w*.05,y+h*.43);ctx.closePath();ctx.fill();if(tier<2)ctx.stroke();}
        }
        if (poisonActive) {
          const count=tier>=2?1:3;ctx.fillStyle="#a6ff72";ctx.strokeStyle="#245d31";ctx.lineWidth=1;for(let i=0;i<count;i++){const a=-.8+i*.75+(enemy.phaseOffset||0)*.07,rr=w*(.53+(i%2)*.05),br=w*(tier>=2?.055:.065);ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*h*.45,br,0,TAU);ctx.fill();if(tier<2)ctx.stroke();}
        }
        if (frostActive) {
          ctx.strokeStyle="#dffcff";ctx.lineWidth=tier>=2?1.4:1.8;const count=tier>=2?2:5;for(let i=0;i<count;i++){const a=-Math.PI*.9+i*(Math.PI*1.8/Math.max(1,count-1)),r1=w*.49,r2=w*(tier>=2?.57:.64);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r1,y+Math.sin(a)*h*.43);ctx.lineTo(x+Math.cos(a)*r2,y+Math.sin(a)*h*.55);ctx.stroke();}
        }
        if (rootActive) {
          ctx.strokeStyle="#79c76a";ctx.lineWidth=tier>=2?2:2.6;ctx.beginPath();ctx.arc(x,y+h*.47,w*(tier>=2?.31:.42),Math.PI*.05,Math.PI*.95);ctx.stroke();if(tier<2){ctx.beginPath();ctx.moveTo(x-w*.22,y+h*.47);ctx.quadraticCurveTo(x-w*.34,y+h*.31,x-w*.39,y+h*.24);ctx.moveTo(x+w*.18,y+h*.47);ctx.quadraticCurveTo(x+w*.30,y+h*.34,x+w*.36,y+h*.27);ctx.stroke();}
        }
        ctx.restore();
      }

      if (skin === "cracked" || skin === "shredded") {
        ctx.strokeStyle = skin === "cracked" ? "#fff2cf" : "#ffd06a";
        ctx.lineWidth = 2.2;
        for(const offset of [-.18,.08,.24]){ctx.beginPath();ctx.moveTo(x+w*offset,y-h*.43);ctx.lineTo(x+w*(offset+.07),y-h*.17);ctx.lineTo(x+w*(offset-.04),y+h*.05);ctx.lineTo(x+w*(offset+.08),y+h*.34);ctx.stroke();}
      }

      // Balloon seam + cheek plates keep them from reading like flat stickers.
      if (!hit && tier < 2) {
        ctx.save();balloonBodyPath(ctx,x,y,w*.94,h*.94,enemy.type);ctx.clip();
        ctx.strokeStyle = "rgba(255,244,216,.12)"; ctx.lineWidth = 1.35;
        ctx.beginPath();ctx.moveTo(x-w*.03,y-h*.34);ctx.quadraticCurveTo(x-w*.12,y-h*.02,x-w*.05,y+h*.34);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+w*.02,y-h*.31);ctx.quadraticCurveTo(x+w*.10,y-h*.01,x+w*.04,y+h*.32);ctx.stroke();
        ctx.fillStyle = "rgba(255,224,182,.09)";ctx.beginPath();ctx.ellipse(x-w*.11,y+h*.05,w*.12,h*.08,-.2,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(x+w*.11,y+h*.09,w*.10,h*.06,.2,0,TAU);ctx.fill();
        ctx.restore();
      }

      // Face — kept minimal, but now variant-weighted so enemies have personality.
      drawBalloonFace(ctx,x,y,w,h,enemy);

      // Shine is a single opaque mark instead of a filter/shadow stack.
      if (tier < 2) {
        ctx.fillStyle = "rgba(255,255,255,.28)";
        ctx.beginPath(); ctx.ellipse(x-w*.20,y-h*.22,w*.08,h*.12,-.45,0,TAU);ctx.fill();
      }

      // Neck, knot and string sell “balloon” more than a plain oval ever will.
      ctx.strokeStyle = "rgba(17,16,25,.22)"; ctx.lineWidth = 1.15;
      ctx.beginPath();ctx.moveTo(x-w*.08,y+h*.44);ctx.quadraticCurveTo(x-w*.05,y+h*.52,x,y+h*.57);ctx.quadraticCurveTo(x+w*.05,y+h*.52,x+w*.08,y+h*.44);ctx.stroke();
      ctx.fillStyle = "#111019";
      ctx.beginPath();ctx.moveTo(x-4.5*scale,y+h*.49);ctx.lineTo(x+4.5*scale,y+h*.49);ctx.lineTo(x,y+h*.64);ctx.closePath();ctx.fill();
      if (tier < 2) {
        ctx.strokeStyle = "#2b2930"; ctx.lineWidth = 1.3;
        ctx.beginPath();ctx.moveTo(x,y+h*.595);ctx.quadraticCurveTo(x-3.5*scale,y+h*.69,x+Math.sin(gameTime*4+(enemy.phaseOffset||0))*3.25,y+h*.79);ctx.stroke();
      }

      // Family badges make the wave roster read like a cast, not one base balloon recolored.
      if (enemy.type === "fleet" && tier < 2) {
        ctx.strokeStyle = "rgba(255,240,210,.34)"; ctx.lineWidth = 1.55;
        for (const oy of [-.10,.08,.24]) { ctx.beginPath(); ctx.moveTo(x-w*.78,y+h*oy); ctx.lineTo(x-w*.48,y+h*(oy-.03)); ctx.stroke(); }
      }
      if (enemy.type === "split" && tier < 2) {
        ctx.strokeStyle = "rgba(255,235,252,.55)"; ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(x+w*.08,y-h*.05); ctx.quadraticCurveTo(x+w*.25,y-h*.02,x+w*.34,y+h*.04); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.ellipse(x+w*.44,y-h*.12,w*.06,h*.09,-.35,0,TAU); ctx.fill();
      }
      if (enemy.type === "fire" && tier < 2) {
        ctx.strokeStyle = "rgba(255,184,91,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x,y-h*.08,Math.max(w,h)*.54,-Math.PI*.2,Math.PI*1.08); ctx.stroke();
        for (const ox of [-.18,0,.18]) { ctx.fillStyle = ox===0 ? "#ffd768" : "#ff6f3d"; ctx.beginPath(); ctx.moveTo(x+w*ox-w*.035,y-h*.48); ctx.quadraticCurveTo(x+w*ox,y-h*.66,x+w*ox+w*.04,y-h*.45); ctx.quadraticCurveTo(x+w*ox+w*.02,y-h*.38,x+w*ox-w*.035,y-h*.48); ctx.fill(); }
      }
      if (enemy.type === "storm" && tier < 2) {
        ctx.strokeStyle = "#ffe56b"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x,y-h*.04,Math.max(w,h)*.57,-Math.PI*.85,Math.PI*.05); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+w*.18,y-h*.56); ctx.lineTo(x+w*.03,y-h*.29); ctx.lineTo(x+w*.19,y-h*.29); ctx.lineTo(x+w*.01,y-h*.01); ctx.stroke();
      }
      if ((enemy.type === "lead" || enemy.type === "shell") && tier < 2) {
        ctx.fillStyle = "#efe4be"; for (const ox of [-.26,0,.26]) { ctx.beginPath(); ctx.arc(x+w*ox,y-h*.46,w*.03,0,TAU); ctx.fill(); }
      }
      if (enemy.type === "brick" && tier < 2) {
        ctx.fillStyle = "rgba(88,41,30,.28)"; ctx.fillRect(x-w*.28,y-h*.48,w*.56,h*.12);
      }
      if (enemy.type === "relay") {
        ctx.save();ctx.strokeStyle="#123f38";ctx.lineWidth=tier>=2?2:2.4;ctx.beginPath();ctx.arc(x,y-h*.05,w*.18,-Math.PI*.72,Math.PI*.72);ctx.stroke();ctx.beginPath();ctx.arc(x,y-h*.05,w*.30,-Math.PI*.72,Math.PI*.72);ctx.stroke();ctx.restore();
      }
      if (enemy.type === "mender") {
        ctx.save();ctx.strokeStyle="#5d214d";ctx.lineWidth=tier>=2?2.2:3;ctx.beginPath();ctx.moveTo(x-w*.20,y);ctx.lineTo(x+w*.20,y);ctx.moveTo(x,y-h*.16);ctx.lineTo(x,y+h*.16);ctx.stroke();if((enemy.supportFlashUntil||0)>gameTime&&tier<2){ctx.strokeStyle="#ffb7dc";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Math.max(w,h)*.66,0,TAU);ctx.stroke();}ctx.restore();
      }

      if (boss) {
        ctx.save();ctx.strokeStyle="#111019";ctx.lineWidth=2;ctx.fillStyle="#ffd45a";const cy=y-h*.28;
        if(enemy.bossId==="crown"){ctx.beginPath();ctx.moveTo(x-w*.28,cy+h*.08);ctx.lineTo(x-w*.22,cy-h*.06);ctx.lineTo(x-w*.07,cy+h*.02);ctx.lineTo(x,cy-h*.10);ctx.lineTo(x+w*.08,cy+h*.02);ctx.lineTo(x+w*.23,cy-h*.06);ctx.lineTo(x+w*.28,cy+h*.08);ctx.closePath();ctx.fill();ctx.stroke();}
        else if(enemy.bossId==="vortex"){for(let r=.08;r<.28;r+=.07){ctx.beginPath();ctx.arc(x,cy,w*r,0,Math.PI*1.55);ctx.stroke();}}
        else if(enemy.bossId==="mirror"){ctx.beginPath();ctx.moveTo(x,cy-h*.12);ctx.lineTo(x+w*.18,cy);ctx.lineTo(x,cy+h*.12);ctx.lineTo(x-w*.18,cy);ctx.closePath();ctx.fill();ctx.stroke();}
        else{ctx.beginPath();ctx.moveTo(x,cy-h*.12);ctx.lineTo(x+w*.16,cy+h*.10);ctx.lineTo(x,cy+h*.04);ctx.lineTo(x-w*.16,cy+h*.10);ctx.closePath();ctx.fill();ctx.stroke();}
        ctx.restore();
      }

      // A warning that stays legible even in the lowest presentation tier.
      if(enemy.stormCharging){ctx.fillStyle="#ffe66b";ctx.strokeStyle="#17151b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-h*.83);ctx.lineTo(x+7,y-h*.56);ctx.lineTo(x-7,y-h*.56);ctx.closePath();ctx.fill();ctx.stroke();}
      if(enemy.progress>.82){ctx.strokeStyle="#ff5b68";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y+h*.90);ctx.lineTo(x,y+h*.98);ctx.lineTo(x+6,y+h*.90);ctx.stroke();}
      if (enemy.telegraphKind) {
        const progress = clamp(enemy.telegraphDisruption || 0);
        ctx.globalAlpha = .94;
        ctx.strokeStyle = progress >= .66 ? "#73e890" : "#ff657c";
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x,y,Math.max(w,h)*.62,-Math.PI/2,-Math.PI/2+TAU*(1-progress));ctx.stroke();
      }

      if (health < .995) {
        const barW = Math.max(20,w*.92), barH = boss ? 5 : 4, by = y + h*.62;
        roundedRect(ctx,x-barW/2,by,barW,barH,barH/2);ctx.fillStyle="#111019";ctx.fill();
        roundedRect(ctx,x-barW/2+1,by+1,(barW-2)*health,Math.max(2,barH-2),(barH-2)/2);ctx.fillStyle=health<.28?"#ff657c":health<.55?"#ffd45a":"#73e890";ctx.fill();
      }

      if (revealed && tier < 2) {
        ctx.globalAlpha = .75;
        ctx.strokeStyle = "#ffffff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,Math.max(w,h)*.56,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }

    drawEffect(effect, gameTime, tier = 0) {
      const ctx = this.ctx;
      const start = Number(effect.startedAt) || 0;
      const end = Math.max(start + .001, Number(effect.expiresAt) || start + .2);
      const t = clamp((gameTime - start) / (end - start));
      if (t >= 1) return;
      const x = clamp(effect.x,0,1)*this.width, y=clamp(effect.y,0,1)*this.height;
      const kind=String(effect.kind||"classic"), color=effect.color||"#fff2cf", major=Boolean(effect.major);
      const radius=(major?20:12)*(0.55+t*.75)*this.unitScale;
      ctx.save();ctx.globalAlpha=(1-t)*(.92);
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=major?3:2;
      if(kind==="flashover"){
        ctx.strokeStyle="#ff713f";ctx.lineWidth=2.8;ctx.beginPath();ctx.arc(x,y,radius*(.35+t*1.15),0,TAU);ctx.stroke();ctx.fillStyle=colorWithAlpha("#ffd45a",.75*(1-t));for(let i=0;i<(tier>=2?4:8);i++){const a=i*TAU/(tier>=2?4:8)+.18,rr=radius*(.28+t*.92);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.lineTo(x+Math.cos(a+.11)*rr*1.32,y+Math.sin(a+.11)*rr*1.32);ctx.lineTo(x+Math.cos(a-.11)*rr*1.32,y+Math.sin(a-.11)*rr*1.32);ctx.closePath();ctx.fill();}
      }else if(kind==="bloom"){
        ctx.strokeStyle="#86ff68";ctx.lineWidth=2;for(let i=0;i<(tier>=2?3:6);i++){const a=i*TAU/(tier>=2?3:6)+.3,rr=radius*(.18+t*.95),r=radius*(.10+(1-t)*.12);ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,r,0,TAU);ctx.stroke();}ctx.fillStyle=colorWithAlpha("#baff91",.35*(1-t));ctx.beginPath();ctx.arc(x,y,radius*(.28+t*.42),0,TAU);ctx.fill();
      }else if(kind==="crystal"){
        ctx.strokeStyle="#e7fdff";ctx.lineWidth=2.4;for(let i=0;i<6;i++){const a=i*TAU/6,rr=radius*(.25+t*.9);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.lineTo(x+Math.cos(a+.18)*rr*.72,y+Math.sin(a+.18)*rr*.72);ctx.stroke();}
      }else if(kind==="shatter"){
        ctx.strokeStyle="#d7fbff";ctx.lineWidth=2.4;for(let i=0;i<(tier>=2?4:7);i++){const a=i*TAU/(tier>=2?4:7)+.2,rr=radius*(.18+t*1.05);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*rr*.25,y+Math.sin(a)*rr*.25);ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.stroke();}ctx.strokeStyle="#5b5260";ctx.beginPath();ctx.arc(x,y,radius*(.22+t*.62),0,TAU);ctx.stroke();
      }else if(kind==="muzzle"){
        ctx.translate(x,y);ctx.rotate(Number(effect.angle)||0);const variant=String(effect.variant||"classic"),kick=(1-t)*18*this.unitScale;
        if(variant==="ember"){ctx.fillStyle="#ff6536";ctx.strokeStyle="#3a1b16";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(14+kick,-7);ctx.lineTo(10+kick,0);ctx.lineTo(14+kick,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#ffd45a";ctx.beginPath();ctx.arc(9+kick,0,3,0,TAU);ctx.fill();}
        else if(variant==="violet"){ctx.strokeStyle="#d7adff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(10+kick,-5);ctx.lineTo(8+kick,3);ctx.lineTo(16+kick,0);ctx.stroke();}
        else if(variant==="frost"){ctx.strokeStyle="#dffcff";ctx.lineWidth=2;for(const a of [-.5,0,.5]){ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(13+kick,Math.sin(a)*7);ctx.stroke();}}
        else if(variant==="obsidian"){ctx.fillStyle="#655e62";for(const oy of [-5,0,5]){ctx.beginPath();ctx.arc(8+kick,oy,2.2,0,TAU);ctx.fill();}}
        else{ctx.strokeStyle=color;ctx.lineWidth=2;for(const a of [-.35,0,.35]){ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(11+kick,Math.sin(a)*6);ctx.stroke();}}
      }else if(kind==="ember"){
        ctx.strokeStyle="rgba(73,35,26,.55)";ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(x,y,radius*(.38+t*.62),0,TAU);ctx.stroke();
        for(let i=0;i<6;i++){const a=i*TAU/6+.2,rr=radius*(.46+t*.62);ctx.save();ctx.translate(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.rotate(a);ctx.fillStyle="#ff6a38";ctx.strokeStyle="#5a251a";ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(0,-6);ctx.quadraticCurveTo(5,0,0,7);ctx.quadraticCurveTo(-4,1,0,-6);ctx.fill();ctx.stroke();ctx.restore();}
        ctx.fillStyle="#19131a";for(const [ox,oy,rr] of [[-.22,.15,.16],[.26,-.06,.12],[-.03,-.24,.1]]){ctx.beginPath();ctx.arc(x+radius*ox,y+radius*oy,radius*rr,0,TAU);ctx.fill();}
        ctx.fillStyle="#ffd768";ctx.beginPath();ctx.arc(x,y,radius*.20,0,TAU);ctx.fill();
      }else if(kind==="violet"){
        ctx.strokeStyle="#d7adff";ctx.lineWidth=2.2;for(let i=0;i<3;i++){const a=i*TAU/3+.25,rr=radius*(.9+t*.35);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*rr*.42,y+Math.sin(a)*rr*.42);ctx.lineTo(x+Math.cos(a+.13)*rr,y+Math.sin(a+.13)*rr);ctx.stroke();}
      }else if(kind==="glitch"){
        ctx.strokeStyle=t<.5?"#55dfff":"#ff68bd";ctx.lineWidth=2;const shift=(t<.34?-1:t<.67?1:0)*radius*.22;for(let i=0;i<(tier>=2?2:5);i++){const yy=y-radius*.65+i*radius*.32;ctx.beginPath();ctx.moveTo(x-radius*.8+shift,yy);ctx.lineTo(x-radius*.18-shift,yy);ctx.lineTo(x+radius*.04+shift,yy-radius*.12);ctx.lineTo(x+radius*.78-shift,yy-radius*.12);ctx.stroke();}
      }else if(kind==="bubblegum"){
        ctx.strokeStyle="#ff9bd3";ctx.lineWidth=2.4;ctx.fillStyle=colorWithAlpha("#ff68bd",.16*(1-t));ctx.beginPath();ctx.arc(x,y,radius*(.45+t*.95),0,TAU);ctx.fill();ctx.stroke();if(tier<2){for(let i=0;i<4;i++){const a=i*TAU/4+.35,rr=radius*(.3+t*.9);ctx.fillStyle=colorWithAlpha("#ffe6f6",.72*(1-t));ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,Math.max(1.5,radius*.13*(1-t*.4)),0,TAU);ctx.fill();}}
      }else if(kind==="frost"){
        ctx.strokeStyle="#dffcff";ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*TAU/6,rr=radius*(.75+t*.45);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*rr*.18,y+Math.sin(a)*rr*.18);ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.stroke();}
      }else if(kind==="obsidian"){
        ctx.strokeStyle="#2f2b32";ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(x,y,radius*(.45+t*.75),0,TAU);ctx.stroke();ctx.fillStyle="#806f61";for(let i=0;i<5;i++){const a=i*TAU/5+.2,rr=radius*(.55+t*.7);ctx.beginPath();ctx.rect(x+Math.cos(a)*rr-2,y+Math.sin(a)*rr-2,4,4);ctx.fill();}
      }else if(kind==="pop" || kind==="bubble" || major){
        const enemyType=String(effect.enemyType||""),weight=clamp(effect.popWeight,.75,1.45),reach=(major?36:23)*this.unitScale*lerp(.92,1.18,(weight-.75)/.70),impulseX=clamp(effect.impulseX,-1,1),impulseY=clamp(effect.impulseY,-1,1),routeX=clamp(effect.routeX,-1,1),routeY=clamp(effect.routeY,-1,1),impactAngle=Number.isFinite(effect.angle)?effect.angle:Math.atan2(impulseY||0,impulseX||1);
        const burst=easeOutBack(Math.min(1,t/.72)),flash=easeOutCubic(Math.min(1,t/.24)),fall=easeInQuad(t),fade=(1-t),cx=x+(impulseX*reach*.12+routeX*reach*.05)*burst,cy=y+(impulseY*reach*.12+routeY*reach*.04)*burst+fall*reach*.10;
        ctx.save();ctx.translate(cx,cy);ctx.rotate(impactAngle);
        const flashW=reach*lerp(.20,.92,flash)*weight,flashH=reach*lerp(.10,.26,1-t);
        if(t<.42){ctx.fillStyle=colorWithAlpha("#fff7d9",.78*fade);ctx.beginPath();ctx.ellipse(0,0,flashW,flashH,0,0,TAU);ctx.fill();}
        if(t<.58){ctx.strokeStyle=colorWithAlpha(color,.72*fade);ctx.lineWidth=lerp(2.4,.9,t);ctx.beginPath();ctx.ellipse(0,0,reach*lerp(.18,.72,burst),reach*lerp(.11,.44,burst),0,0,TAU);ctx.stroke();}
        ctx.restore();
        const spawnShard=(i,count,opts={})=>{
          const spread=opts.spread??TAU,base=(opts.baseAngle??impactAngle),bias=opts.bias??.2,size=(opts.size??4)*lerp(.92,1.15,(weight-.75)/.70)*(1-t*(opts.shrink??.52)),travel=reach*(opts.travel??1)*(0.12+(opts.speed??1.08+bias*.1)*burst),j=(Math.sin((i+1)*12.9898)*43758.5453)%1,off=(i/(Math.max(1,count))-.5)*spread+(j-.5)*(.16+.18*bias);
          const ang=base+off,vx=Math.cos(ang)*travel+impulseX*reach*(opts.impulse??.16)+routeX*reach*(opts.drift??.08)*t,vy=Math.sin(ang)*travel+impulseY*reach*(opts.impulse??.16)+routeY*reach*(opts.drift??.06)*t+fall*reach*(opts.gravity??.14);
          ctx.save();ctx.translate(cx+vx,cy+vy);ctx.rotate(ang+t*(opts.spin??2.2)+(j-.5)*.8);
          ctx.fillStyle=typeof opts.fill==='function'?opts.fill(i,j):opts.fill;ctx.strokeStyle=opts.stroke||"#38303b";ctx.lineWidth=opts.lineWidth??.8;
          const shape=opts.shape||"tri";
          ctx.beginPath();
          if(shape==="flame"){ctx.moveTo(0,-size*1.35);ctx.quadraticCurveTo(size*1.05,0,0,size*1.6);ctx.quadraticCurveTo(-size*.82,size*.22,0,-size*1.35);}
          else if(shape==="chunk"){ctx.moveTo(-size,-size*.7);ctx.lineTo(size*.7,-size*.48);ctx.lineTo(size,size*.35);ctx.lineTo(size*.08,size);ctx.lineTo(-size*.84,size*.46);ctx.closePath();}
          else if(shape==="bubble"){ctx.arc(0,0,Math.max(1,size*.84),0,TAU);}
          else if(shape==="bolt"){ctx.moveTo(-size*1.0,-size*.42);ctx.lineTo(-size*.18,-size*.15);ctx.lineTo(-size*.62,size*.95);ctx.lineTo(size*.98,-size*.06);ctx.lineTo(size*.08,size*.14);ctx.lineTo(size*.52,-size*.92);}
          else if(shape==="slash"){ctx.moveTo(-size*1.25,-size*.24);ctx.lineTo(size,0);ctx.lineTo(-size*.72,size*.55);ctx.closePath();}
          else{ctx.moveTo(-size,-size*.42);ctx.lineTo(size,0);ctx.lineTo(0,size);ctx.closePath();}
          ctx.fill(); if(opts.stroke!==false)ctx.stroke(); if(opts.sparkle){ctx.globalAlpha=.55*fade;ctx.fillStyle=colorWithAlpha(opts.sparkle,j<.5?.7:.45);ctx.beginPath();ctx.arc(size*.6,-size*.3,Math.max(1,size*.16),0,TAU);ctx.fill();}ctx.restore();
        };
        const spawnPuff=(ox,oy,r,c)=>{ctx.fillStyle=colorWithAlpha(c,.65*fade);ctx.beginPath();ctx.arc(cx+reach*ox*t,cy+reach*oy*t,reach*r*(1-t*.52),0,TAU);ctx.fill();};
        if(enemyType==="fire"){
          const count=tier>=2?3:8;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"flame",fill:(i,j)=>i%2?"#ff6a38":"#ffd768",stroke:"#4a241a",travel:1.02,speed:1.18,size:4.3,impulse:.24,drift:.05,gravity:.09,spin:1.4,spread:TAU*.92,bias:.95,sparkle:"#ffd768"});
          for(let i=0;i<3;i++)spawnShard(i,3,{shape:"chunk",fill:"#2b1818",stroke:false,travel:.46,speed:.82,size:2.4,impulse:.1,drift:.06,gravity:.18,spin:1.2,baseAngle:impactAngle+.2,spread:1.4});
          spawnPuff(-.22,-.12,.10,"#27161b"); spawnPuff(.16,.03,.085,"#27161b"); spawnPuff(.02,.24,.07,"#27161b");
        }else if(enemyType==="storm"){
          const count=tier>=2?3:7;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"bolt",fill:false,stroke:i%2?"#fff6bf":"#ffe56b",lineWidth:1.55,travel:1.0,speed:1.24,size:3.9,impulse:.22,drift:.04,gravity:.04,spin:.25,spread:TAU*.82,bias:.9});
          if(t<.44){ctx.strokeStyle=colorWithAlpha("#fff0a2",.85*fade);ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(cx,cy,reach*(.22+.36*burst),-Math.PI*.85,Math.PI*.18);ctx.stroke();}
        }else if(enemyType==="shell"){
          const count=tier>=2?3:6;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"chunk",fill:(i,j)=>i%2?"#9b7bd7":"#efe4be",stroke:"#38303b",travel:1.02,speed:.94,size:4.7,impulse:.24,drift:.08,gravity:.17,spin:1.35,spread:TAU*.84,bias:.46,sparkle:"#d8c9ff"});
          for(let i=0;i<4;i++)spawnShard(i,4,{shape:"slash",fill:(i,j)=>i%2?"rgba(230,220,255,.78)":"rgba(155,123,215,.92)",stroke:false,travel:.82,speed:.98,size:3.5,impulse:.16,drift:.06,gravity:.07,spin:.5,baseAngle:impactAngle,spread:TAU*.58,bias:.35});
          if(t<.42){ctx.strokeStyle=colorWithAlpha("#d8c9ff",.88*fade);ctx.lineWidth=1.45;ctx.beginPath();ctx.arc(cx,cy,reach*(.16+.34*burst),0,TAU);ctx.stroke();}
          spawnPuff(-.16,.03,.065,"#e9defc"); spawnPuff(.13,.10,.05,"#c9b6ea");
        }else if(enemyType==="lead"||enemyType==="brick"){
          const count=tier>=2?3:(enemyType==="brick"?7:6),fillA=enemyType==="brick"?"#c35d3f":"#8a97a3",fillB=enemyType==="brick"?"#f0c989":"#efe4be";
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"chunk",fill:(i,j)=>i%2?fillA:fillB,stroke:"#38303b",travel:1.08,speed:.98,size:5.1,impulse:.28,drift:.10,gravity:.22,spin:1.6,spread:TAU*.9,bias:.55});
          if(t<.34){ctx.strokeStyle=colorWithAlpha("#fff1c6",.78*fade);ctx.lineWidth=1.15;ctx.beginPath();for(let i=0;i<11;i++){const a=i*TAU/11,r=reach*(i%2?.28:.64)*burst;const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}
          spawnPuff(-.12,.05,.07,"#d7c6a0"); spawnPuff(.18,.12,.06,"#d7c6a0");
        }else if(enemyType==="ghost"){
          const count=tier>=2?3:7;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"slash",fill:(i,j)=>i%2?"rgba(197,156,255,.88)":"rgba(255,255,255,.55)",stroke:"rgba(67,46,97,.55)",lineWidth:.7,travel:1.0,speed:1.05,size:4.0,impulse:.14,drift:.12,gravity:.04,spin:.75,spread:TAU*.96,bias:.24,sparkle:"#f2e8ff"});
          if(t<.56){ctx.strokeStyle=colorWithAlpha("#eadcff",.92*fade);ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(cx,cy,reach*(.18+.38*burst),0,TAU);ctx.stroke();ctx.globalAlpha=.45*fade;ctx.fillStyle="#ffffff";ctx.beginPath();ctx.ellipse(cx-reach*.05,cy-reach*.02,reach*.18,reach*.10,-.35,0,TAU);ctx.fill();ctx.globalAlpha=1;}
          spawnPuff(-.20,-.04,.08,"#efe4ff"); spawnPuff(.18,.02,.06,"#cab0f0");
        }else if(kind==="bubble"||enemyType==="split"){
          const count=tier>=2?3:7;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"bubble",fill:(i,j)=>i%2?"rgba(255,201,235,.78)":"rgba(255,255,255,.58)",stroke:"#6b3856",lineWidth:.9,travel:.94,speed:.88,size:3.8,impulse:.12,drift:.06,gravity:.10,spin:.2,spread:TAU,bias:.2,sparkle:"#ffffff"});
          if(t<.56){ctx.strokeStyle=colorWithAlpha("#ffe6f6",.94*fade);ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,reach*(.18+.42*burst),0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,reach*(.08+.18*burst),0,TAU);ctx.stroke();}
        }else if(enemyType==="fleet"){
          const count=tier>=2?3:7;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"slash",fill:(i,j)=>i%2?color:"#fff2cf",stroke:"#38303b",travel:1.12,speed:1.28,size:4.1,impulse:.18,drift:.12,gravity:.07,spin:.9,baseAngle:impactAngle,spread:TAU*.62,bias:.75});
          if(t<.34){ctx.strokeStyle=colorWithAlpha("#fff8d0",.82*fade);ctx.lineWidth=1.6;for(const oy of [-4,0,4]){ctx.beginPath();ctx.moveTo(cx-reach*.22,cy+oy);ctx.lineTo(cx+reach*(.12+.48*burst),cy+oy-1.5);ctx.stroke();}}
        }else{
          const count=tier>=2?3:major?10:7;
          for(let i=0;i<count;i++)spawnShard(i,count,{shape:"tri",fill:(i,j)=>i%2?color:"#e5ac62",stroke:"#38303b",travel:1.02,speed:1.06,size:4.0,impulse:.18,drift:.08,gravity:.13,spin:2.2,spread:TAU*.88,bias:.48});
          if(t<.34){ctx.fillStyle=colorWithAlpha("#fff6d9",.68*fade);ctx.beginPath();for(let i=0;i<12;i++){const a=i*TAU/12,r=reach*(i%2?.24:.56)*burst;const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
        }
      }else if(kind==="chain"){
        const tx=effect.toX*this.width,ty=effect.toY*this.height;
        ctx.strokeStyle="#e7c9ff";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((x+tx)/2+3,(y+ty)/2-3);ctx.lineTo(tx,ty);ctx.stroke();
      }else if(kind==="obsidian"){
        ctx.strokeStyle="#ffd39a";ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,radius*1.2,0,TAU);ctx.stroke();
      }else if(kind==="frost"){
        for(let i=0;i<4;i++){ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4+i*Math.PI/2);ctx.beginPath();ctx.moveTo(-radius*.7,0);ctx.lineTo(radius*.7,0);ctx.stroke();ctx.restore();}
      }else if(kind==="moss"){
        ctx.beginPath();ctx.ellipse(x-radius*.35,y,radius*.45,radius*.22,-.55,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(x+radius*.35,y+radius*.15,radius*.38,radius*.18,.55,0,TAU);ctx.fill();
      }else if(kind==="toxic"){
        for(const [ox,oy,s] of [[-.4,-.15,.22],[.25,.3,.18],[.25,-.3,.14]]){ctx.beginPath();ctx.arc(x+radius*ox,y+radius*oy,radius*s,0,TAU);ctx.fill();}
      }else if(kind==="armor"||kind==="power"){
        ctx.beginPath();ctx.moveTo(x-radius*.65,y-radius*.45);ctx.lineTo(x-radius*.1,y-radius*.05);ctx.lineTo(x-radius*.35,y+radius*.55);ctx.moveTo(x+radius*.12,y-radius*.55);ctx.lineTo(x+radius*.45,y);ctx.lineTo(x+radius*.05,y+radius*.52);ctx.stroke();
      }else{
        ctx.lineCap="round";
        for(let i=0;i<4;i++){const a=i*TAU/4+.4;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*radius*.4,y+Math.sin(a)*radius*.4);ctx.lineTo(x+Math.cos(a)*radius,y+Math.sin(a)*radius);ctx.stroke();}
        if(tier<2){for(let i=0;i<(major?6:4);i++){const a=i*TAU/(major?6:4)+.3;const rr=radius*(.65+t*.55);ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,major?2.5:1.8,0,TAU);ctx.fill();}}
      }
      ctx.restore();
    }

    render({ enemies = [], projectiles = [], effects = [], alpha = 1, gameTime = 0, tier = 0, width, height } = {}) {
      if (!this.enabled) return false;
      this.resize(width || this.canvas.clientWidth, height || this.canvas.clientHeight, tier);
      this.clear();
      this.stats.frames += 1;
      this.stats.projectiles = 0; this.stats.enemies = 0; this.stats.effects = 0;
      for (const shot of projectiles) {
        if (!shot || shot.renderVisible === false) continue;
        this.drawProjectile(shot, alpha); this.stats.projectiles += 1;
      }
      for (const enemy of enemies) {
        if (!enemy || enemy.dead || enemy.hp <= 0) continue;
        this.drawEnemy(enemy, alpha, gameTime, tier); this.stats.enemies += 1;
      }
      for (const effect of effects) {
        if (!effect || Number(effect.expiresAt) <= gameTime) continue;
        this.drawEffect(effect, gameTime, tier); this.stats.effects += 1;
      }
      return true;
    }

    snapshot() { return { enabled: this.enabled, width:this.width, height:this.height, dpr:this.dpr, ...this.stats }; }
    destroy() { this.clear(); this.enabled = false; this.ctx = null; }
  }

  function create(canvas, options) { return new DefenseCanvasRenderer(canvas, options); }
  globalThis.RizoDefenseCanvas = Object.freeze({ create, DefenseCanvasRenderer });
})();
