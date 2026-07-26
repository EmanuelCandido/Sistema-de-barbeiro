import type { CSSProperties } from "react";

export function Progress({ step }: { step: number }) {
  const labels = ["Serviço", "Dia", "Horário", "Contato", "Confirmação"];
  const progress = (step - 1) / (labels.length - 1);

  return (
    <div className="progress" aria-label={`Etapa ${step} de ${labels.length}`}>
      <ol
        className="progress__steps"
        style={{ "--progress-ratio": progress } as CSSProperties}
      >
        {labels.map((label, index) => {
          const number = index + 1;
          return (
            <li
              key={label}
              className={number <= step ? "is-active" : ""}
              aria-current={number === step ? "step" : undefined}
              aria-label={`${number}. ${label}`}
            >
              <span aria-hidden="true">{number}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
