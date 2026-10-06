export function accelerationChart(graph,width=640){
 if(!graph?.selected.length||!graph.reference.length)return '<title>가속 그래프 데이터 없음</title>';
 const height=210,left=42,right=14,top=19,bottom=34;
 const points=[...graph.selected,...graph.reference],low=Math.floor(Math.min(...points.map(p=>p.v))*2)/2-.3;
 const high=Math.ceil(Math.max(...points.map(p=>Math.max(p.v,p.target)))*2)/2+.3;
 const x=t=>left+(t+4)/16*(width-left-right),y=v=>top+(high-v)/(high-low)*(height-top-bottom);
 const path=(rows,key)=>rows.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
 let html='<title>종반 진입 전후 속도 변화 · 중앙 발동 표본</title><desc>실선은 선택 조합, 점선은 동일 스킬의 가속 효과만 제외한 주행입니다. 옅은 영역은 선택 조합이 목표속도 아래에서 주행하는 구간입니다.</desc>';
 for(let i=0;i<4;i++){
  const v=low+(high-low)*i/3;
  html+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="var(--line)"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end" fill="var(--sub)" font-size="11">${v.toFixed(1)}</text>`;
 }
 for(const t of [-4,0,4,8,12])html+=`<text x="${x(t)}" y="${height-16}" text-anchor="middle" fill="var(--sub)" font-size="11">${t}s</text>`;
 for(let i=0;i<graph.selected.length-1;i++){
  const a=graph.selected[i],b=graph.selected[i+1];
  if(a.v<a.target-1e-5)html+=`<rect x="${x(a.t)}" y="${top}" width="${Math.max(0,x(b.t)-x(a.t))}" height="${height-top-bottom}" fill="var(--green)" opacity=".07"/>`;
 }
 html+=`<text x="${left}" y="11" fill="var(--sub)" font-size="10">속도 m/s</text><line x1="${x(0)}" y1="${top}" x2="${x(0)}" y2="${height-bottom}" stroke="var(--line)" stroke-dasharray="3 3"/><path class="target-curve" d="${path(graph.selected,'target')}" fill="none" stroke="var(--blue)" stroke-width="1" opacity=".65"/><path class="reference-curve" d="${path(graph.reference,'v')}" fill="none" stroke="var(--sub)" stroke-width="1.6" stroke-dasharray="5 4"/><path class="selected-curve" d="${path(graph.selected,'v')}" fill="none" stroke="var(--green)" stroke-width="2.3"/>`;
 return html;
}
