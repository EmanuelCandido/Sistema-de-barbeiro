import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { OwnerAuthProvider } from "./hooks/useOwnerAuth";
import { RouteGuard } from "./components/RouteGuard";
import { Layout } from "./components/Layout";
const Login=lazy(()=>import("./pages/LoginPage"));const Dashboard=lazy(()=>import("./pages/DashboardPage"));const Agenda=lazy(()=>import("./pages/AgendaPage"));const Finance=lazy(()=>import("./pages/FinancePage"));const Services=lazy(()=>import("./pages/ServicesPage"));const Schedule=lazy(()=>import("./pages/SchedulePage"));const Settings=lazy(()=>import("./pages/SettingsPage"));
export default function App(){return <OwnerAuthProvider><BrowserRouter><Suspense fallback={<div className="page-state">Carregando módulo…</div>}><Routes><Route path="/login" element={<Login/>}/><Route element={<RouteGuard/>}><Route element={<Layout/>}><Route index element={<Dashboard/>}/><Route path="agenda" element={<Agenda/>}/><Route path="financeiro" element={<Finance/>}/><Route path="servicos" element={<Services/>}/><Route path="horarios" element={<Schedule/>}/><Route path="configuracoes" element={<Settings/>}/></Route></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense></BrowserRouter></OwnerAuthProvider>}
