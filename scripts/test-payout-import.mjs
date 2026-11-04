import assert from "node:assert/strict";
import fs from "node:fs";

import {
  formatMonthLabel,
  getConversionAt,
  isConversionRecord,
  mapPartnerPaymentStatus,
  matchPayoutRows,
  monthKey,
  parsePayoutCsv,
} from "../src/utils/payoutImport.js";

const csv = [
  "Id клика;Id конверсии;Название продукта;Статус;Дата и время конверсии;Дата подтверждения;Sub1;Номер телефона клиента;ФИО;КВ агента;Id оффера",
  '1;c-1;"Альфа-Банк - РКО Активация VIP RU";Начислено;02.09.2026 12:00:00;30.09.2026 14:00:00;@Maria_test;;Иван;12900;1016',
  "2;c-2;Winline;В работе;05.10.2026 10:00:00;;pkaterinass;;;7200;2409",
  "3;c-3;Марафон Бет;Отменено;01.08.2026 09:00:00;01.09.2026 09:00:00;ghost;;;0.8;2484",
  '4;c-1;"Альфа-Банк - РКО Активация VIP RU";Начислено;02.09.2026 12:00:00;30.09.2026 14:00:00;@Maria_test;;Иван;12900;1016',
].join("\n");

const parsed = parsePayoutCsv(csv);

assert.equal(parsed.error, null);
assert.equal(parsed.format.key, "offer_stats");
assert.equal(parsed.rows.length, 3);
assert.equal(parsed.duplicates, 1);
assert.equal(parsed.rows[0].payment_status, "paid");
assert.equal(parsed.rows[1].payment_status, "unpaid");
assert.equal(parsed.rows[2].payment_status, "cancelled");
assert.equal(monthKey(parsed.rows[0].conversion_at), "2026-09");
assert.equal(monthKey(parsed.rows[0].confirmed_at), "2026-09");
assert.equal(monthKey(parsed.rows[1].conversion_at), "2026-10");
assert.equal(mapPartnerPaymentStatus("На проверке"), "unpaid");

const applications = [
  {
    id: "app-alfa",
    telegram: "@maria_test",
    phone: "",
    product: "Альфа РКО",
    created_at: "2026-09-02T09:00:00.000Z",
    opened_at: "2026-09-03T09:00:00.000Z",
    status: "approved",
  },
  {
    id: "app-win",
    telegram: "pkaterinass",
    phone: "",
    product: "Другой продукт",
    created_at: "2026-01-01T09:00:00.000Z",
    status: "in_progress",
  },
  {
    id: "app-same-a",
    telegram: "twinuser",
    product: "Альфа РКО",
    created_at: "2026-09-02T09:00:00.000Z",
    status: "approved",
    opened_at: "2026-09-02T09:00:00.000Z",
  },
  {
    id: "app-same-b",
    telegram: "twinuser",
    product: "Альфа РКО",
    created_at: "2026-09-02T09:00:00.000Z",
    status: "approved",
    opened_at: "2026-09-02T09:00:00.000Z",
  },
];

const twinCsv = parsePayoutCsv(
  [
    "Id конверсии;Название продукта;Статус;Дата и время конверсии;Дата подтверждения;Sub1;КВ агента",
    "t-1;Альфа РКО;Начислено;02.09.2026 12:00:00;30.09.2026 14:00:00;twinuser;1000",
  ].join("\n")
);

const matches = matchPayoutRows(parsed.rows, applications);
const byId = new Map(
  matches.map((row) => [
    row.external_conversion_id,
    row,
  ])
);

assert.equal(byId.get("c-1").match_status, "matched");
assert.equal(byId.get("c-1").application_id, "app-alfa");
assert.equal(byId.get("c-2").match_status, "unmatched");
assert.match(byId.get("c-2").match_note, /продукт/i);
assert.equal(byId.get("c-3").match_status, "unmatched");

const twins = matchPayoutRows(
  twinCsv.rows,
  applications
);

assert.equal(twins[0].match_status, "ambiguous");
assert.equal(twins[0].application_id, null);

const kept = matchPayoutRows(twinCsv.rows, applications, [
  {
    external_conversion_id: "t-1",
    application_id: "app-same-b",
  },
]);

assert.equal(kept[0].match_status, "matched");
assert.equal(kept[0].application_id, "app-same-b");

const collision = matchPayoutRows(
  [
    {
      external_conversion_id: "a",
      offer_name: "Альфа РКО",
      sub1: "maria_test",
      payment_status: "paid",
      conversion_at: "2026-09-02T12:00:00.000Z",
    },
    {
      external_conversion_id: "b",
      offer_name: "Альфа РКО",
      sub1: "maria_test",
      payment_status: "paid",
      conversion_at: "2026-09-02T12:00:00.000Z",
    },
  ],
  applications
);

assert.equal(
  collision.filter((row) => row.match_status === "matched")
    .length,
  0
);

const approvedOnly = {
  status: "approved",
  opened_at: "2026-09-10T00:00:00.000Z",
};

assert.equal(isConversionRecord(approvedOnly), true);
assert.equal(
  monthKey(getConversionAt(approvedOnly)),
  "2026-09"
);
assert.equal(
  monthKey("2026-10-01"),
  "2026-10"
);
assert.match(formatMonthLabel("2026-09-01"), /сентябр/i);

const samplePath =
  "c:/Users/milov/Downloads/Telegram Desktop/Статистика офферов.csv";

if (fs.existsSync(samplePath)) {
  const sample = parsePayoutCsv(
    fs.readFileSync(samplePath)
  );
  const months = new Set(
    sample.rows
      .map((row) => monthKey(row.conversion_at))
      .filter(Boolean)
  );

  assert.equal(sample.error, null);
  assert.ok(sample.rows.length > 1000);
  assert.ok(
    sample.rows.some((row) => row.payment_status === "paid")
  );
  assert.ok(months.has("2026-09"));
  assert.ok(months.has("2026-10"));
  console.log(
    `sample: ${sample.rows.length} rows, paid ${
      sample.rows.filter((row) => row.payment_status === "paid")
        .length
    }, months ${[...months].sort().join(", ")}`
  );
}

console.log("payout import ok");
