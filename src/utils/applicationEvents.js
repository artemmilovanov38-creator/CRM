export const APPLICATION_STATUS_LABELS = {
  new: "Новая",
  waiting: "Новая",
  in_progress: "В работе",
  approved: "Успешно открыта",
  rejected: "Отказ",
};

export function getStatusLabel(status) {
  if (!status) {
    return "Не указан";
  }

  return APPLICATION_STATUS_LABELS[status] || status;
}

export function getOpenedAt(application) {
  return (
    application?.opened_at ||
    application?.approved_at ||
    null
  );
}

export function isCurrentlyApproved(application) {
  return application?.status === "approved";
}

export function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

export function isTimestampInRange(
  value,
  rangeFrom = null,
  rangeTo = null
) {
  const time = toTimestamp(value);

  if (time === null) {
    return false;
  }

  if (rangeFrom && time < toTimestamp(rangeFrom)) {
    return false;
  }

  if (rangeTo && time >= toTimestamp(rangeTo)) {
    return false;
  }

  return true;
}

export function isDateOnlyInRange(
  value,
  dateFrom = null,
  dateTo = null
) {
  const time = toTimestamp(value);

  if (time === null) {
    return false;
  }

  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00`).getTime();

    if (Number.isNaN(start) || time < start) {
      return false;
    }
  }

  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59.999`).getTime();

    if (Number.isNaN(end) || time > end) {
      return false;
    }
  }

  return true;
}

export function applicationEventDates(application) {
  return {
    createdAt: application?.created_at || null,
    inProgressAt: application?.in_progress_at || null,
    openedAt: getOpenedAt(application),
    rejectedAt: application?.rejected_at || null,
  };
}

export function applicationHasEventInRange(
  application,
  rangeFrom = null,
  rangeTo = null
) {
  if (!rangeFrom && !rangeTo) {
    return true;
  }

  const dates = applicationEventDates(application);

  return (
    isTimestampInRange(dates.createdAt, rangeFrom, rangeTo) ||
    isTimestampInRange(dates.inProgressAt, rangeFrom, rangeTo) ||
    isTimestampInRange(dates.openedAt, rangeFrom, rangeTo) ||
    isTimestampInRange(dates.rejectedAt, rangeFrom, rangeTo)
  );
}

export function normalizeProductName(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function sameEntityId(left, right) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined ||
    left === "" ||
    right === ""
  ) {
    return false;
  }

  return String(left) === String(right);
}

/**
 * Фильтр по продукту конкретной заявки.
 * Если есть product_id — сравниваем только ID.
 * Текст product используем лишь когда ID нет.
 */
export function applicationMatchesProductId(
  application,
  productId,
  selectedProduct = null
) {
  if (!productId) {
    return true;
  }

  if (application?.product_id) {
    return sameEntityId(
      application.product_id,
      productId
    );
  }

  const selectedName = normalizeProductName(
    selectedProduct?.name
  );
  const applicationName = normalizeProductName(
    application?.product
  );

  if (!selectedName || !applicationName) {
    return false;
  }

  return selectedName === applicationName;
}

/**
 * Период вместе со статусом:
 * новые — created_at, в работе — in_progress_at,
 * успешные — opened_at, отказы — rejected_at.
 * Без статуса — любая из этих дат.
 */
export function applicationMatchesStatusAndPeriod(
  application,
  statusFilter = "all",
  rangeFrom = null,
  rangeTo = null
) {
  if (!rangeFrom && !rangeTo) {
    return true;
  }

  if (statusFilter === "approved") {
    return isTimestampInRange(
      getOpenedAt(application),
      rangeFrom,
      rangeTo
    );
  }

  if (statusFilter === "rejected") {
    return isTimestampInRange(
      application?.rejected_at,
      rangeFrom,
      rangeTo
    );
  }

  if (statusFilter === "in_progress") {
    return isTimestampInRange(
      application?.in_progress_at,
      rangeFrom,
      rangeTo
    );
  }

  if (statusFilter === "new") {
    return isTimestampInRange(
      application?.created_at,
      rangeFrom,
      rangeTo
    );
  }

  return applicationHasEventInRange(
    application,
    rangeFrom,
    rangeTo
  );
}

export function applicationMatchesDateOnlyPeriod(
  application,
  dateFrom = null,
  dateTo = null
) {
  if (!dateFrom && !dateTo) {
    return true;
  }

  const dates = applicationEventDates(application);

  return (
    isDateOnlyInRange(dates.createdAt, dateFrom, dateTo) ||
    isDateOnlyInRange(dates.inProgressAt, dateFrom, dateTo) ||
    isDateOnlyInRange(dates.openedAt, dateFrom, dateTo) ||
    isDateOnlyInRange(dates.rejectedAt, dateFrom, dateTo)
  );
}

