import type { Service } from "../types";

export function ServiceIcon({service}:{service:Service}){
  if(service.iconKey==="none")return null;
  if(service.iconKey)return <img className="service__icon-image" src={`/service-icons/${service.iconKey}.png`} alt=""/>;
  const value=`${service.id} ${service.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const beard=value.includes("barba");
  const haircut=value.includes("corte");
  if(beard&&haircut)return <ComboIcon/>;
  if(beard)return <BeardIcon/>;
  if(value.includes("degrade"))return <FadeIcon/>;
  return <HaircutIcon/>;
}

function HaircutIcon(){return <Icon><circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="m8.8 8.2 10.2 5.3M8.8 15.8 19 10.5M14.5 12 19 5"/></Icon>}
function FadeIcon(){return <Icon><path d="M5 18h14M6.5 14.5h11M8 11h8M9.5 7.5h5M11 4h2"/><path d="M5 18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2"/></Icon>}
function BeardIcon(){return <Icon><path d="M7 6.5c1.4-1.3 3-2 5-2s3.6.7 5 2v5.2c0 4.3-2.1 7.1-5 8.3-2.9-1.2-5-4-5-8.3Z"/><path d="M7 10c1.5.2 2.8-.2 4-1.2l1 1 1-1c1.2 1 2.5 1.4 4 1.2M9.5 14.5c.8.7 1.6 1 2.5 1s1.7-.3 2.5-1"/></Icon>}
function ComboIcon(){return <Icon><circle cx="5" cy="7" r="2"/><circle cx="5" cy="16" r="2"/><path d="m6.8 8 7.1 3.7M6.8 15l7.4-3.9"/><path d="M14 5.5c1.3-.8 2.7-.8 4 0v6.8c0 3-1.4 5.1-4 6.2-1.1-.5-2-1.2-2.6-2.2M14 9.5l2 1.2 2-1.2"/></Icon>}
function Icon({children}:{children:React.ReactNode}){return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>}
