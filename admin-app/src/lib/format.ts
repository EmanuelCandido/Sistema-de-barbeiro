export const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
export const dateLong=(key:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"short"}).format(new Date(`${key}T12:00:00Z`));
export const monthKey=(date=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Recife",year:"numeric",month:"2-digit"}).format(date).slice(0,7);
export const todayKey=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Recife",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function startOfWeek(base=new Date()){const date=new Date(base);const day=(date.getDay()+6)%7;date.setDate(date.getDate()-day);date.setHours(0,0,0,0);return date}
export function dateKey(date:Date){return new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Recife"}).format(date)}
export function addDays(date:Date,days:number){const result=new Date(date);result.setDate(result.getDate()+days);return result}
