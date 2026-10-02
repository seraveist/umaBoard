/*
 * Prototype analysis adapter. All skill records, coefficients, activation cases,
 * and HP reserves are fixtures, NOT the Japanese game's calculation rules.
 * Replace FixtureEngine with a validated solver without changing the UI contract.
 */
(() => {
  'use strict';
  const cases = {
    best:{name:'유리한 발동',connection:1,delay:0},
    typical:{name:'대표 발동',connection:.5,delay:.7},
    worst:{name:'불리한 발동',connection:0,delay:2.2}
  };
  const cards = [
    {id:'A',name:'스피드 카드 A',type:'스피드',slot:1},
    {id:'H',name:'스피드 카드 H',type:'스피드',slot:1},
    {id:'B',name:'스피드 카드 B',type:'스피드',slot:2},
    {id:'I',name:'스피드 카드 I',type:'스피드',slot:2},
    {id:'C',name:'파워 카드 C',type:'파워',slot:3},
    {id:'J',name:'파워 카드 J',type:'파워',slot:3},
    {id:'D',name:'근성 카드 D',type:'근성',slot:4},
    {id:'K',name:'근성 카드 K',type:'근성',slot:4},
    {id:'E',name:'지능 카드 E',type:'지능',slot:5},
    {id:'G',name:'지능 카드 G',type:'지능',slot:5},
    {id:'F',name:'친구 카드 F',type:'친구',slot:6},
    {id:'L',name:'그룹 카드 L',type:'그룹',slot:6}
  ];
  const roster = [
    {id:'oguri',name:'오구리 캡',letter:'O',bloom:3,owned:true},
    {id:'teio',name:'토카이 테이오',letter:'T',bloom:3,owned:true},
    {id:'kita',name:'키타산 블랙',letter:'K',bloom:3,owned:true},
    {id:'sky',name:'세이운 스카이',letter:'S',bloom:3,owned:false},
    {id:'nishi',name:'니시노 플라워',letter:'N',bloom:3,owned:false},
    {id:'mcqueen',name:'메지로 맥퀸',letter:'M',bloom:3,owned:false}
  ];
  const skillRecords = [
    {id:'s1',name:'종반 고유 속도 A',type:'speed',grade:'고유',origin:'자체 고유',path:'기본 보유',sp:0,target:.65,start:4,duration:5,reason:'종반의 목표속도를 올리는 고유기 예시입니다.',condition:'종반 구간 · 조건 충족 가정',levelScaled:true},
    {id:'s2',name:'계승 접속 속도 B',type:'speed',grade:'계승 고유',origin:'계승 후보 우마 A',path:'계승 준비',sp:200,entry:1.65,target:.2,start:0,duration:2.5,reason:'접속 성공 정도에 따라 종반 진입속도가 달라지는 후보입니다.',condition:'종반 직전 발동 · 순위 조건 충족 가정',connection:true},
    {id:'s3',name:'시나리오 속도 C · 진화',type:'speed',grade:'진화',origin:'서포트',cardSlot:1,path:'연속 이벤트 · 시나리오 진화',sp:340,priorDistance:1.4,target:.25,start:0,duration:3,reason:'중반에서 확보한 거리 이득과 종반까지 남는 효과를 함께 반영합니다.',condition:'중반 발동 · 진화 조건 달성 가정',evolution:'원본 금색 속도 C → 시나리오 속도 C · 진화 / 이벤트 완주·시나리오 진화 조건 달성'},
    {id:'s4',name:'종반 속도 D',type:'speed',grade:'흰색',origin:'서포트',cardSlot:2,path:'힌트',sp:180,target:.35,start:8,duration:4,reason:'종반 가속 이후에 목표속도를 높이는 예시입니다.',condition:'종반 구간 · 발동 시점 가정'},
    {id:'s5',name:'각성 속도 E · 진화',type:'speed',grade:'진화',origin:'자체 · 각성 MAX',path:'각성 스킬 · 진화',sp:320,target:.45,start:5,duration:4,reason:'각성 MAX으로 개방된 금스킬은 진화형 효과로 비교합니다.',condition:'코너 구간 · 진화 조건 달성 가정',evolution:'원본 금색 속도 E → 각성 속도 E · 진화 / 대상 스킬 습득·진화 조건 달성'},
    {id:'s6',name:'직선 속도 F',type:'speed',grade:'흰색',origin:'서포트',cardSlot:5,path:'힌트',sp:160,target:.3,start:12,duration:3,reason:'직선에서 발동하는 속도기 예시입니다.',condition:'직선 구간 · 발동 시점 가정'},
    {id:'a1',name:'주력 가속 A · 진화',type:'accel',grade:'진화',origin:'자체 · 각성 MAX',path:'각성 스킬 · 진화',sp:360,acceleration:.42,start:0,duration:4,primary:true,reason:'종반 초반의 주력 후보입니다. 발동 시점과 속도 차이에 따라 효율이 달라집니다.',condition:'종반 진입 · 발동 조건 충족 가정',evolution:'원본 금색 가속 A → 주력 가속 A · 진화 / 대상 스킬 습득·진화 조건 달성'},
    {id:'a2',name:'보완 가속 B',type:'accel',grade:'금색',origin:'서포트',cardSlot:5,path:'연속 이벤트',sp:320,acceleration:.28,start:1.2,duration:3,reason:'주력과 겹치는 구간의 추가 이득과 비용을 비교합니다.',condition:'종반 무작위 구간 · 위치 가정'},
    {id:'a3',name:'계승 가속 C',type:'accel',grade:'계승 고유',origin:'계승 후보 우마 B',path:'계승 준비',sp:200,acceleration:.22,start:.3,duration:2.4,reason:'별도의 계승형 효과로 계산하는 가속 후보입니다.',condition:'종반 코너 · 순위 조건 충족 가정'},
    {id:'a4',name:'늦은 구간 가속 D',type:'accel',grade:'흰색',origin:'서포트',cardSlot:3,path:'힌트',sp:160,acceleration:.18,start:6,duration:3,reason:'발동할 때 이미 목표속도에 도달했다면 추가 이득이 적습니다.',condition:'늦은 종반 구간 · 위치 가정'},
    {id:'h1',name:'각성 회복 E · 진화',type:'heal',grade:'진화',origin:'자체 · 각성 MAX',path:'각성 스킬 · 진화',sp:280,recovery:.055,start:5,reason:'발동 시점에 회복하고 지구력 고갈과 유지 여부를 비교합니다.',condition:'중후반 발동 · 진화 조건 달성 가정',evolution:'원본 금색 회복 E → 각성 회복 E · 진화 / 대상 스킬 습득·진화 조건 달성'},
    {id:'h2',name:'코너 회복 F',type:'heal',grade:'흰색',origin:'서포트',cardSlot:3,path:'힌트',sp:160,recovery:.015,start:9,reason:'소량 회복의 보완 효과를 확인합니다.',condition:'코너 구간 · 발동 시점 가정'}
  ];
  const factorRecords = [
    {id:'f1',name:'중반 접속 속도 G',type:'speed',entry:.9,target:.15,start:0,duration:2,priorDistance:.5,sp:180,connection:true,reason:'추가 접속 후보로 진입속도와 가속 추천 변화를 확인합니다.'},
    {id:'f2',name:'종반 속도 H',type:'speed',target:.4,start:9,duration:4,sp:180},
    {id:'f3',name:'거리 코너 I',type:'speed',target:.35,start:7,duration:4,sp:160},
    {id:'f4',name:'거리 직선 J',type:'speed',target:.3,start:12,duration:4,sp:160},
    {id:'f5',name:'각질 코너 K',type:'speed',priorDistance:.95,sp:160},
    {id:'f6',name:'구간 가속 L',type:'accel',acceleration:.19,start:1,duration:3,sp:180},
    {id:'f7',name:'각질 직선 M',type:'speed',target:.25,start:13,duration:4,sp:160},
    {id:'f8',name:'끝 구간 속도 N',type:'speed',target:.28,start:16,duration:3,sp:180},
    {id:'f9',name:'중반 속도 O',type:'speed',priorDistance:.7,sp:180},
    {id:'f10',name:'보완 가속 P',type:'accel',acceleration:.14,start:3,duration:3,sp:160},
    {id:'f11',name:'직선 속도 Q',type:'speed',target:.2,start:17,duration:3,sp:160},
    {id:'f12',name:'중간 구간 속도 R',type:'speed',priorDistance:.55,sp:180}
  ].map(s=>({...s,grade:'흰색',origin:'흰 인자',path:'인자 준비',condition:s.connection?'종반 직전 발동 · 접속 가정':'스킬 조건 충족·발동 위치 가정',reason:s.reason||'현재 편성 밖의 후보를 습득했을 때의 추가 이득을 비교합니다.'}));
  const all = new Map([...skillRecords,...factorRecords].map(s=>[s.id,s]));
  const ordered = ids => [...ids].sort();
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const sum = (arr,fn) => arr.reduce((a,b)=>a+fn(b),0);

  class FixtureEngine {
    constructor(settings) {
      this.settings = Object.freeze({...settings,server:'JP',awakening:'MAX'});
      this.cache = new Map();
      this.baselines = new Map();
    }
    available() {
      const list = skillRecords.map(s=>({...s}));
      if(this.settings.support5==='G') list.push({...all.get('f1'),origin:'서포트',cardSlot:5,path:'힌트'});
      if(this.settings.support1==='H') {
        const s=list.find(s=>s.id==='s3');s.name='시나리오 속도 C2 · 진화';s.target=.2;s.priorDistance=1.1;
      }
      if(this.settings.scenario==='B') {
        const s=list.find(s=>s.id==='s3');s.start=3;s.name+=' · 분기 B';
      }
      return list;
    }
    record(id) { return this.available().find(s=>s.id===id)||all.get(id); }
    factors() { const known=new Set(this.available().map(s=>s.id));return factorRecords.filter(s=>!known.has(s.id)); }
    simulate(speedIds,accelIds,caseId='typical',healIds=new Set()) {
      const key=[caseId,ordered(speedIds).join(','),ordered(accelIds).join(','),ordered(healIds).join(',')].join('|');
      if(this.cache.has(key))return this.cache.get(key);
      const st=this.settings, c=cases[caseId], distance=Number(st.distance), segment=distance/3;
      const speed=ordered(speedIds).map(id=>this.record(id)).filter(Boolean);
      const acceleration=ordered(accelIds).map(id=>this.record(id)).filter(Boolean);
      const healing=ordered(healIds).map(id=>this.record(id)).filter(Boolean);
      const goingMultiplier={good:1,yielding:.97,soft:.94,heavy:.90}[st.going]||1;
      const apt=st.distanceApt==='S'?.22:st.distanceApt==='B'?-.35:0;
      const styleShift={nige:.08,senko:0,sashi:.06,oikomi:.1}[st.style]||0;
      const baseTarget=24+(Number(st.speed)-2000)*.00055+apt+styleShift+(st.mood==='normal'?-.08:0);
      const baseEntry=20.15+(Number(st.speed)-2000)*.0003;
      const baseAccel=.40*Math.sqrt(Number(st.power)/1600)*goingMultiplier*(st.surfaceApt==='B'?.9:1);
      const level=Number(st.bloom)+1;
      const targetEffect=s=>(s.target||0)*(s.levelScaled?(1+(level-4)*.04):1);
      const startTime=s=>(s.start||0)+(s.primary?c.delay:0)+(s.connection?0:(caseId==='worst'?.6:0));
      const duration=s=>s.duration||0;
      let velocity=baseEntry+sum(speed,s=>(s.entry||0)*c.connection);
      const entrySpeed=velocity;
      const targetAt=t=>baseTarget+sum(speed,s=>t>=startTime(s)&&t<startTime(s)+duration(s)?targetEffect(s)*(s.connection?c.connection:1):0);
      const entryTarget=targetAt(0);
      let position=sum(speed,s=>(s.priorDistance||0)*(s.connection?Math.max(.4,c.connection):1));
      let time=0, reached=null, effectiveAccelTime=0;
      const hpMax=distance+.8*Number(st.stamina);
      // Approximate pre-segment HP consumption exists solely to exercise UI states.
      let hp=hpMax-distance*.68-sum(speed,s=>(s.priorDistance||0)*22);
      const hpStart=hp;let hpEmptyAt=null;const healed=new Set();let recovered=0;
      const trajectory=[{t:0,x:position,v:velocity,target:entryTarget,hp}];
      const dt=.04;
      while(position<segment && time<180) {
        const target=targetAt(time);
        const extra=sum(acceleration,s=>time>=startTime(s)&&time<startTime(s)+duration(s)?s.acceleration||0:0);
        const old=velocity;
        if(velocity<target-.0001) { velocity=Math.min(target,velocity+(baseAccel+extra)*dt);if(extra>0)effectiveAccelTime+=dt; }
        else velocity=Math.max(target,velocity-.8*dt);
        for(const s of healing) if(!healed.has(s.id)&&time>=s.start) {
          const amount=Math.min(hpMax-hp,hpMax*s.recovery);hp+=amount;recovered+=amount;healed.add(s.id);
        }
        const drain=20*((velocity-(20-(distance-2000)/1000)+12)**2)/144;
        const gutsFactor=1.6*Math.sqrt(1200/Number(st.guts));
        hp-=drain*gutsFactor*dt;
        if(hp<0&&hpEmptyAt===null)hpEmptyAt=time;
        const next=position+(old+velocity)*.5*dt;
        let used=dt;
        if(next>segment)used=dt*(segment-position)/(next-position);
        position=Math.min(segment,next);time+=used;
        if(reached===null&&velocity>=target-.001)reached=time;
        trajectory.push({t:time,x:position,v:velocity,target,hp});
      }
      const result={entrySpeed,entryTarget,gap:Math.max(0,entryTarget-entrySpeed),finishTime:time,reached,effectiveAccelTime,trajectory,hpMax,hpStart,hpFinal:hp,hpEmptyAt,recovered,segment};
      this.cache.set(key,result);return result;
    }
    positionAt(result,time) {
      const a=result.trajectory;
      if(time>=a[a.length-1].t)return a[a.length-1].x+(time-a[a.length-1].t)*a[a.length-1].v;
      const index=clamp(Math.floor(time/.04),0,a.length-2);
      const p=a[index],n=a[index+1],f=clamp((time-p.t)/(n.t-p.t||1),0,1);
      return p.x+(n.x-p.x)*f;
    }
    gain(speedIds,accelIds,caseId) {
      if(!this.baselines.has(caseId))this.baselines.set(caseId,this.simulate(new Set(),new Set(),caseId));
      const run=this.simulate(speedIds,accelIds,caseId),baseline=this.baselines.get(caseId);
      return (run.segment-this.positionAt(baseline,run.finishTime))/2.5;
    }
    marginal(id,type,selection,caseId) {
      const speed=new Set(selection.speed),accel=new Set(selection.accel);
      const group=type==='speed'?speed:accel,selected=group.has(id);
      const before=this.gain(speed,accel,caseId);
      if(selected)group.delete(id);else group.add(id);
      const after=this.gain(speed,accel,caseId);
      return selected?before-after:after-before;
    }
    recommend(selection,caseId,objective) {
      const pool=this.available().filter(s=>s.type==='accel');
      const known=new Set(pool.map(s=>s.id));
      const forced=new Set([...selection.accel].filter(id=>!known.has(id)));
      const candidates=[];
      for(let mask=0;mask<2**pool.length;mask++) {
        const ids=new Set([...forced,...pool.filter((s,i)=>mask&(1<<i)).map(s=>s.id)]);
        const added=Object.keys(cases).map(c=>this.gain(selection.speed,ids,c)-this.gain(selection.speed,forced,c));
        const index=Object.keys(cases).indexOf(caseId);
        candidates.push({ids,baseIds:new Set([...ids].filter(id=>known.has(id))),sp:sum(pool.filter(s=>ids.has(s.id)),s=>s.sp),gain:added[index],worstGain:added[Object.keys(cases).indexOf('worst')]});
      }
      const metric=objective==='robust'?'worstGain':'gain';
      const maximum=Math.max(...candidates.map(c=>c[metric]));
      const threshold=objective==='efficient'?maximum*.9:maximum;
      const eligible=candidates.filter(c=>c[metric]>=threshold-1e-8);
      eligible.sort((a,b)=>a.sp-b.sp||b[metric]-a[metric]||ordered(a.ids).join(',').localeCompare(ordered(b.ids).join(',')));
      return eligible[0];
    }
    analyze(selection,caseId,objective) {
      const run=this.simulate(selection.speed,selection.accel,caseId,selection.heal);
      const noAccel=this.simulate(selection.speed,new Set(),caseId,selection.heal);
      const recommendation=this.recommend(selection,caseId,objective);
      const scenarios=Object.keys(cases).map(c=>{
        const a=this.simulate(selection.speed,selection.accel,c,selection.heal);
        const b=this.simulate(selection.speed,new Set(),c,selection.heal);
        return {id:c,name:cases[c].name,...a,accelGain:(a.segment-this.positionAt(b,a.finishTime))/2.5};
      });
      const withoutHeal=this.simulate(selection.speed,selection.accel,caseId,new Set());
      const firstSpurtReserve=100,lastSpurtReserve=70;
      const stamina={normal:run,failed:withoutHeal,depleted:run.hpEmptyAt!==null,canStart:run.hpStart>(run.hpStart-withoutHeal.hpFinal)+firstSpurtReserve,canSustain:run.hpEmptyAt===null&&run.hpFinal>=lastSpurtReserve};
      return {mode:'fixture',server:'JP',caseId,objective,run,noAccel,recommendation,scenarios,stamina};
    }
  }
  window.UmaPlanner={FixtureEngine,skillRecords,factorRecords,cards,roster,cases};
})();
