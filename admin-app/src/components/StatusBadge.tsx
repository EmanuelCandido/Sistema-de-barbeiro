import type { Booking, BookingStatus } from "../types";
import "./StatusBadge.css";

const overdueGraceMs=5*60*1000;
const labels:Record<Exclude<BookingStatus,"confirmed">,string>={pending:"Pendente",completed:"Concluído",cancelled:"Cancelado"};
export function isBookingOverdue(booking:Pick<Booking,"status"|"endAt">,now=Date.now()){
  return booking.status==="pending"&&now>booking.endAt.toMillis()+overdueGraceMs;
}
export function StatusBadge({status,overdue=false}:{status:BookingStatus;overdue?:boolean}){if(status==="confirmed")return null;return <span className={`badge badge--${status}${overdue?" badge--overdue":""}`}>{labels[status]}</span>}
