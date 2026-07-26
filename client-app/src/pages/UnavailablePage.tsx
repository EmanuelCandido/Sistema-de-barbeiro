import { Link } from "react-router-dom";
import { CalendarX2 } from "lucide-react";
export function UnavailablePage() { return <main className="shell"><div className="empty"><span aria-hidden="true"><CalendarX2 size={29}/></span><h1>Agenda temporariamente indisponível</h1><p>Tente novamente em alguns instantes ou fale diretamente com a barbearia.</p><Link className="button button--primary" to="/">Tentar novamente</Link></div></main>; }
