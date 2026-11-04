import { todayDateInput } from "../../utils/periodRange";

import "../../styles/ApplicationEventDates.css";

export default function ApplicationEventDatesFields({
  wroteOn = "",
  submittedOn = "",
  openedOn = "",
  status = "",
  disabled = false,
  wroteDisabled = false,
  onWroteChange,
  onSubmittedChange,
  onOpenedChange,
}) {
  const openedForSalary = status === "approved";

  return (
    <div className="application-event-dates">
      <p className="application-event-dates__intro">
        Три даты внутри человека. В зарплату идёт только
        день, когда статус стал «Успешно открыта».
      </p>

      <label className="application-event-dates__field">
        <span>Когда написал</span>
        <input
          type="date"
          value={wroteOn}
          max={todayDateInput()}
          disabled={disabled || wroteDisabled}
          onChange={(event) =>
            onWroteChange?.(event.target.value)
          }
        />
        <small>Для конверсии, не для зарплаты</small>
      </label>

      <label className="application-event-dates__field">
        <span>Когда подал заявку</span>
        <input
          type="date"
          value={submittedOn}
          max={todayDateInput()}
          required
          disabled={disabled}
          onChange={(event) =>
            onSubmittedChange?.(event.target.value)
          }
        />
        <small>Когда завели заявку «в работе»</small>
      </label>

      <label
        className={[
          "application-event-dates__field",
          openedForSalary
            ? "application-event-dates__field--salary"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span>Когда успешно открыта</span>
        <input
          type="date"
          value={openedOn}
          max={todayDateInput()}
          required={openedForSalary}
          disabled={disabled}
          onChange={(event) =>
            onOpenedChange?.(event.target.value)
          }
        />
        <small>
          {openedForSalary
            ? "Зарплата посчитается за этот день"
            : "Заполните, когда поставите статус «Успешно открыта»"}
        </small>
      </label>
    </div>
  );
}

export function ApplicationEventDatesView({
  wroteAt,
  submittedAt,
  openedAt,
  status,
}) {
  const openedForSalary = status === "approved";

  return (
    <div className="application-event-dates-view">
      <div>
        <span>Когда написал</span>
        <strong>{formatDateOnly(wroteAt)}</strong>
      </div>
      <div>
        <span>Когда подал заявку</span>
        <strong>{formatDateOnly(submittedAt)}</strong>
      </div>
      <div
        className={
          openedForSalary
            ? "application-event-dates-view--salary"
            : ""
        }
      >
        <span>Когда успешно открыта</span>
        <strong>
          {openedForSalary
            ? formatDateOnly(openedAt)
            : "Ещё не открыта"}
        </strong>
      </div>
    </div>
  );
}

function formatDateOnly(value) {
  if (!value) {
    return "Не указана";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
