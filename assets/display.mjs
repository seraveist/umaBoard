export const skillName=skill=>skill.name_jp;
export const umaName=outfit=>outfit.name_ko||outfit.name_jp;
export const outfitName=outfit=>`${umaName(outfit)} · ${outfit.outfit_name_jp}`;
export const cardTypes={Speed:'스피드',Stamina:'스태미나',Power:'파워',Guts:'근성',Wit:'지능',Wisdom:'지능',Friend:'친구',Group:'그룹'};
export const cardName=card=>card.name_ko||card.name_jp.replace(/\s+\((SSR|SR|R)\)$/,'');
export const cardLabel=cardName;
const typeIcons={Speed:'speed',Stamina:'stamina',Power:'power',Guts:'guts',Wit:'wisdom',Wisdom:'wisdom',Friend:'friend',Group:'group'};
export const cardTypeBadge=card=>typeIcons[card.type]?{src:`assets/support-types/${typeIcons[card.type]}.png`,label:cardTypes[card.type]}:null;
export const selectableSupports=data=>Object.values(data.supports).filter(card=>card.rarity==='SSR')
 .sort((a,b)=>cardName(a).localeCompare(cardName(b),'ko')||a.type.localeCompare(b.type)||Number(a.id)-Number(b.id));
