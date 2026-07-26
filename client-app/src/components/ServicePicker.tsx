import { Check } from "lucide-react";
import { money } from "../lib/date";
import type { Service } from "../types";
import { ServiceIcon } from "./ServiceIcon";

export const MAX_BOOKING_SERVICES = 2;

export function ServicePicker({
  services,
  selectedIds,
  toggle,
}: {
  services: Service[];
  selectedIds: string[];
  toggle: (service: Service) => void;
}) {
  const selected = selectedIds
    .map((id) => services.find((service) => service.id === id))
    .filter((service): service is Service => Boolean(service));
  const duration = selected.reduce((total, service) => total + service.durationMinutes, 0);
  const price = selected.reduce((total, service) => total + service.priceCents, 0);

  return <>
    <div className="service-list">
      {services.map((service) => {
        const isSelected = selectedIds.includes(service.id);
        return <button
          type="button"
          className={`service ${service.iconKey === "none" ? "service--no-icon " : ""}${isSelected ? "is-selected" : ""}`}
          key={service.id}
          onClick={() => toggle(service)}
          aria-pressed={isSelected}
        >
          {service.iconKey !== "none" && <span className="service__icon" aria-hidden="true"><ServiceIcon service={service}/></span>}
          <span><strong>{service.name}</strong><small>{service.description || `${service.durationMinutes} minutos`}</small></span>
          <span className="service__meta"><b>{money(service.priceCents)}</b><small>{service.durationMinutes} min</small></span>
          <span className="service__check" aria-hidden="true">{isSelected && <Check size={15}/>}</span>
        </button>;
      })}
    </div>
    <div className="service-selection-summary" aria-live="polite">
      <span>{selected.length} {selected.length === 1 ? "serviço selecionado" : "serviços selecionados"}</span>
      <strong>{selected.length ? `${duration} min · ${money(price)}` : "Selecione pelo menos um"}</strong>
    </div>
  </>;
}
