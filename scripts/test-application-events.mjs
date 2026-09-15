import {
  applicationIsSuccessfulOpeningInPeriod,
  applicationMatchesStatus,
  applicationMatchesStatusAndPeriod,
  buildApplicationTimeline,
  buildStatusFilterOptions,
  buildVisibleStatusColumns,
  countPeriodApplicationMetrics,
  getApplicationPayout,
  isDateOnlyInRange,
  isTimestampInRange,
} from "../src/utils/applicationEvents.js";
import { dateOnlyToExclusiveIsoRange } from "../src/utils/periodRange.js";
import { buildSalaryData } from "../src/utils/salaryCalculation.js";
import {
  buildApplicationBoard,
  getSuccessfulApplications,
} from "../src/utils/applicationStats.js";

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

const ownApplications = [
  { status: "new", product_id: "alpha" },
  { status: "in_progress", product_id: "alpha" },
  { status: "approved", product_id: "receipt" },
  { status: "rejected", product_id: "alpha" },
  { status: "waiting", product_id: "alpha" },
];

assert(
  ownApplications.filter((item) =>
    applicationMatchesStatus(item, "all")
  ).length === 5,
  "Все статусы возвращают все заявки менеджера"
);

assert(
  ownApplications.filter((item) =>
    applicationMatchesStatus(item, "in_progress")
  ).length === 1,
  "Фильтр «В работе» оставляет только заявки в работе"
);

assert(
  ownApplications.filter((item) =>
    applicationMatchesStatus(item, "approved")
  ).length === 1,
  "Фильтр «Успешно открыты» оставляет только успешные"
);

assert(
  ownApplications.filter((item) =>
    applicationMatchesStatus(item, "rejected")
  ).length === 1,
  "Фильтр «Отказы» оставляет только отказы"
);

assert(
  ownApplications.filter((item) =>
    applicationMatchesStatus(item, "new")
  ).length === 2,
  "waiting считается новым статусом, отдельные статусы не выдумываются"
);

const filterLabels = buildStatusFilterOptions(
  ownApplications
).map((item) => item.label);

assert(
  filterLabels.includes("Все статусы") &&
    filterLabels.includes("Новые") &&
    filterLabels.includes("В работе") &&
    filterLabels.includes("Успешно открыты") &&
    filterLabels.includes("Отказы"),
  "Фильтр менеджера содержит реальные статусы системы"
);

assert(
  buildVisibleStatusColumns(ownApplications, "approved")
    .map((item) => item.value)
    .join(",") === "approved",
  "При выбранном статусе канбан/мобильный список показывают только его"
);

console.log("Сценарий 02/05/10/20.09 и фильтры периода прошли");

const augustBounds = dateOnlyToExclusiveIsoRange(
  "2026-08-16",
  "2026-08-31"
);

const morningLocal = new Date(
  2026,
  7,
  16,
  0,
  30,
  0
).toISOString();

const lateLocal = new Date(
  2026,
  7,
  31,
  23,
  50,
  0
).toISOString();

const beforePeriod = new Date(
  2026,
  7,
  15,
  23,
  50,
  0
).toISOString();

const afterPeriod = new Date(
  2026,
  8,
  1,
  0,
  10,
  0
).toISOString();

assert(
  isTimestampInRange(
    morningLocal,
    augustBounds.from,
    augustBounds.to
  ),
  "16.08 00:30 попадает в период 16–31.08"
);

assert(
  isTimestampInRange(
    lateLocal,
    augustBounds.from,
    augustBounds.to
  ),
  "31.08 23:50 попадает в период 16–31.08"
);

assert(
  !isTimestampInRange(
    beforePeriod,
    augustBounds.from,
    augustBounds.to
  ),
  "15.08 23:50 не попадает в период 16–31.08"
);

assert(
  !isTimestampInRange(
    afterPeriod,
    augustBounds.from,
    augustBounds.to
  ),
  "01.09 00:10 не попадает в период 16–31.08"
);

const anutkaApps = [
  {
    id: "a1",
    status: "approved",
    product_id: "alpha",
    product: "Альфа",
    assigned_manager_id: "anutka",
    opened_at: morningLocal,
    amount: 1200,
  },
  {
    id: "a2",
    status: "approved",
    product_id: "alpha",
    product: "Альфа",
    assigned_manager_id: "anutka",
    created_at: "2026-08-10T10:00:00.000Z",
    opened_at: new Date(2026, 7, 20, 12, 0, 0).toISOString(),
    amount: 1200,
  },
  {
    id: "a3",
    status: "approved",
    product_id: "alpha",
    product: "Альфа",
    assigned_manager_id: "anutka",
    opened_at: null,
    approved_at: new Date(2026, 7, 22, 11, 0, 0).toISOString(),
    amount: 1200,
  },
  {
    id: "a4",
    status: "approved",
    product_id: "alpha",
    product: "Альфа",
    assigned_manager_id: "anutka",
    opened_at: new Date(2026, 7, 25, 15, 0, 0).toISOString(),
    amount: 1200,
  },
  {
    id: "a5",
    status: "approved",
    product_id: "alpha",
    product: "Альфа",
    assigned_manager_id: "anutka",
    opened_at: lateLocal,
    amount: 1200,
  },
];

const appsInPeriod = anutkaApps.filter((item) =>
  applicationIsSuccessfulOpeningInPeriod(
    item,
    augustBounds.from,
    augustBounds.to
  )
);

