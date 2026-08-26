import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Inbox,
  ListChecks,
  RefreshCw,
  Send,
  Users,
  XCircle,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { writersDashboardService } from "../services/writersDashboardService";
import { profileService } from "../services/profileService";
import PeriodFilter from "../components/filters/PeriodFilter";
import {
  formatDateInput,
  getPeriodBounds,
  WRITERS_PERIOD_PRESETS,
} from "../utils/periodRange";

import "../styles/Writers.css";

const APPLICATION_STATUS_LABELS = {
  new: "Новая",
  in_progress: "В работе",
  approved: "Успешно открыта",
  rejected: "Отказ",
};

export default function Writers() {
  const { profile, user } = useAuth();
  const currentProfile = profile || user;
  const isManager = currentProfile?.role === "manager";

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(
    writersDashboardService.emptyStats()
  );
  const [managers, setManagers] = useState([]);
  const [mailings, setMailings] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    writersDashboardService.pageSize
  );
  const [expandedIds, setExpandedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [managerFilter, setManagerFilter] =
    useState("all");
  const [mailingFilter, setMailingFilter] =
    useState("all");
  const [periodPreset, setPeriodPreset] =
    useState("week");
  const [customFrom, setCustomFrom] = useState(
    formatDateInput(new Date())
  );
  const [customTo, setCustomTo] = useState(
    formatDateInput(new Date())
  );

  const periodRange = useMemo(
    () =>
      getPeriodBounds(
        periodPreset,
        customFrom,
        customTo
      ),
    [periodPreset, customFrom, customTo]
  );

  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / pageSize) || 1
  );

  const loadDirectory = useCallback(async () => {
    if (isManager) {
      const mailingsResult =
        await writersDashboardService.getMailingOptions();
      setMailings(mailingsResult.data || []);
      return;
    }

    const [managersResult, mailingsResult] =
      await Promise.all([
        profileService.getManagers(),
        writersDashboardService.getMailingOptions(),
      ]);

    setManagers(
      (managersResult.data || []).filter(
        (manager) => manager.status !== "blocked"
      )
    );
    setMailings(mailingsResult.data || []);
  }, [isManager]);

  const loadDashboard = useCallback(
    async (showLoader = true) => {
      if (!currentProfile?.id) {
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError("");

      const managerIdForQuery = isManager
        ? currentProfile.id
        : managerFilter === "all"
          ? null
          : managerFilter;

      const [writersResult, statsResult] =
        await Promise.all([
          writersDashboardService.getWriters({
            managerId: managerIdForQuery,
            mailingId: mailingFilter,
            dateFrom: periodRange.from,
            dateTo: periodRange.to,
            page,
          }),
          writersDashboardService.getStats({
            managerId: managerIdForQuery,
            mailingId: mailingFilter,
            dateFrom: periodRange.from,
            dateTo: periodRange.to,
          }),
        ]);

      if (writersResult.error) {
        console.error(
          "Ошибка загрузки написавших:",
          writersResult.error
        );
        setError(
          writersResult.error.message ||
            "Не удалось загрузить написавших"
        );
        setRows([]);
        setTotalCount(0);
      } else {
        setRows(writersResult.data || []);
        setTotalCount(writersResult.count || 0);
        setPageSize(
          writersResult.pageSize ||
            writersDashboardService.pageSize
        );
      }

      if (statsResult.error) {
        console.error(
          "Ошибка сводки написавших:",
          statsResult.error
        );
      }

      setStats(
        statsResult.data ||
          writersDashboardService.emptyStats()
      );
      setLoading(false);
    },
    [
      currentProfile?.id,
      isManager,
      managerFilter,
      mailingFilter,
      page,
      periodRange.from,
      periodRange.to,
    ]
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    setExpandedIds([]);
  }, [page]);

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
      setExpandedIds([]);
    };
  }

  function toggleRow(contactId) {
    setExpandedIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
  }

  const selectedManagerName = managers.find(
    (manager) => manager.id === managerFilter
  )?.full_name;

  const selectedMailingName =
    mailingFilter === "external"
      ? "Вне рассылки"
      : mailings.find(
          (mailing) => mailing.id === mailingFilter
        )?.name;

  return (
    <main className="writers-page">
      <section className="writers-heading">
        <div>
          <span className="writers-heading__eyebrow">
            Воронка входящих
          </span>
          <h1>Все написавшие</h1>
          <p>
            Контакты, которые написали менеджерам,
            и их дальнейшие заявки. Период считается
            по фактической дате входящего, а не по
            дате внесения в CRM.
          </p>
        </div>

        <button
          className="writers-refresh"
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Обновить
        </button>
      </section>

      <p className="writers-period-label">
        Сводка {periodRange.label}
        {!isManager && managerFilter !== "all"
          ? ` · ${selectedManagerName || "менеджер"}`
          : ""}
        {mailingFilter !== "all"
          ? ` · ${selectedMailingName || "рассылка"}`
          : ""}
      </p>
      <p className="writers-period-hint">
        Написавшие фильтруются по дате входящего
        сообщения. Заявки, открытия и отказы в
        сводке считаются по этим же контактам,
        даже если заявка появилась позже.
      </p>

      <section className="writers-stats">
        <StatCard
          icon={Inbox}
          title="Всего написавших"
          value={stats.responded}
        />
        <StatCard
          icon={ListChecks}
          title="Создано заявок"
          value={stats.applications}
          variant="warning"
        />
        <StatCard
          icon={CheckCircle2}
          title="Успешно открыто"
          value={stats.opened}
          variant="success"
        />
        <StatCard
          icon={XCircle}
          title="Отказы"
          value={stats.rejected}
        />
        <StatCard
          icon={Users}
          title="Уникальных менеджеров"
          value={stats.managers}
          variant="blue"
        />
      </section>

      <section className="writers-toolbar">
        {!isManager && (
          <label className="writers-select">
            <Users size={16} />
            <span>Менеджер</span>
            <select
              value={managerFilter}
              onChange={(event) =>
                changeFilter(setManagerFilter)(
                  event.target.value
                )
              }
            >
              <option value="all">Все менеджеры</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.full_name || manager.email}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="writers-select">
          <Send size={16} />
          <span>Рассылка</span>
          <select
            value={mailingFilter}
            onChange={(event) =>
              changeFilter(setMailingFilter)(
                event.target.value
              )
            }
          >
            <option value="all">Все рассылки</option>
            <option value="external">Вне рассылки</option>
            {mailings.map((mailing) => (
              <option key={mailing.id} value={mailing.id}>
                {mailing.name || "Без названия"}
              </option>
            ))}
          </select>
        </label>

        <PeriodFilter
          preset={periodPreset}
          customFrom={customFrom}
          customTo={customTo}
          presets={WRITERS_PERIOD_PRESETS}
          onPresetChange={changeFilter(setPeriodPreset)}
          onCustomFromChange={changeFilter(setCustomFrom)}
          onCustomToChange={changeFilter(setCustomTo)}
        />
      </section>

      {error && (
        <div className="writers-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="writers-state">
          <div className="writers-state__spinner" />
          <p>Загружаем написавших...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="writers-state">
          <Inbox size={28} />
          <p>
            За выбранный период {periodRange.shortLabel}{" "}
            написавших нет.
          </p>
        </div>
      ) : (
        <>
          <section className="writers-table-card">
            <div className="writers-table-heading">
              <h2>Все написавшие</h2>
              <span>
                {totalCount}{" "}
                {pluralize(totalCount, [
                  "контакт",
                  "контакта",
                  "контактов",
                ])}
                {loading ? " · обновляем..." : ""}
              </span>
            </div>

            <div className="writers-table-wrap">
              <table className="writers-table">
                <thead>
                  <tr>
                    <th className="writers-table__expand" />
                    <th>Дата когда написал</th>
                    <th>Какая рассылка</th>
                    <th>Никнейм / номер</th>
                    <th>Менеджер</th>
                    <th>Дата заявки</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const expanded = expandedIds.includes(
                      row.id
                    );

                    return (
                      <WriterRow
                        key={row.id}
                        row={row}
                        expanded={expanded}
                        onToggle={() => toggleRow(row.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="writers-cards">
            {rows.map((row) => {
              const expanded = expandedIds.includes(row.id);

              return (
                <article
                  className="writers-card"
                  key={`${row.id}-card`}
                >
                  <button
                    type="button"
                    className="writers-card__top"
                    onClick={() => toggleRow(row.id)}
                  >
                    <div>
                      <strong>{row.identifier}</strong>
                      <span>{row.mailingName}</span>
                    </div>
                    <ChevronDown
                      size={18}
                      className={
                        expanded
                          ? "writers-chevron writers-chevron--open"
                          : "writers-chevron"
                      }
                    />
                  </button>

                  <dl className="writers-card__meta">
                    <div>
                      <dt>Написал</dt>
                      <dd>{formatDate(row.responded_at)}</dd>
                    </div>
                    <div>
                      <dt>Менеджер</dt>
                      <dd>{row.managerName}</dd>
                    </div>
                    <div>
                      <dt>Заявка</dt>
                      <dd>
                        {formatApplicationSummary(row)}
                      </dd>
                    </div>
                  </dl>

                  {expanded && (
                    <ApplicationDetails
                      row={row}
                      compact
                    />
                  )}
                </article>
              );
            })}
          </div>

          <div className="writers-pagination">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Назад
            </button>
            <span>
              Страница {page} из {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Вперёд
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function WriterRow({ row, expanded, onToggle }) {
  return (
    <>
      <tr
        className={
          expanded
            ? "writers-table__row writers-table__row--open"
            : "writers-table__row"
        }
        onClick={onToggle}
      >
        <td className="writers-table__expand">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? "Свернуть заявки"
                : "Показать заявки"
            }
          >
            <ChevronDown
              size={16}
              className={
                expanded
                  ? "writers-chevron writers-chevron--open"
                  : "writers-chevron"
              }
            />
          </button>
        </td>
        <td>{formatDate(row.responded_at)}</td>
        <td>
          <span
            className={
              row.isExternal
                ? "writers-mailing writers-mailing--external"
                : "writers-mailing"
            }
          >
            {row.mailingName}
          </span>
        </td>
        <td>
          <strong>{row.identifier}</strong>
        </td>
        <td>{row.managerName}</td>
        <td>{formatApplicationSummary(row)}</td>
      </tr>
      {expanded && (
        <tr className="writers-table__details">
          <td colSpan={6}>
            <ApplicationDetails row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function ApplicationDetails({ row, compact = false }) {
  if (!row.applicationsCount) {
    return (
      <div className="writers-empty-apps">
        Заявок по этому контакту пока нет.
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "writers-apps writers-apps--compact"
          : "writers-apps"
      }
    >
      <div className="writers-apps__intro">
        Написал {formatDate(row.responded_at)} ·{" "}
        {row.mailingName} · принял {row.managerName}
      </div>

      {row.applications.map((application) => (
        <article
          className="writers-app"
          key={application.id}
        >
          <div className="writers-app__head">
            <div>
              <strong>{application.productName}</strong>
              <span
                className={`writers-status writers-status--${application.status || "new"}`}
              >
                {APPLICATION_STATUS_LABELS[
                  application.status
                ] || application.status || "Без статуса"}
              </span>
            </div>
            <Link
              className="writers-app__link"
              to={`/applications/${application.id}`}
            >
              <FileText size={14} />
              Открыть заявку
            </Link>
          </div>

          <dl className="writers-app__grid">
            <div>
              <dt>Дата заявки</dt>
              <dd>{formatDateTime(application.created_at)}</dd>
            </div>
            <div>
              <dt>ID ПП</dt>
              <dd>{application.pp_id || "—"}</dd>
            </div>
            <div>
              <dt>Сумма / выплата</dt>
              <dd>{formatMoney(application.payout)}</dd>
            </div>
            <div>
              <dt>Дата открытия</dt>
              <dd>
                {application.openedAt
                  ? formatDateTime(application.openedAt)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Успешно открыта</dt>
              <dd>
                {application.status === "approved" ||
                application.openedAt
                  ? "Да"
                  : "Нет"}
              </dd>
            </div>
            <div>
              <dt>Отказ</dt>
              <dd>
                {application.status === "rejected" ||
                application.rejected_at
                  ? "Да"
                  : "Нет"}
              </dd>
            </div>
            <div className="writers-app__comment">
              <dt>Комментарий</dt>
              <dd>{application.comment || "—"}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function StatCard({ icon: Icon, title, value, variant = "" }) {
  return (
    <article
      className={[
        "writers-stat-card",
        variant ? `writers-stat-card--${variant}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="writers-stat-card__icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function formatApplicationSummary(row) {
  if (!row.applicationsCount) {
    return "Нет заявки";
  }

  const date = formatDateTime(row.firstApplicationAt);

  if (row.applicationsCount === 1) {
    return date;
  }

  return `${date} · ${row.applicationsCount} ${pluralize(
    row.applicationsCount,
    ["заявка", "заявки", "заявок"]
  )}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "Не указана";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function pluralize(count, forms) {
  const abs = Math.abs(Number(count) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }

  return forms[2];
}
