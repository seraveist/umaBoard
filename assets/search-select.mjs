// Keep IDs in a native select; typing only searches and never changes selection.
export const searchKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');

export function searchableSelect(select,{id,placeholder='이름 검색',keywords=new Map()}={}){
 const wrapper=document.createElement('div');wrapper.className='search-select';
 const input=document.createElement('input');input.id=id;input.type='text';input.placeholder=placeholder;
 input.autocomplete='off';input.spellcheck=false;input.setAttribute('role','combobox');
 input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
 const list=document.createElement('div');list.id=id+'-list';list.className='search-options';list.hidden=true;
 list.setAttribute('role','listbox');list.setAttribute('aria-label',placeholder);input.setAttribute('aria-controls',list.id);
 const status=document.createElement('div');status.className='search-empty';status.textContent='검색 결과 없음';status.hidden=true;
 wrapper.append(input,list,status);select.hidden=true;select.after(wrapper);
 const rows=[...select.options].map((o,index)=>({value:o.value,label:o.textContent,index,
  key:searchKey(o.textContent+' '+(keywords.get(o.value)||''))}));
 let matches=[],active=-1,composing=false,searching=false;
 const sync=()=>{input.value=select.selectedOptions[0]?.textContent||'';input.title=input.value;input.disabled=select.disabled;};
 function setActive(index){
  active=index;
  [...list.children].forEach((node,i)=>node.classList.toggle('active',i===active));
  const node=list.children[active];
  if(node){input.setAttribute('aria-activedescendant',node.id);node.scrollIntoView({block:'nearest'});}
  else input.removeAttribute('aria-activedescendant');
 }
 function close(){list.hidden=true;status.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;sync();}
 function show(query=''){
  // Close another picker before opening this one.
  document.dispatchEvent(new CustomEvent('uma-picker-open',{detail:wrapper}));
  const tokens=String(query).trim().split(/\s+/).filter(Boolean).map(searchKey);
  searching=tokens.length>0;
  matches=rows.filter(row=>tokens.every(token=>row.key.includes(token)));
  list.replaceChildren(...matches.map(row=>{
   const node=document.createElement('div');node.id=id+'-option-'+row.index;node.className='search-option';
   node.setAttribute('role','option');node.setAttribute('aria-selected',String(row.value===select.value));
   node.dataset.value=row.value;node.textContent=row.label;return node;
  }));
  list.hidden=false;status.hidden=matches.length!==0;input.setAttribute('aria-expanded','true');
  wrapper.classList.toggle('opens-up',innerHeight-input.getBoundingClientRect().bottom<200&&input.getBoundingClientRect().top>200);
  setActive(-1);
 }
 function choose(row){
  if(!row)return;
  const changed=select.value!==row.value;select.value=row.value;close();
  if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));
 }
 input.addEventListener('focus',()=>{show();input.select();});
 input.addEventListener('click',()=>{if(list.hidden){show();input.select();}});
 input.addEventListener('input',()=>show(input.value));
 input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;show(input.value);});
 input.addEventListener('keydown',event=>{
  if(event.isComposing||composing)return;
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key==='Tab'){close();return;}
  if(event.key==='Enter'&&!list.hidden){
   event.preventDefault();choose(active>=0?matches[active]:searching?matches[0]:matches.find(row=>row.value===select.value));return;
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  if(['Home','End'].includes(event.key)&&list.hidden)return;
  event.preventDefault();if(list.hidden)show();
  if(!matches.length)return;
  setActive(event.key==='Home'?0:event.key==='End'?matches.length-1:
   event.key==='ArrowDown'?(active+1)%matches.length:(active<0?matches.length-1:(active-1+matches.length)%matches.length));
 });
 list.addEventListener('mousedown',event=>event.preventDefault());
 list.addEventListener('click',event=>{const option=event.target.closest('[data-value]');if(option)choose(matches.find(row=>row.value===option.dataset.value));});
 input.addEventListener('blur',close);
 select.addEventListener('change',sync);
 document.addEventListener('uma-picker-open',event=>{if(event.detail!==wrapper)close();});
 sync();return {sync,close,input};
}