assert(
  !applicationIsSuccessfulOpeningInPeriod(
    {
      status: "approved",
      created_at: "2026-08-18T07:05:32.912Z",
      opened_at: "2026-09-02T05:16:21.361Z",
      approved_at: "2026-09-02T05:16:21.361Z",
    },
    augustBounds.from,
    augustBounds.to
  ),
  "Создана 18.08 и открыта 02.09 не входит в успешные 16–31.08"
);

assert(
  applicationMatchesStatusAndPeriod(
    {
      status: "approved",
      created_at: "2026-08-18T07:05:32.912Z",
      opened_at: "2026-09-02T05:16:21.361Z",
    },
    "approved",
    augustBounds.from,
    augustBounds.to
  ) === false,
  "Фильтр «Успешно открыты» за 16–31.08 не показывает открытие 02.09"
);

assert(
  applicationMatchesStatusAndPeriod(
    {
      status: "approved",
      created_at: "2026-08-18T07:05:32.912Z",
      opened_at: "2026-09-02T05:16:21.361Z",
    },
    "all",
    augustBounds.from,
    augustBounds.to
  ) === false,
  "При «Все статусы» Kanban не кладёт августовскую заявку, открытую 02.09, в успешные"
);

const lisaBoardApps = [
  {
    id: "later-open",
    status: "approved",
    created_at: "2026-08-19T12:57:53.453Z",
    opened_at: "2026-09-01T13:59:31.524Z",
    amount: 1200,
    product: "Альфа",
    assigned_manager_id: "lisa",
  },
  {
    id: "in-period",
    status: "approved",
    created_at: "2026-08-17T10:00:00.000Z",
    opened_at: new Date(2026, 7, 20, 12, 0, 0).toISOString(),
    amount: 1500,
    product: "Квитанция",
    assigned_manager_id: "lisa",
  },
];

const lisaBoard = buildApplicationBoard({
  applications: lisaBoardApps,
  managers: [{ id: "lisa", full_name: "Лиза" }],
  rangeFrom: augustBounds.from,
  rangeTo: augustBounds.to,
});

assert(
  lisaBoard.successful.map((item) => item.id).join(",") === "in-period",
  "Карточка успешных и зарплата берут только открытие внутри периода"
);

assert(
  lisaBoard.visible.filter((item) => item.status === "approved").length === 1,
  "Колонка Kanban «Успешно открыта» совпадает с карточкой"
);

assert(
  lisaBoard.stats.approved === 1 && lisaBoard.stats.totalAmount === 1500,
  "Сумма успешных считается из того же набора"
);

assert(
  lisaBoard.products.find((item) => item.name === "Квитанция")?.opened === 1,
  "Статистика по продуктам считает успешную квитанцию"
);

assert(
  (lisaBoard.products.find((item) => item.name === "Альфа")?.opened || 0) === 0,
  "Альфа, открытая 01.09, не входит в успешные августа"
);

assert(
  getSuccessfulApplications(lisaBoardApps, augustBounds.from, augustBounds.to)
    .map((item) => item.id)
    .join(",") === "in-period",
  "getSuccessfulApplications — тот же набор, что зарплата"
);

const oldUtcStart = Date.parse("2026-08-16T00:00:00Z");
const oldSqlCount = appsInPeriod.filter(
  (item) =>
    item.opened_at &&
    Date.parse(item.opened_at) >= oldUtcStart
).length;

assert(
  oldSqlCount < appsInPeriod.length,
  "Старый зарплатный SQL без timezone и без approved_at терял часть заявок"
);

const unknownProductApp = {
  id: "a6",
  status: "approved",
  product_id: "deleted-alpha",
  product: "Альфа",
  assigned_manager_id: "anutka",
  opened_at: new Date(2026, 7, 21, 10, 0, 0).toISOString(),
  amount: 1200,
};

const salary = buildSalaryData({
  managers: [
    {
      id: "anutka",
      full_name: "Анютка",
      email: "anutka@test.local",
    },
  ],
  products: [
    {
      id: "alpha",
      name: "Альфа",
      opening_price: 9999,
    },
  ],
  applications: [...appsInPeriod, unknownProductApp],
});

const anutka = salary.rows[0];

assert(
  anutka.products.alpha.openings === 5,
  "Зарплата считает 5 открытий Альфа по product_id"
);

assert(
  anutka.products.alpha.salary === 6000,
  "Зарплата берёт 1200 ₽ из заявки, а не текущие 9999 ₽ каталога"
);

assert(
  anutka.products["deleted-alpha"]?.openings === 1,
  "Заявка с неизвестным product_id не теряется молча"
);

assert(
  anutka.totalOpenings === 6,
  "Все успешные открытия менеджера входят в итог"
);

assert(
  getApplicationPayout({
    amount: 1200,
    opening_price_snapshot: 800,
    product_data: { opening_price: 9999 },
  }) === 1200,
  "Сумма заявки важнее снимка и текущей цены"
);

const namedOnlyApp = {
  id: "a7",
  status: "approved",
  product_id: null,
  product: "Альфа",
  assigned_manager_id: "anutka",
  opened_at: new Date(2026, 7, 23, 12, 0, 0).toISOString(),
  amount: 1200,
};

const salaryWithNamed = buildSalaryData({
  managers: [
    {
      id: "anutka",
      full_name: "Анютка",
      email: "anutka@test.local",
    },
  ],
  products: [
    {
      id: "alpha",
      name: "Альфа",
      opening_price: 9999,
    },
  ],
  applications: [...appsInPeriod, namedOnlyApp],
});

assert(
  salaryWithNamed.rows[0].products.alpha.openings === 6,
  "Заявка без product_id, но с именем Альфа входит в зарплату Альфа"
);

console.log(
  "Сверка заявок и зарплаты 16–31.08, границы дней и сумма 5×1200 прошли"
);
