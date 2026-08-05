import { lazy, Suspense, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { OwnerAuthProvider } from "./hooks/useOwnerAuth";
import { RouteGuard } from "./components/RouteGuard";
import { Layout } from "./components/Layout";
const Login=lazy(()=>import("./pages/LoginPage"));const Dashboard=lazy(()=>import("./pages/DashboardPage"));const Agenda=lazy(()=>import("./pages/AgendaPage"));const Finance=lazy(()=>import("./pages/FinancePage"));const Services=lazy(()=>import("./pages/ServicesPage"));const Schedule=lazy(()=>import("./pages/SchedulePage"));const Settings=lazy(()=>import("./pages/SettingsPage"));
function Protected({children}:{children:ReactNode}){return <RouteGuard><Layout>{children}</Layout></RouteGuard>}
export default function App(){return <OwnerAuthProvider><Suspense fallback={<div className="page-state">Carregando módulo…</div>}><Switch><Route path="/login" component={Login}/><Route path="/"><Protected><Dashboard/></Protected></Route><Route path="/agenda"><Protected><Agenda/></Protected></Route><Route path="/financeiro"><Protected><Finance/></Protected></Route><Route path="/servicos"><Protected><Services/></Protected></Route><Route path="/horarios"><Protected><Schedule/></Protected></Route><Route path="/configuracoes"><Protected><Settings/></Protected></Route><Redirect to="/" replace/></Switch></Suspense></OwnerAuthProvider>}