export function countPeriodApplicationMetrics(
  applications,
  {
    rangeFrom = null,
    rangeTo = null,
    dateFrom = null,
    dateTo = null,
  } = {}
) {
  const inRange = dateFrom || dateTo
    ? (value) => isDateOnlyInRange(value, dateFrom, dateTo)
    : (value) =>
        !rangeFrom && !rangeTo
          ? Boolean(value)
          : isTimestampInRange(value, rangeFrom, rangeTo);

  const metrics = {
    created: 0,
    inProgress: 0,
    opened: 0,
    rejected: 0,
    salaryCount: 0,
    salaryAmount: 0,
  };

  for (const application of applications || []) {
    const dates = applicationEventDates(application);

    if (inRange(dates.createdAt)) {
      metrics.created += 1;
    }

    if (inRange(dates.inProgressAt)) {
      metrics.inProgress += 1;
    }

    if (inRange(dates.openedAt)) {
      metrics.opened += 1;

      if (isCurrentlyApproved(application)) {
        metrics.salaryCount += 1;
        metrics.salaryAmount += Number(
          application.amount ??
            application.opening_price_snapshot ??
            0
        ) || 0;
      }
    }

    if (inRange(dates.rejectedAt)) {
      metrics.rejected += 1;
    }
  }

  return metrics;
}

function pushTimelineEvent(events, event) {
  if (!event?.at) {
    return;
  }

  events.push(event);
}

function statusHistoryKey(oldValue, newValue, at) {
  return [
    "status",
    oldValue || "",
    newValue || "",
    at || "",
  ].join("|");
}

export function buildApplicationTimeline({
  application = null,
  contact = null,
  history = [],
} = {}) {
  const events = [];
  const mailingContact =
    contact || application?.mailing_contact || null;
  const knownStatusKeys = new Set();

  pushTimelineEvent(events, {
    key: "incoming",
    type: "incoming",
    title: "Клиент написал",
    at: mailingContact?.responded_at || null,
    status: null,
  });

  pushTimelineEvent(events, {
    key: "created",
    type: "created",
    title: "Создана заявка",
    at: application?.created_at || null,
    status: "new",
  });

  const statusChanges = (history || [])
    .filter(
      (item) =>
        item?.field_name === "status" &&
        item.old_value !== item.new_value
    )
    .slice()
    .sort((left, right) => {
      return (
        (toTimestamp(left.created_at) || 0) -
        (toTimestamp(right.created_at) || 0)
      );
    });

  for (const item of statusChanges) {
    const at = item.created_at;

    knownStatusKeys.add(
      statusHistoryKey(item.old_value, item.new_value, at)
    );
    knownStatusKeys.add(item.new_value);

    pushTimelineEvent(events, {
      key: `status-${item.id || `${item.new_value}-${at}`}`,
      type: "status",
      title: formatStatusTransitionTitle(
        item.old_value,
        item.new_value
      ),
      at,
      status: item.new_value,
      oldStatus: item.old_value,
      newStatus: item.new_value,
      actor: item.actor || null,
    });
  }

  const inProgressAt = application?.in_progress_at || null;

  if (
    inProgressAt &&
    !knownStatusKeys.has("in_progress")
  ) {
    pushTimelineEvent(events, {
      key: "in_progress",
      type: "status",
      title: "Переведена в работу",
      at: inProgressAt,
      status: "in_progress",
      newStatus: "in_progress",
    });
  }

  const openedAt = getOpenedAt(application);

  if (openedAt && !knownStatusKeys.has("approved")) {
    pushTimelineEvent(events, {
      key: "opened",
      type: "status",
      title: "Успешно открыта",
      at: openedAt,
      status: "approved",
      newStatus: "approved",
    });
  }

  const rejectedAt = application?.rejected_at || null;

  if (rejectedAt && !knownStatusKeys.has("rejected")) {
    pushTimelineEvent(events, {
      key: "rejected",
      type: "status",
      title: "Отказ",
      at: rejectedAt,
      status: "rejected",
      newStatus: "rejected",
    });
  }

  return events.sort((left, right) => {
    return (toTimestamp(left.at) || 0) - (toTimestamp(right.at) || 0);
  });
}

export function formatStatusTransitionTitle(oldValue, newValue) {
  if (!oldValue && newValue) {
    return getStatusTransitionPhrase(newValue);
  }

  if (oldValue && newValue) {
    return `${getStatusLabel(oldValue)} → ${getStatusLabel(newValue)}`;
  }

  return getStatusTransitionPhrase(newValue);
}

export function getStatusTransitionPhrase(status) {
  if (status === "in_progress") {
    return "Переведена в работу";
  }

  if (status === "approved") {
    return "Успешно открыта";
  }

  if (status === "rejected") {
    return "Отказ";
  }

  if (status === "new" || status === "waiting") {
    return "Новая";
  }

  return getStatusLabel(status);
}

export function formatTimelineDate(value, withTime = true) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const options = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };

  if (withTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return new Intl.DateTimeFormat("ru-RU", options).format(date);
}

export default {
  buildApplicationTimeline,
  countPeriodApplicationMetrics,
  applicationHasEventInRange,
  applicationMatchesProductId,
  applicationMatchesStatusAndPeriod,
};
