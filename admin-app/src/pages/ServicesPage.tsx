import { useEffect, useState, type FormEvent } from "react";
import { Header } from "./DashboardPage";
import { getServices, removeService, saveService } from "../services/adminData";
import { money } from "../lib/format";
import type { Service, ServiceIconKey } from "../types";
import "./ServicesPage.css";

type EditableService=Partial<Service>&Pick<Service,"name"|"durationMinutes"|"priceCents"|"active"|"sortOrder">;
const blank:EditableService={name:"",description:"",iconKey:"scissors-comb",durationMinutes:30,priceCents:0,active:true,sortOrder:0};
const iconOptions:{key:Exclude<ServiceIconKey,"none">;label:string}[]=[
  {key:"complete",label:"Completo"},
  {key:"scissors-comb",label:"Tesoura e pente"},
  {key:"scissors",label:"Tesoura"},
  {key:"shaver",label:"Barbeador"},
  {key:"beard",label:"Barba"}
];

export default function ServicesPage(){
  const[services,setServices]=useState<Service[]>([]);
  const[editing,setEditing]=useState<EditableService>();
  const[priceReais,setPriceReais]=useState("");
  const[formError,setFormError]=useState("");

  async function load(){setServices(await getServices())}
  useEffect(()=>{load()},[]);

  function openEditor(item?:Service){
    setEditing(item?{...item,iconKey:item.iconKey||suggestIcon(item)}:{...blank});
    setPriceReais(item?String(item.priceCents/100):"");
    setFormError("");
  }

  function closeEditor(){setEditing(undefined);setPriceReais("");setFormError("")}

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!editing)return;
    const reais=Number(priceReais);
    if(!/^\d+$/.test(priceReais)||!Number.isInteger(reais)||reais<1){
      setFormError("Informe um preço em reais, maior que zero.");
      return;
    }
    await saveService({...editing,priceCents:reais*100});
    closeEditor();
    await load();
  }

  async function remove(item:Service){
    if(confirm(`Excluir ${item.name}? Prefira desativar se já houver histórico.`)){
      try{await removeService(item.id);await load()}
      catch{alert("O serviço não pôde ser excluído. Desative-o para preservar o histórico.")}
    }
  }

  const validPrice=/^\d+$/.test(priceReais)&&Number(priceReais)>=1;
  return <>
    <Header eyebrow="CATÁLOGO" title="Serviços" text="Gerencie o que aparece no agendamento público."/>
    <section className="panel service-admin">{services.map(item=><article key={item.id}>
      <div className={`service-admin__identity ${item.iconKey==="none"?"service-admin__identity--no-icon":""}`}>{item.iconKey!=="none"&&<img src={iconPath(item.iconKey||suggestIcon(item))} alt=""/>}<span><strong>{item.name}</strong><small>{item.description}</small></span></div>
      <span>{item.durationMinutes} min</span><b>{money(item.priceCents)}</b>
      <i className={item.active?"active":"inactive"}>{item.active?"Ativo":"Inativo"}</i>
      <button onClick={()=>openEditor(item)}>Editar</button><button className="text-danger" onClick={()=>remove(item)}>Excluir</button>
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
        <label>Ordem<input type="number" min="0" value={editing.sortOrder} onChange={event=>setEditing({...editing,sortOrder:Number(event.target.value)})}/></label>
        <label className="check"><input type="checkbox" checked={editing.active} onChange={event=>setEditing({...editing,active:event.target.checked})}/> Serviço ativo</label>
      </div>
      {formError&&<p className="form-error" role="alert">{formError}</p>}
      <button className="primary" disabled={!validPrice}>Salvar serviço</button>
    </form></div>}
  </>;
}

function iconPath(icon:Exclude<ServiceIconKey,"none">){return`/service-icons/${icon}.png`}
function suggestIcon(service:Pick<Service,"id"|"name">):Exclude<ServiceIconKey,"none">{
  const value=`${service.id} ${service.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(value.includes("barba")&&value.includes("corte"))return"complete";
  if(value.includes("barba"))return"beard";
  if(value.includes("degrade"))return"shaver";
  return"scissors-comb";
}
