import type { BookingStatus } from "../types";
const labels:Record<Exclude<BookingStatus,"confirmed">,string>={pending:"Pendente",completed:"Concluído",cancelled:"Cancelado"};
export function StatusBadge({status}:{status:BookingStatus}){if(status==="confirmed")return null;return <span className={`badge badge--${status}`}>{labels[status]}</span>}
