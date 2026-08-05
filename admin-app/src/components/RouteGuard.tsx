import { useEffect, useState } from "react";
import { WandSparkles } from "lucide-react";
import { Redirect } from "wouter";
import type { ReactNode } from "react";
import { useOwnerAuth } from "../hooks/useOwnerAuth";
import { createInitialBusinessData, getSettings } from "../services/adminData";
import { purgeExpiredBookings } from "../services/bookings";
import "./InitialSetup.css";

export function RouteGuard({children}:{children:ReactNode}){
  const{loading,user,denied}=useOwnerAuth();
  const[setup,setSetup]=useState<"checking"|"ready"|"missing">("checking");
  const[creating,setCreating]=useState(false);
  const[error,setError]=useState("");
  useEffect(()=>{if(!user)return;Promise.all([getSettings(),purgeExpiredBookings()]).then(()=>setSetup("ready")).catch(()=>getSettings().then(()=>setSetup("ready")).catch(()=>setSetup("missing")))},[user]);
  if(loading)return <div className="page-state">Carregando sessão segura…</div>;
  if(!user)return <Redirect to={denied?"/login?denied=1":"/login"} replace/>;
  if(setup==="checking")return <div className="page-state">Verificando configuração da barbearia…</div>;
  if(setup==="missing")return <main className="initial-setup"><section><div className="initial-setup__icon" aria-hidden="true"><WandSparkles size={28}/></div><p>PRIMEIRO ACESSO</p><h1>Prepare sua barbearia</h1><span>O Firestore está seguro e vazio. Crie agora os horários e serviços iniciais para liberar o site público.</span>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary" disabled={creating} onClick={async()=>{setCreating(true);setError("");try{await createInitialBusinessData();setSetup("ready")}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível criar os dados iniciais.")}finally{setCreating(false)}}}>{creating?"Criando dados…":"Criar configuração inicial"}</button><small>Você poderá alterar nome, telefone, horários, preços e serviços logo depois.</small></section></main>;
  return children;
}
