import {
  CalendarDays,
} from "lucide-react";

import {
  PERIOD_PRESETS,
  formatDateInput,
  getPeriodBounds,
} from "../../utils/periodRange";

import "./PeriodFilter.css";

export default function PeriodFilter({
  preset,
  customFrom,
  customTo,
  presets = PERIOD_PRESETS,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}) {
  const bounds = getPeriodBounds(
    preset,
    customFrom,
    customTo
  );

  const dateValue =
    preset === "all"
      ? ""
      : preset === "custom"
        ? customFrom
        : bounds.from
          ? formatDateInput(
              new Date(bounds.from)
            )
          : "";

  return (
    <div className="period-filter">
      <div className="period-filter__presets">
        {presets.map(
          (item) => (
            <button
              key={item.id}
              type="button"
              className={
                preset === item.id
                  ? "period-filter__chip period-filter__chip--active"
                  : "period-filter__chip"
              }
              onClick={() =>
                onPresetChange?.(
                  item.id
                )
              }
            >
              {item.label}
            </button>
          )
        )}
      </div>

      <label className="period-filter__date">
        <CalendarDays size={16} />
        <span>
          {preset === "custom"
            ? "С"
            : "День"}
        </span>
        <input
          type="date"
          value={dateValue}
          onChange={(event) => {
            const value =
              event.target.value;

            onCustomFromChange?.(
              value
            );
            onCustomToChange?.(
              value
            );
            onPresetChange?.(
              "custom"
            );
          }}
        />
      </label>

      {preset === "custom" && (
        <label className="period-filter__date">
          <span>По</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(event) =>
              onCustomToChange?.(
                event.target.value
              )
            }
          />
        </label>
      )}
    </div>
  );
}
