import {
  buildApplicationTimeline,
  countPeriodApplicationMetrics,
  isDateOnlyInRange,
} from "../src/utils/applicationEvents.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const application = {
  id: "app-1",
  status: "approved",
  created_at: "2026-09-05T10:00:00.000Z",
  in_progress_at: "2026-09-10T14:32:00.000Z",
  opened_at: "2026-09-20T11:15:00.000Z",
  approved_at: "2026-09-20T11:15:00.000Z",
  rejected_at: null,
  amount: 15000,
  opening_price_snapshot: 15000,
};

const contact = {
  responded_at: "2026-09-02T09:00:00.000Z",
};

const history = [
  {
    id: "h1",
    field_name: "status",
    old_value: "new",
    new_value: "in_progress",
    created_at: "2026-09-10T14:32:00.000Z",
  },
  {
    id: "h2",
    field_name: "status",
    old_value: "in_progress",
    new_value: "approved",
    created_at: "2026-09-20T11:15:00.000Z",
  },
];

const timeline = buildApplicationTimeline({
  application,
  contact,
  history,
});

assert(
  timeline.map((item) => item.type).join(",") ===
    "incoming,created,status,status",
  "Таймлайн должен содержать входящий, создание и два статуса"
);

assert(
  timeline[0].title === "Клиент написал",
  "Первое событие — клиент написал"
);

assert(
  timeline[1].title === "Создана заявка",
  "Второе событие — создана заявка"
);

assert(
  timeline[2].title.includes("В работе"),
  "10.09 — переход в работу"
);

assert(
  timeline[3].title.includes("Успешно открыта"),
  "20.09 — успешное открытие"
);

const oldApplication = {
  id: "old-1",
  status: "approved",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-28T12:00:00.000Z",
  in_progress_at: null,
  opened_at: "2026-08-20T09:00:00.000Z",
  approved_at: "2026-08-20T09:00:00.000Z",
  rejected_at: null,
};

const oldTimeline = buildApplicationTimeline({
  application: oldApplication,
  contact: { responded_at: null },
  history: [],
});

assert(
  oldTimeline.length === 2,
  "У старой заявки только известные события"
);

assert(
  oldTimeline.every((item) => item.at !== oldApplication.updated_at),
  "updated_at нельзя подставлять как дату этапа"
);

const sept02 = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-02",
  dateTo: "2026-09-02",
});

assert(sept02.created === 0, "02.09 не считает создание");
assert(sept02.opened === 0, "02.09 не считает открытие");
assert(sept02.inProgress === 0, "02.09 не считает переход в работу");

const sept05 = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-05",
  dateTo: "2026-09-05",
});

assert(sept05.created === 1, "05.09 считает созданную заявку");
assert(sept05.opened === 0, "05.09 не считает открытие");
assert(sept05.salaryAmount === 0, "05.09 не начисляет зарплату");

const sept10 = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-10",
  dateTo: "2026-09-10",
});

assert(sept10.inProgress === 1, "10.09 считает переход в работу");
assert(sept10.created === 0, "10.09 не считает создание");
assert(sept10.opened === 0, "10.09 не считает открытие");

const sept20 = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-20",
  dateTo: "2026-09-20",
});

assert(sept20.opened === 1, "20.09 считает успешное открытие");
assert(sept20.salaryAmount === 15000, "20.09 начисляет сумму в зарплату");
assert(sept20.created === 0, "20.09 не считает создание");

const fullMonth = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-30",
});

assert(fullMonth.created === 1, "Сентябрь считает создание");
assert(fullMonth.inProgress === 1, "Сентябрь считает переход в работу");
assert(fullMonth.opened === 1, "Сентябрь считает открытие");
assert(fullMonth.salaryAmount === 15000, "Сентябрь начисляет зарплату");

const lateMonth = countPeriodApplicationMetrics([application], {
  dateFrom: "2026-09-15",
  dateTo: "2026-09-30",
});

assert(
  lateMonth.created === 0,
  "15–30.09 не считает заявку созданной"
);
assert(
  lateMonth.opened === 1,
  "15–30.09 считает успешное открытие"
);
assert(
  lateMonth.salaryAmount === 15000,
  "15–30.09 включает сумму в зарплату"
);

const cancelled = {
  ...application,
  status: "rejected",
  rejected_at: "2026-09-22T12:00:00.000Z",
};

const cancelledPay = countPeriodApplicationMetrics([cancelled], {
  dateFrom: "2026-09-20",
  dateTo: "2026-09-20",
});

assert(
  cancelledPay.opened === 1,
  "Факт открытия 20.09 остаётся в истории метрик"
);
assert(
  cancelledPay.salaryAmount === 0,
  "После отмены успешного статуса зарплата не начисляется"
);

assert(
  isDateOnlyInRange(contact.responded_at, "2026-09-02", "2026-09-02"),
  "Входящий 02.09 попадает в отчёт за 02.09"
);

const otherProduct = {
  ...application,
  product_id: "prod-b",
  amount: 999,
};

const filtered = countPeriodApplicationMetrics(
  [application, otherProduct].filter(
    (item) => item.product_id !== "prod-b"
  ),
  {
    dateFrom: "2026-09-20",
    dateTo: "2026-09-20",
  }
);

assert(
  filtered.opened === 1 && filtered.salaryAmount === 15000,
  "Фильтр по продукту не должен тащить чужую сумму"
);

console.log("Сценарий 02/05/10/20.09 и фильтры периода прошли");
