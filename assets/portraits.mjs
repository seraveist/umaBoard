export function portraitPath(catalog,kind,id){
 const path=catalog?.[kind]?.[id]?.path;
 return ['outfits','supports'].includes(kind)&&/^\d+$/.test(id)&&new RegExp(`^assets/portraits/${kind}/${id}-[a-f0-9]{40}\\.(webp|png)$`).test(path||'')?path:null;
}
