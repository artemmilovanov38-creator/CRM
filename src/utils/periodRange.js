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

export function isIsoDateTime(value) {
  return (
    typeof value === "string" &&
    value.includes("T")
  );
}

/**
 * Границы календарного периода в локальной
 * таймзоне проекта: начало первого дня
 * включительно, начало дня после последнего
 * — исключительно. Так 31.08 23:50 входит
 * в период до 31.08, а 01.09 00:00 — нет.
 */
export function dateOnlyToExclusiveIsoRange(
  dateFrom = null,
  dateTo = null
) {
  const parsedFrom = parseInputDate(dateFrom);
  const parsedTo = parseInputDate(dateTo);

  if (!parsedFrom && !parsedTo) {
    return {
      from: null,
      to: null,
    };
  }

  if (parsedFrom && !parsedTo) {
    return {
      from: startOfLocalDay(
        parsedFrom
      ).toISOString(),
      to: null,
    };
  }

  if (!parsedFrom && parsedTo) {
    const lastDay = startOfLocalDay(parsedTo);
    const endExclusive = new Date(lastDay);
    endExclusive.setDate(
      endExclusive.getDate() + 1
    );

    return {
      from: null,
      to: endExclusive.toISOString(),
    };
  }

  const rangeStart = startOfLocalDay(
    parsedFrom <= parsedTo
      ? parsedFrom
      : parsedTo
  );

  const lastDay = startOfLocalDay(
    parsedFrom > parsedTo
      ? parsedFrom
      : parsedTo
  );

  const rangeEndExclusive = new Date(lastDay);
  rangeEndExclusive.setDate(
    rangeEndExclusive.getDate() + 1
  );

  return {
    from: rangeStart.toISOString(),
    to: rangeEndExclusive.toISOString(),
  };
}

export function resolveIsoPeriodBounds(
  dateFrom = null,
  dateTo = null
) {
  if (!dateFrom && !dateTo) {
    return {
      from: null,
      to: null,
    };
  }

  if (
    isIsoDateTime(dateFrom) ||
    isIsoDateTime(dateTo)
  ) {
    return {
      from: dateFrom || null,
      to: dateTo || null,
    };
  }

  return dateOnlyToExclusiveIsoRange(
    dateFrom,
    dateTo
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

export const WRITERS_PERIOD_PRESETS = [
  {
    id: "week",
    label: "Текущая неделя",
  },
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

  if (preset === "week") {
    const weekday = now.getDay();
    const daysFromMonday =
      weekday === 0 ? 6 : weekday - 1;

    rangeStart = new Date(todayStart);
    rangeStart.setDate(
      rangeStart.getDate() - daysFromMonday
    );

    rangeEndExclusive = new Date(
      rangeStart
    );
    rangeEndExclusive.setDate(
      rangeEndExclusive.getDate() + 7
    );
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
