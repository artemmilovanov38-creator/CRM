import {
  CircleDollarSign,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import "../styles/Payouts.css";
import { applicationService } from "../services/applicationService";
import { payoutService } from "../services/payoutService";
import { formatServiceError } from "../utils/serviceError";
import {
  formatMonthLabel,
  formatPayoutDate,
  formatPayoutMoney,
  getConversionAt,
  getMatchLabel,
  getPaymentLabel,
  isConversionRecord,
  monthKey,
  parsePayoutCsv,
  parsePayoutMatrix,
} from "../utils/payoutImport";

const PARTNER_STORAGE_KEY = "crm-stats-payout-partner";
const TABS = [
  { id: "paid", label: "Оплаченные" },
  { id: "conversions", label: "ЦД по месяцам" },
  { id: "open", label: "Не склеилось" },
  { id: "imports", label: "Загрузки" },
];

export default function Payouts() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [imports, setImports] = useState([]);
  const [openRows, setOpenRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [partnerName, setPartnerName] = useState(
    () => localStorage.getItem(PARTNER_STORAGE_KEY) || ""
  );
  const [payoutMonth, setPayoutMonth] = useState("");
  const [parsedFile, setParsedFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState("paid");
  const [paidMonth, setPaidMonth] = useState("all");
  const [conversionMonth, setConversionMonth] = useState(
    currentMonthKey()
  );
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState("all");

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const [applicationResult, importResult, openResult] =
      await Promise.all([
        applicationService.getApplications(),
        payoutService.listImports(),
        payoutService.listOpenRows(),
      ]);

    if (applicationResult.error) {
      setError(formatServiceError(applicationResult.error));
    } else {
      setApplications(applicationResult.data || []);
    }

    if (importResult.error) {
      setError(formatServiceError(importResult.error));
      setImports([]);
    } else {
      setImports(importResult.data || []);
    }

    if (openResult.error) {
      setError(formatServiceError(openResult.error));
      setOpenRows([]);
    } else {
      setOpenRows(openResult.data || []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const paidApplications = useMemo(
    () =>
      applications.filter(
        (application) =>
          application.payment_status === "paid"
      ),
    [applications]
  );

  const conversions = useMemo(
    () => applications.filter(isConversionRecord),
    [applications]
  );

  const paidMonthOptions = useMemo(
    () =>
      uniqueMonths(
        paidApplications.map(
          (application) => application.payout_month
        )
      ),
    [paidApplications]
  );

  const conversionMonthOptions = useMemo(
    () =>
      uniqueMonths(
        conversions.map((application) =>
          getConversionAt(application)
        )
      ),
    [conversions]
  );

  const visiblePaid = useMemo(() => {
    return paidApplications
      .filter((application) =>
        paidMonth === "all"
          ? true
          : monthKey(application.payout_month) === paidMonth
      )
      .filter((application) =>
        matchesQuery(application, search)
      )
      .sort(byConversionDate);
  }, [paidApplications, paidMonth, search]);

  const visibleConversions = useMemo(() => {
    return conversions
      .filter((application) =>
        conversionMonth === "all"
          ? true
          : monthKey(getConversionAt(application)) ===
            conversionMonth
      )
      .filter((application) =>
        matchesQuery(application, search)
      )
      .sort(byConversionDate);
  }, [conversions, conversionMonth, search]);

  const visibleOpenRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return openRows.filter((row) => {
      if (
        openFilter !== "all" &&
        row.match_status !== openFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        row.sub1,
        row.client_name,
        row.offer_name,
        row.external_conversion_id,
        row.partner_name,
        row.match_note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [openRows, openFilter, search]);

  const conversionSummary = useMemo(() => {
    const paid = visibleConversions.filter(
      (application) => application.payment_status === "paid"
    );

    return {
      total: visibleConversions.length,
      paid: paid.length,
      unpaid: visibleConversions.length - paid.length,
      amount: paid.reduce(
        (sum, application) =>
          sum + Number(application.payment_amount || 0),
        0
      ),
    };
  }, [visibleConversions]);

  const paidAmount = visiblePaid.reduce(
    (sum, application) =>
      sum + Number(application.payment_amount || 0),
    0
  );

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setSuccessMessage("");
    setParsedFile(null);
    setFileName("");

    if (!file) {
      return;
    }

    try {
      const parsed = await readPayoutFile(file);

      if (parsed.error) {
        setError(parsed.error);
        return;
      }

      setError("");
      setFileName(file.name);
      setParsedFile(parsed);
    } catch (fileError) {
      setError(
        fileError?.message || "Не удалось прочитать файл"
      );
    }
  }

  async function handleImport() {
    const partner = partnerName.trim().replace(/\s+/g, " ");

    if (!partner) {
      setError("Укажите название партнёрки");
      return;
    }

    if (!parsedFile?.rows?.length) {
      setError("Сначала выберите файл выгрузки");
      return;
    }

    setIsImporting(true);
    setError("");
    setSuccessMessage("");
    localStorage.setItem(PARTNER_STORAGE_KEY, partner);

    const { data, error: importError } =
      await payoutService.importPayout({
        partnerName: partner,
        payoutMonth: payoutMonth
          ? `${payoutMonth}-01`
          : null,
        fileName,
        formatKey: parsedFile.format.key,
        rows: parsedFile.rows,
      });

    setIsImporting(false);

    if (importError) {
      setError(formatServiceError(importError));
      return;
    }

    const skipped = parsedFile.skipped
      ? `, без id конверсии ${parsedFile.skipped}`
      : "";
    const duplicates = parsedFile.duplicates
      ? `, повторов в файле ${parsedFile.duplicates}`
      : "";

    setSuccessMessage(
      `Склеено ${data?.matched || 0}, не склеилось ${
        data?.unmatched || 0
      }, несколько заявок ${data?.ambiguous || 0}. Начислено в файле ${
        data?.paid || 0
      }, обновлено заявок ${data?.applications_updated || 0}${skipped}${duplicates}.`
    );
    setParsedFile(null);
    setFileName("");
    setTab(data?.unmatched || data?.ambiguous ? "open" : "paid");
    await loadPage();
  }

  return (
    <main className="payouts-page">
      <header className="payouts-header">
        <div>
          <span className="payouts-header__eyebrow">
            Выплаты
          </span>
          <h1>Оплаты</h1>
          <p>
            Файл каждой выплаты загружается вручную.
            Месяц ЦД берётся из даты конверсии, месяц
            выплаты — из даты подтверждения. Октябрьское
            ЦД внутри сентябрьской выплаты остаётся
            октябрьским.
          </p>
        </div>

        <button
          className="payouts-refresh"
          type="button"
          onClick={loadPage}
          disabled={isLoading || isImporting}
        >
          <RefreshCw size={16} />
          Обновить
        </button>
      </header>

      <section className="payouts-upload">
        <div className="payouts-upload__title">
          <Upload size={18} />
          <div>
            <h2>Загрузить выплату</h2>
            <p>
              То же название партнёрки обновляет уже
              загруженные конверсии и не создаёт дубли.
            </p>
          </div>
        </div>

        <div className="payouts-upload__fields">
          <label>
            <span>Партнёрка</span>
            <input
              value={partnerName}
              onChange={(event) =>
                setPartnerName(event.target.value)
              }
              placeholder="Название ПП"
            />
          </label>

          <label>
            <span>Месяц, если в файле нет даты</span>
            <input
              type="month"
              value={payoutMonth}
              onChange={(event) =>
                setPayoutMonth(event.target.value)
              }
            />
          </label>

          <label className="payouts-upload__file">
            <span>Файл конверсий</span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleFile}
            />
          </label>
        </div>

        {parsedFile && (
          <div className="payouts-upload__preview">
            <strong>{fileName}</strong>
            <span>
              {parsedFile.format.label}: {parsedFile.rows.length}{" "}
              строк, начислено{" "}
              {
                parsedFile.rows.filter(
                  (row) => row.payment_status === "paid"
                ).length
              }
            </span>
            <button
              type="button"
              onClick={() => {
                setParsedFile(null);
                setFileName("");
              }}
              aria-label="Убрать файл"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <button
          className="payouts-submit"
          type="button"
          onClick={handleImport}
          disabled={isImporting || !parsedFile}
        >
          <CircleDollarSign size={16} />
          {isImporting
            ? "Распределяем..."
            : "Распределить по заявкам"}
        </button>
      </section>

      {error && (
        <div className="payouts-alert payouts-alert--error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="payouts-alert payouts-alert--success">
          {successMessage}
        </div>
      )}

      <section className="payouts-panel">
        <div className="payouts-toolbar">
          <div className="payouts-tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  tab === item.id ? "is-active" : ""
                }
                onClick={() => setTab(item.id)}
              >
                {item.label}
                <small>
                  {item.id === "paid"
                    ? paidApplications.length
                    : item.id === "conversions"
                      ? conversions.length
                      : item.id === "open"
                        ? openRows.length
                        : imports.length}
                </small>
              </button>
            ))}
          </div>

          <div className="payouts-toolbar__filters">
            {tab === "paid" && (
              <select
                value={paidMonth}
                aria-label="Месяц выплаты"
                onChange={(event) =>
                  setPaidMonth(event.target.value)
                }
              >
                <option value="all">Все месяцы выплат</option>
                {paidMonthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            )}

            {tab === "conversions" && (
              <select
                value={conversionMonth}
                aria-label="Месяц ЦД"
                onChange={(event) =>
                  setConversionMonth(event.target.value)
                }
              >
                <option value="all">Все месяцы ЦД</option>
                {conversionMonthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            )}

            {tab === "open" && (
              <select
                value={openFilter}
                aria-label="Почему не склеилось"
                onChange={(event) =>
                  setOpenFilter(event.target.value)
                }
              >
                <option value="all">Все несклеенные</option>
                <option value="unmatched">Нет заявки</option>
                <option value="ambiguous">
                  Несколько заявок
                </option>
              </select>
            )}

            {tab !== "imports" && (
              <div className="payouts-search">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Имя, Telegram, продукт"
                />
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="payouts-empty">Загружаем оплаты</div>
        ) : tab === "paid" ? (
          <>
            <p className="payouts-summary">
              {visiblePaid.length} оплаченных ·{" "}
              {formatPayoutMoney(paidAmount)} · дата в таблице
              — когда сделано ЦД
            </p>
            <PaidTable
              rows={visiblePaid}
              onOpen={(id) =>
                navigate(`/applications/${id}`)
              }
            />
          </>
        ) : tab === "conversions" ? (
          <>
            <p className="payouts-summary">
              ЦД {conversionSummary.total} · оплачено{" "}
              {conversionSummary.paid} · без оплаты{" "}
              {conversionSummary.unpaid} ·{" "}
              {formatPayoutMoney(conversionSummary.amount)}
            </p>
            <ConversionTable
              rows={visibleConversions}
              onOpen={(id) =>
                navigate(`/applications/${id}`)
              }
            />
          </>
        ) : tab === "open" ? (
          <OpenTable rows={visibleOpenRows} />
        ) : (
          <ImportsTable rows={imports} />
        )}
      </section>
    </main>
  );
}

function PaidTable({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <div className="payouts-empty">
        Оплаченных заявок за этот месяц нет
      </div>
    );
  }

  return (
    <div className="payouts-table-wrap">
      <table className="payouts-table payouts-table--clickable">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Продукт</th>
            <th>Дата ЦД</th>
            <th>Месяц ЦД</th>
            <th>Оплачено</th>
            <th>Месяц выплаты</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((application) => (
            <tr
              key={application.id}
              onClick={() => onOpen(application.id)}
            >
              <td>
                <strong>
                  {application.telegram ||
                    application.full_name ||
                    "Без имени"}
                </strong>
                <span>{application.partner_name || "—"}</span>
              </td>
              <td>
                {application.product_data?.name ||
                  application.product ||
                  application.partner_offer_name ||
                  "—"}
              </td>
              <td>
                {formatPayoutDate(
                  getConversionAt(application)
                )}
              </td>
              <td>
                {formatMonthLabel(
                  getConversionAt(application)
                )}
              </td>
              <td>{formatPayoutDate(application.paid_at)}</td>
              <td>
                {formatMonthLabel(application.payout_month)}
              </td>
              <td>
                {formatPayoutMoney(
                  application.payment_amount
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionTable({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <div className="payouts-empty">
        За этот месяц ЦД нет
      </div>
    );
  }

  return (
    <div className="payouts-table-wrap">
      <table className="payouts-table payouts-table--clickable">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Продукт</th>
            <th>Дата ЦД</th>
            <th>Оплата</th>
            <th>Месяц выплаты</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((application) => (
            <tr
              key={application.id}
              onClick={() => onOpen(application.id)}
            >
              <td>
                <strong>
                  {application.telegram ||
                    application.full_name ||
                    "Без имени"}
                </strong>
                <span>
                  {application.partner_status ||
                    "Нет в выгрузке"}
                </span>
              </td>
              <td>
                {application.product_data?.name ||
                  application.product ||
                  "—"}
              </td>
              <td>
                {formatPayoutDate(
                  getConversionAt(application)
                )}
              </td>
              <td>
                <PaymentBadge
                  status={application.payment_status}
                />
              </td>
              <td>
                {formatMonthLabel(application.payout_month)}
              </td>
              <td>
                {formatPayoutMoney(
                  application.payment_amount
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="payouts-empty">
        Все строки из выгрузок склеились с заявками
      </div>
    );
  }

  return (
    <div className="payouts-table-wrap">
      <table className="payouts-table">
        <thead>
          <tr>
            <th>Конверсия</th>
            <th>Sub1</th>
            <th>Оффер</th>
            <th>Дата ЦД</th>
            <th>Статус ПП</th>
            <th>Почему</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.external_conversion_id}</strong>
                <span>{row.partner_name}</span>
              </td>
              <td>{row.sub1 || row.phone || "—"}</td>
              <td>{row.offer_name || "—"}</td>
              <td>{formatPayoutDate(row.conversion_at)}</td>
              <td>
                <PaymentBadge status={row.payment_status} />
              </td>
              <td>
                {getMatchLabel(row.match_status)}
                {row.match_note ? `. ${row.match_note}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportsTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="payouts-empty">
        Выплаты ещё не загружались
      </div>
    );
  }

  return (
    <div className="payouts-table-wrap">
      <table className="payouts-table">
        <thead>
          <tr>
            <th>Когда</th>
            <th>Партнёрка</th>
            <th>Файл</th>
            <th>Строк</th>
            <th>Склеено</th>
            <th>Не склеилось</th>
            <th>Начислено</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatPayoutDate(row.created_at)}</td>
              <td>{row.partner_name}</td>
              <td>{row.file_name || "—"}</td>
              <td>{row.row_count}</td>
              <td>{row.matched_count}</td>
              <td>
                {row.unmatched_count + row.ambiguous_count}
              </td>
              <td>{row.paid_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentBadge({ status }) {
  return (
    <span
      className={`payment-badge payment-badge--${
        status || "unknown"
      }`}
    >
      {getPaymentLabel(status)}
    </span>
  );
}

function currentMonthKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
}

function uniqueMonths(values) {
  return [
    ...new Set(values.map((value) => monthKey(value)).filter(Boolean)),
  ].sort((left, right) => right.localeCompare(left));
}

function matchesQuery(application, search) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    application.full_name,
    application.telegram,
    application.phone,
    application.product,
    application.product_data?.name,
    application.partner_offer_name,
    application.partner_name,
    application.pp_id,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function byConversionDate(left, right) {
  const leftTime = new Date(
    getConversionAt(left) || 0
  ).getTime();
  const rightTime = new Date(
    getConversionAt(right) || 0
  ).getTime();

  return rightTime - leftTime;
}

async function readPayoutFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv" || extension === "txt") {
    return parsePayoutCsv(await decodeText(file));
  }

  if (extension === "xlsx" || extension === "xls") {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    return parsePayoutMatrix(matrix);
  }

  throw new Error("Нужен файл CSV, XLS или XLSX");
}

async function decodeText(file) {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer
    );
  } catch {
    return new TextDecoder("windows-1251").decode(buffer);
  }
}
