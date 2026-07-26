import { LogOut, Scissors, Settings } from "lucide-react";
import { signOut } from "firebase/auth";
import { NavLink, Outlet } from "react-router-dom";
import { useOwnerAuth } from "../hooks/useOwnerAuth";
import { auth } from "../lib/firebase";

const links = [
  { to: "/", label: "Início", regularIcon: "/nav-icons/home-outline.svg", boldIcon: "/nav-icons/home.svg", regularWhite: true, boldWhite: false },
  { to: "/agenda", label: "Agenda", regularIcon: "/nav-icons/calendar.svg", boldIcon: "/nav-icons/calendar-bold.svg", regularWhite: false, boldWhite: true },
  { to: "/servicos", label: "Serviços", regularIcon: "/nav-icons/services.svg", boldIcon: "/nav-icons/services-bold.svg", regularWhite: false, boldWhite: true },
  { to: "/financeiro", label: "Financeiro", regularIcon: "/nav-icons/finance.svg", boldIcon: "/nav-icons/finance-bold.svg", regularWhite: false, boldWhite: true },
  { to: "/horarios", label: "Horários", regularIcon: "/nav-icons/clock.svg", boldIcon: "/nav-icons/clock-bold.svg", regularWhite: false, boldWhite: true },
];

export function Layout() {
  const { profile } = useOwnerAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><b><Scissors size={20} /></b><span>Barbearia<small>PAINEL DO PROPRIETÁRIO</small></span></div>
        <nav>
          {links.map(({ to, label, ...icons }) => <NavLink key={to} to={to} end={to === "/"}><NavIcon {...icons} /><span>{label}</span></NavLink>)}
          <NavLink to="/configuracoes"><Settings size={18} strokeWidth={1.9} /><span>Configurações</span></NavLink>
        </nav>
        <div className="profile">
          <span>{profile?.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{profile?.name}</strong><small>Proprietário</small></div>
          <button onClick={() => signOut(auth)} title="Sair" aria-label="Encerrar sessão"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {links.map(({ to, label, ...icons }) => <NavLink key={to} to={to} end={to === "/"}><NavIcon {...icons} /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}

function NavIcon({regularIcon,boldIcon,regularWhite,boldWhite}:{regularIcon:string;boldIcon:string;regularWhite:boolean;boldWhite:boolean}) {
  return <span className="nav-icon" aria-hidden="true">
    <img className={`nav-icon__regular ${regularWhite ? "nav-icon--white-source" : ""}`} src={regularIcon} alt="" />
    <img className={`nav-icon__bold ${boldWhite ? "nav-icon--white-source" : ""}`} src={boldIcon} alt="" />
  </span>;
}
