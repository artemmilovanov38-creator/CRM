import assert from "node:assert/strict";

import { buildSalaryData } from "../src/utils/salaryCalculation.js";
import {
  contactOwnedByOther,
  duplicateDecision,
  resolveApplicationManagerId,
} from "../src/utils/sharedContact.js";
import {
  formatTelegramDisplay,
  telegramKey,
} from "../src/utils/telegram.js";

const sample = "qqwweeeeeeeee";
const keys = [
  telegramKey(`@${sample}`),
  telegramKey(sample),
  telegramKey(sample.toUpperCase()),
  telegramKey(`https://t.me/${sample}`),
];

assert.equal(new Set(keys).size, 1);
assert.equal(keys[0], "qqwweeeeeeeee");
assert.equal(
  formatTelegramDisplay(sample.toUpperCase()),
  `@${sample.toUpperCase()}`
);

assert.equal(
  resolveApplicationManagerId({
    currentUserId: "lisa",
    requestedManagerId: "anna",
    privileged: false,
  }),
  "lisa"
);

assert.equal(
  contactOwnedByOther({
    contact: {
      manager_id: "anna",
      owned_by_me: false,
    },
    currentUserId: "lisa",
  }),
  true
);

assert.equal(
  contactOwnedByOther({
    contact: { manager_id: "lisa" },
    currentUserId: "lisa",
  }),
  false
);

const blocked = duplicateDecision({
  matches: [{ product_name: "Альфа" }],
  confirmDuplicate: false,
});
assert.equal(blocked.needsConfirmation, true);
assert.equal(blocked.allow, false);

const allowed = duplicateDecision({
  matches: [{ product_name: "Альфа" }],
  confirmDuplicate: true,
});
assert.equal(allowed.allow, true);

const salary = buildSalaryData({
  managers: [
    { id: "anna", full_name: "Анна" },
    { id: "lisa", full_name: "Лиза" },
  ],
  products: [
    { id: "alfa", name: "Альфа", opening_price: 1200 },
    { id: "kvit", name: "Квитанция", opening_price: 500 },
  ],
  applications: [
    {
      id: "app-anna",
      assigned_manager_id: "anna",
      product_id: "alfa",
      mailing_contact_id: "same-person",
      telegram: "@username",
      amount: 1200,
      opening_price_snapshot: 1200,
    },
    {
      id: "app-lisa",
      assigned_manager_id: "lisa",
      product_id: "kvit",
      mailing_contact_id: "same-person",
      telegram: "@username",
      amount: 500,
      opening_price_snapshot: 500,
    },
  ],
});

const anna = salary.rows.find((row) => row.id === "anna");
const lisa = salary.rows.find((row) => row.id === "lisa");

assert.equal(anna.totalOpenings, 1);
assert.equal(anna.salary, 1200);
assert.equal(lisa.totalOpenings, 1);
assert.equal(lisa.salary, 500);
assert.equal(anna.salary + lisa.salary, 1700);

console.log("shared contact rules: ok");
