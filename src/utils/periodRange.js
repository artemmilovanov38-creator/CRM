function pad(value) {
  return String(value).padStart(2, "0");
}

function startOfLocalDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

export function formatDateInput(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

export function formatDateLabel(date) {
  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

function parseInputDate(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] =
    String(value)
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day
  );
}

export const PERIOD_PRESETS = [
  {
    id: "today",
    label: "Сегодня",
  },
  {
    id: "yesterday",
    label: "Вчера",
  },
  {
    id: "last7",
    label: "За 7 дней",
  },
  {
    id: "month",
    label: "Текущий месяц",
  },
  {
    id: "prev-month",
    label: "Прошлый месяц",
  },
  {
    id: "all",
    label: "Все даты",
  },
  {
    id: "custom",
    label: "Свой период",
  },
];

export function getPeriodBounds(
  preset = "today",
  customFrom = "",
  customTo = ""
) {
  const now = new Date();
  const todayStart =
    startOfLocalDay(now);

  if (preset === "all") {
    return {
      from: null,
      to: null,
      label: "за всё время",
      shortLabel: "Все даты",
    };
  }

  let rangeStart = todayStart;
  let rangeEndExclusive =
    new Date(todayStart);

  rangeEndExclusive.setDate(
    rangeEndExclusive.getDate() + 1
  );

  if (preset === "yesterday") {
    rangeStart = new Date(todayStart);
    rangeStart.setDate(
      rangeStart.getDate() - 1
    );
    rangeEndExclusive = todayStart;
  }

  if (preset === "last7") {
    rangeStart = new Date(todayStart);
    rangeStart.setDate(
      rangeStart.getDate() - 6
    );
  }

  if (preset === "month") {
    rangeStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  }

  if (preset === "prev-month") {
    rangeStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    rangeEndExclusive = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  }

  if (preset === "custom") {
    const fromDate =
      parseInputDate(customFrom) ||
      todayStart;

    const toDate =
      parseInputDate(customTo) ||
      fromDate;

    rangeStart = startOfLocalDay(
      fromDate < toDate
        ? fromDate
        : toDate
    );

    const lastDay = startOfLocalDay(
      fromDate > toDate
        ? fromDate
        : toDate
    );

    rangeEndExclusive = new Date(
      lastDay
    );
    rangeEndExclusive.setDate(
      rangeEndExclusive.getDate() + 1
    );
  }

  const lastVisible = new Date(
    rangeEndExclusive.getTime() - 1
  );

  const sameDay =
    rangeStart.getFullYear() ===
      lastVisible.getFullYear() &&
    rangeStart.getMonth() ===
      lastVisible.getMonth() &&
    rangeStart.getDate() ===
      lastVisible.getDate();

  const label = sameDay
    ? `за ${formatDateLabel(rangeStart)}`
    : `за ${formatDateLabel(rangeStart)}–${formatDateLabel(lastVisible)}`;

  return {
    from: rangeStart.toISOString(),
    to: rangeEndExclusive.toISOString(),
    label,
    shortLabel: sameDay
      ? formatDateLabel(rangeStart)
      : `${formatDateLabel(rangeStart)} – ${formatDateLabel(lastVisible)}`,
  };
}
