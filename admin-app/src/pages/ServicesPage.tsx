import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { Header } from "./DashboardPage";
import { getServices, removeService, saveService, updateServiceOrder } from "../services/adminData";
import { money } from "../lib/format";
import { adminMutationError } from "../lib/adminError";
import type { Service, ServiceIconKey } from "../types";
import "./ServicesPage.css";

type EditableService=Partial<Service>&Pick<Service,"name"|"durationMinutes"|"priceCents"|"active"|"sortOrder">;
const blank:EditableService={name:"",description:"",iconKey:"scissors-comb",durationMinutes:30,priceCents:0,active:true,sortOrder:0};
const iconOptions:{key:Exclude<ServiceIconKey,"none">;label:string}[]=[
  {key:"complete",label:"Navalha"},
  {key:"scissors-comb",label:"Pente"},
  {key:"mustache",label:"Bigode"},
  {key:"brush",label:"Pincel"},
  {key:"scissors",label:"Tesoura"},
  {key:"beard",label:"Barba"},
  {key:"chair",label:"Pincel espanador"},
  {key:"spray",label:"Borrifador"},
  {key:"shaver",label:"Máquina"}
];

export default function ServicesPage(){
  const[services,setServices]=useState<Service[]>([]);
  const[editing,setEditing]=useState<EditableService>();
  const[priceReais,setPriceReais]=useState("");
  const[formError,setFormError]=useState("");
  const[saving,setSaving]=useState(false);
  const[draggingId,setDraggingId]=useState<string>();
  const[orderStatus,setOrderStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const serviceElements=useRef(new Map<string,HTMLElement>());
  const dragState=useRef<{id:string;initialIds:string[];currentIds:string[]} | null>(null);
  const previousPositions=useRef(new Map<string,DOMRect>());
  const moveAnimations=useRef(new Map<string,Animation>());

  async function load(){setServices(await getServices())}
  useEffect(()=>{load()},[]);
  useEffect(()=>()=>moveAnimations.current.forEach(animation=>animation.cancel()),[]);

  useLayoutEffect(()=>{
    if(!previousPositions.current.size)return;
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    serviceElements.current.forEach((element,id)=>{
      const previous=previousPositions.current.get(id);
      if(!previous)return;
      const current=element.getBoundingClientRect();
      const offset=previous.top-current.top;
      if(Math.abs(offset)<1)return;
      moveAnimations.current.get(id)?.cancel();
      if(reduceMotion)return;
      const animation=element.animate(
        [{transform:`translateY(${offset}px)`},{transform:"translateY(0)"}],
        {duration:260,easing:"cubic-bezier(.22, 1, .36, 1)"},
      );
      moveAnimations.current.set(id,animation);
      const forgetAnimation=()=>{
        if(moveAnimations.current.get(id)===animation)moveAnimations.current.delete(id);
      };
      animation.onfinish=forgetAnimation;
      animation.oncancel=forgetAnimation;
    });
    previousPositions.current.clear();
  },[services]);

  function captureServicePositions(){
    previousPositions.current=new Map(
      Array.from(serviceElements.current.entries(),([id,element])=>[id,element.getBoundingClientRect()]),
    );
  }

  function openEditor(item?:Service){
    const nextOrder=services.length?Math.max(...services.map(service=>service.sortOrder))+1:1;
    setEditing(item?{...item,iconKey:item.iconKey||suggestIcon(item)}:{...blank,sortOrder:nextOrder});
    setPriceReais(item?String(item.priceCents/100):"");
    setFormError("");
  }

  function closeEditor(){setEditing(undefined);setPriceReais("");setFormError("");setSaving(false)}

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!editing)return;
    const reais=Number(priceReais);
    if(!/^\d+$/.test(priceReais)||!Number.isInteger(reais)||reais<1){
      setFormError("Informe um preço em reais, maior que zero.");
      return;
    }
    setSaving(true);
    try{
      await saveService({...editing,priceCents:reais*100});
      closeEditor();
      await load();
    }catch(reason){
      setFormError(adminMutationError(reason,"Não foi possível salvar o serviço."));
    }finally{
      setSaving(false);
    }
  }

  async function remove(item:Service){
    if(confirm(`Excluir ${item.name}? Prefira desativar se já houver histórico.`)){
      try{await removeService(item.id);await load()}
      catch{alert("O serviço não pôde ser excluído. Desative-o para preservar o histórico.")}
    }
  }

  function beginDrag(event:PointerEvent<HTMLButtonElement>,item:Service){
    if(event.button!==0||orderStatus==="saving")return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ids=services.map(service=>service.id);
    dragState.current={id:item.id,initialIds:ids,currentIds:ids};
    setDraggingId(item.id);
    setOrderStatus("idle");
  }

  function dragService(event:PointerEvent<HTMLButtonElement>){
    const drag=dragState.current;
    if(!drag)return;
    event.preventDefault();
    captureServicePositions();
    setServices(current=>{
      const dragged=current.find(service=>service.id===drag.id);
      if(!dragged)return current;
      const remaining=current.filter(service=>service.id!==drag.id);
      let insertionIndex=remaining.findIndex(service=>{
        const element=serviceElements.current.get(service.id);
        if(!element)return false;
        const bounds=element.getBoundingClientRect();
        return event.clientY<bounds.top+bounds.height/2;
      });
      if(insertionIndex<0)insertionIndex=remaining.length;
      const next=[...remaining];
      next.splice(insertionIndex,0,dragged);
      const nextIds=next.map(service=>service.id);
      if(nextIds.every((id,index)=>id===current[index]?.id)){
        previousPositions.current.clear();
        return current;
      }
      drag.currentIds=nextIds;
      return next;
    });
    if(event.clientY<72)window.scrollBy({top:-10});
    else if(event.clientY>window.innerHeight-72)window.scrollBy({top:10});
  }

  function finishDrag(event:PointerEvent<HTMLButtonElement>){
    const drag=dragState.current;
    if(!drag)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current=null;
    setDraggingId(undefined);
    if(drag.currentIds.some((id,index)=>id!==drag.initialIds[index]))void persistOrder(drag.currentIds,drag.initialIds);
  }

  function cancelDrag(event:PointerEvent<HTMLButtonElement>){
    const drag=dragState.current;
    if(!drag)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    captureServicePositions();
    setServices(current=>drag.initialIds.map(id=>current.find(service=>service.id===id)).filter((service):service is Service=>Boolean(service)));
    dragState.current=null;
    setDraggingId(undefined);
  }

  function moveWithKeyboard(event:KeyboardEvent<HTMLButtonElement>,item:Service){
    if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;
    event.preventDefault();
    if(orderStatus==="saving")return;
    const from=services.findIndex(service=>service.id===item.id);
    const to=event.key==="ArrowUp"?from-1:from+1;
    if(from<0||to<0||to>=services.length)return;
    const initialIds=services.map(service=>service.id);
    const next=[...services];
    const[moved]=next.splice(from,1);
    next.splice(to,0,moved);
    const nextIds=next.map(service=>service.id);
    captureServicePositions();
    setServices(next);
    void persistOrder(nextIds,initialIds);
  }

  async function persistOrder(ids:string[],fallbackIds:string[]){
    setOrderStatus("saving");
    try{
      await updateServiceOrder(ids);
      setServices(current=>current.map((service,index)=>({...service,sortOrder:index+1})));
      setOrderStatus("saved");
      window.setTimeout(()=>setOrderStatus(current=>current==="saved"?"idle":current),1800);
    }catch{
      captureServicePositions();
      setServices(current=>fallbackIds.map(id=>current.find(service=>service.id===id)).filter((service):service is Service=>Boolean(service)));
      setOrderStatus("error");
    }
  }

  const validPrice=/^\d+$/.test(priceReais)&&Number(priceReais)>=1;
  return <>
    <Header eyebrow="CATÁLOGO" title="Serviços" text="Gerencie o que aparece no agendamento público."/>
    <div className="service-order-help" id="service-order-help">
      <span>Arraste pela alça para definir a ordem exibida no site do cliente.</span>
      <strong className={`service-order-status service-order-status--${orderStatus}`} role="status">{orderStatus==="saving"?"Salvando ordem…":orderStatus==="saved"?"Ordem salva":orderStatus==="error"?"Não foi possível salvar. Tente novamente.":""}</strong>
    </div>
    <section className={`panel service-admin ${draggingId?"service-admin--sorting":""}`}>{services.map(item=><article key={item.id} ref={element=>{if(element)serviceElements.current.set(item.id,element);else serviceElements.current.delete(item.id)}} className={draggingId===item.id?"is-dragging":""}>
      <button type="button" className="service-admin__drag" aria-label={`Alterar posição de ${item.name}`} aria-describedby="service-order-help" title="Arraste para reordenar" onPointerDown={event=>beginDrag(event,item)} onPointerMove={dragService} onPointerUp={finishDrag} onPointerCancel={cancelDrag} onKeyDown={event=>moveWithKeyboard(event,item)}><GripVertical size={20} aria-hidden="true"/></button>
      <div className={`service-admin__identity ${item.iconKey==="none"?"service-admin__identity--no-icon":""}`}>{item.iconKey!=="none"&&<img src={iconPath(item.iconKey||suggestIcon(item))} alt=""/>}<span><strong>{item.name}</strong><small>{item.description}</small></span></div>
      <span>{item.durationMinutes} min</span><b>{money(item.priceCents)}</b>
      <i className={item.active?"active":"inactive"}>{item.active?"Ativo":"Inativo"}</i>
      <button className="service-admin__edit" onClick={()=>openEditor(item)}>Editar</button><button className="text-danger" onClick={()=>remove(item)}>Excluir</button>
    </article>)}</section>
    <div className="page-bottom-action"><button className="primary compact pill-primary" onClick={()=>openEditor()}>Novo serviço</button></div>
    {editing&&<div className="modal-backdrop"><form className="modal form-modal" onSubmit={submit}>
      <button type="button" className="modal__close" onClick={closeEditor}>×</button>
      <p>SERVIÇO</p><h2>{editing.id?"Editar serviço":"Novo serviço"}</h2>
      <label>Nome<input required maxLength={80} value={editing.name||""} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
      <label>Descrição<input maxLength={160} value={editing.description||""} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
      <fieldset className="service-icon-picker">
        <legend>Ícone exibido para o cliente</legend>
        <div>
          <button type="button" className={`service-icon-picker__none ${editing.iconKey==="none"?"selected":""}`} aria-pressed={editing.iconKey==="none"} onClick={()=>setEditing({...editing,iconKey:"none"})}><span aria-hidden="true">×</span><span>Sem ícone</span></button>
          {iconOptions.map(option=><button type="button" key={option.key} className={editing.iconKey===option.key?"selected":""} aria-pressed={editing.iconKey===option.key} onClick={()=>setEditing({...editing,iconKey:option.key})}><img src={iconPath(option.key)} alt=""/><span>{option.label}</span></button>)}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>Duração (min)<input type="number" min="10" max="480" required value={editing.durationMinutes} onChange={event=>setEditing({...editing,durationMinutes:Number(event.target.value)})}/></label>
        <label>Preço (R$)<input type="number" inputMode="numeric" min="1" step="1" required value={priceReais} onChange={event=>{setPriceReais(event.target.value);setFormError("")}} placeholder="Ex.: 37"/></label>
        <label className="check"><input type="checkbox" checked={editing.active} onChange={event=>setEditing({...editing,active:event.target.checked})}/> Serviço ativo</label>
      </div>
      {formError&&<p className="form-error" role="alert">{formError}</p>}
      <button className="primary" disabled={!validPrice||saving}>{saving?"Salvando…":"Salvar serviço"}</button>
    </form></div>}
  </>;
}

function iconPath(icon:Exclude<ServiceIconKey,"none">){return`/service-icons/${icon}.svg`}
function suggestIcon(service:Pick<Service,"id"|"name">):Exclude<ServiceIconKey,"none">{
  const value=`${service.id} ${service.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(value.includes("barba")&&value.includes("corte"))return"complete";
  if(value.includes("barba"))return"beard";
  if(value.includes("degrade"))return"shaver";
  return"scissors-comb";
}
