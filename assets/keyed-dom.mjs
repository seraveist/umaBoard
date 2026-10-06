// Keep checkbox focus, open descriptions and scroll positions when ranks change.
export function reconcileRows(container,items,create,update){
 const scrollTop=container.scrollTop,existing=new Map([...container.children].filter(n=>n.dataset.rowKey).map(n=>[n.dataset.rowKey,n]));
 const wanted=new Set(items.map(item=>item.id));
 for(const node of [...container.children])if(!wanted.has(node.dataset.rowKey))node.remove();
 let cursor=container.firstElementChild;
 items.forEach((item,index)=>{
  let node=existing.get(item.id);
  if(!node){node=create(item);node.dataset.rowKey=item.id;}
  update(node,item,index);
  if(node!==cursor)container.insertBefore(node,cursor);
  cursor=node.nextElementSibling;
 });
 container.scrollTop=scrollTop;
}

export function textIfChanged(node,value){if(node.textContent!==value)node.textContent=value;}
export function htmlIfChanged(node,value){if(node._renderedHtml!==value){node.innerHTML=value;node._renderedHtml=value;}}
