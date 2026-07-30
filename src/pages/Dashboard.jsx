import {
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  RefreshCw,
  TrendingUp,
  
  Users,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import "../styles/Dashboard.css";

import { applicationService } from "../services/applicationService";
import { profileService } from "../services/profileService";

const statusConfig = {
  in_progress: {
    label: "В работе",
    className: "in-progress",
  },

  approved: {
    label: "Успешные",
    className: "approved",
  },

  rejected: {
    label: "Отказы",
    className: "rejected",
  },
};

export default function Dashboard() {
  const navigate = useNavigate();

  const [applications, setApplications] =
    useState([]);

  const [managers, setManagers] = useState([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setIsLoading(true);
    setError("");

    const [
      applicationsResult,
      managersResult,
    ] = await Promise.all([
      applicationService.getApplications(),
      profileService.getManagers(),
    ]);

    if (applicationsResult.error) {
      console.error(
        "Ошибка загрузки заявок:",
        applicationsResult.error
      );

      setError(
        "Не удалось загрузить данные Dashboard"
      );
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );
    }

    setApplications(
  (applicationsResult.data || []).map(
    (application) => ({
      ...application,
      status:
        application.status === "new" ||
        application.status === "waiting"
          ? "in_progress"
          : application.status,
    })
  )
);

    setManagers(managersResult.data || []);

    setIsLoading(false);
  }

  const stats = useMemo(() => {
    const total = applications.length;

    

   const inProgress =
  applications.filter(
    (application) =>
      application.status === "in_progress"
  ).length;

    const approvedApplications =
      applications.filter(
        (application) =>
          application.status === "approved"
      );

    const approved =
      approvedApplications.length;

    const rejected =
      applications.filter(
        (application) =>
          application.status === "rejected"
      ).length;

    const approvedAmount =
      approvedApplications.reduce(
        (sum, application) =>
          sum +
          Number(application.amount || 0),
        0
      );

    const finished = approved + rejected;

    const conversion =
      finished > 0
        ? Math.round(
            (approved / finished) * 100
          )
        : 0;

    return {
  total,
      inProgress,
      approved,
      rejected,
      approvedAmount,
      conversion,
    };
  }, [applications]);

  const recentApplications = useMemo(() => {
    return applications.slice(0, 6);
  }, [applications]);

  const statusStats = useMemo(() => {
    return Object.keys(statusConfig).map(
      (status) => {
        const count = applications.filter(
          (application) =>
            application.status === status
        ).length;

        const percent =
          applications.length > 0
            ? Math.round(
                (count /
                  applications.length) *
                  100
              )
            : 0;

        return {
          status,
          count,
          percent,
          ...statusConfig[status],
        };
      }
    );
  }, [applications]);

  const managerStats = useMemo(() => {
    return managers
      .map((manager) => {
        const managerApplications =
          applications.filter(
            (application) =>
              application.assigned_manager_id ===
              manager.id
          );

        const approved =
          managerApplications.filter(
            (application) =>
              application.status ===
              "approved"
          );

        const rejected =
          managerApplications.filter(
            (application) =>
              application.status ===
              "rejected"
          );

        const finished =
          approved.length + rejected.length;

        const conversion =
          finished > 0
            ? Math.round(
                (approved.length /
                  finished) *
                  100
              )
            : 0;

        const amount = approved.reduce(
          (sum, application) =>
            sum +
            Number(application.amount || 0),
          0
        );

        return {
          id: manager.id,
          full_name:
            manager.full_name ||
            manager.email ||
            "Без имени",
          email: manager.email,
          total: managerApplications.length,
          approved: approved.length,
          conversion,
          amount,
        };
      })
      .sort((a, b) => {
        if (b.approved !== a.approved) {
          return b.approved - a.approved;
        }

        return b.total - a.total;
      })
      .slice(0, 5);
  }, [applications, managers]);

  if (isLoading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-loading">
          <div className="dashboard-spinner" />
          <span>Загрузка Dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-header">
        <div>
          <span className="dashboard-header__eyebrow">
            Общая статистика
          </span>

          <h1>Dashboard</h1>

          <p>
            Основные показатели CRM, последние
            заявки и эффективность менеджеров.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          type="button"
          onClick={loadDashboard}
          disabled={isLoading}
        >
          <RefreshCw size={17} />
          <span>Обновить</span>
        </button>
      </section>

      {error && (
        <div className="dashboard-alert">
          {error}
        </div>
      )}

      <section className="dashboard-stats-grid">
        <StatCard
          title="Всего заявок"
          value={stats.total}
          description="За всё время"
          icon={FileText}
        />

        

        <StatCard
          title="В работе"
          value={stats.inProgress}
          description="Работа и ожидание"
          icon={Clock3}
        />

        <StatCard
          title="Успешные"
          value={stats.approved}
          description="Закрыты успешно"
          icon={CheckCircle2}
        />

        <StatCard
          title="Конверсия"
          value={`${stats.conversion}%`}
          description="Из завершённых заявок"
          icon={TrendingUp}
        />

        <StatCard
          title="Сумма успешных"
          value={formatMoney(
            stats.approvedAmount
          )}
          description="Общий результат"
          icon={CircleDollarSign}
          compact
        />
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-card dashboard-card--wide">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__eyebrow">
                Последние события
              </span>

              <h2>Последние заявки</h2>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate("/applications")
              }
            >
              Все заявки
              <ArrowUpRight size={15} />
            </button>
          </div>

          {recentApplications.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Заявок пока нет"
              description="Создайте первую заявку в разделе «Заявки»."
            />
          ) : (
            <div className="dashboard-applications">
              {recentApplications.map(
                (application) => (
                  <button
                    className="dashboard-application"
                    type="button"
                    key={application.id}
                    onClick={() =>
                      navigate(
                        `/applications/${application.id}`
                      )
                    }
                  >
                    <div className="dashboard-application__client">
                      <div className="dashboard-application__avatar">
                        {getInitials(
                          application.full_name
                        )}
                      </div>

                      <div>
                        <strong>
                          {application.full_name}
                        </strong>

                        <span>
                          {application.product ||
                            "Продукт не указан"}
                        </span>
                      </div>
                    </div>

                    <div className="dashboard-application__manager">
                      <span>Менеджер</span>

                      <strong>
                        {application
                          .assigned_manager
                          ?.full_name ||
                          application
                            .assigned_manager
                            ?.email ||
                          "Не назначен"}
                      </strong>
                    </div>

                    <span
                      className={`dashboard-status dashboard-status--${application.status}`}
                    >
                      {getStatusLabel(
                        application.status
                      )}
                    </span>

                    <strong className="dashboard-application__amount">
                      {application.amount === null ||
                      application.amount ===
                        undefined
                        ? "—"
                        : formatMoney(
                            application.amount
                          )}
                    </strong>

                    <span className="dashboard-application__date">
                      {formatDate(
                        application.created_at
                      )}
                    </span>

                    <ArrowUpRight
                      className="dashboard-application__arrow"
                      size={16}
                    />
                  </button>
                )
              )}
            </div>
          )}
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__eyebrow">
                Воронка
              </span>

              <h2>Статусы заявок</h2>
            </div>
          </div>

          <div className="dashboard-funnel">
            {statusStats.map((item) => (
              <div
                className="dashboard-funnel-item"
                key={item.status}
              >
                <div className="dashboard-funnel-item__top">
                  <div>
                    <span
                      className={`dashboard-funnel-dot dashboard-funnel-dot--${item.className}`}
                    />

                    <strong>
                      {item.label}
                    </strong>
                  </div>

                  <span>
                    {item.count}
                  </span>
                </div>

                <div className="dashboard-funnel-progress">
                  <div
                    className={`dashboard-funnel-progress__value dashboard-funnel-progress__value--${item.className}`}
                    style={{
                      width: `${item.percent}%`,
                    }}
                  />
                </div>

                <span className="dashboard-funnel-item__percent">
                  {item.percent}% от всех заявок
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="dashboard-card dashboard-card--managers">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__eyebrow">
                Команда
              </span>

              <h2>Эффективность менеджеров</h2>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate("/managers")
              }
            >
              Все менеджеры
              <ArrowUpRight size={15} />
            </button>
          </div>

          {managerStats.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Менеджеров пока нет"
              description="Добавьте сотрудников с ролью менеджера."
            />
          ) : (
            <div className="dashboard-manager-table-wrapper">
              <table className="dashboard-manager-table">
                <thead>
                  <tr>
                    <th>Менеджер</th>
                    <th>Заявок</th>
                    <th>Успешных</th>
                    <th>Конверсия</th>
                    <th>Сумма</th>
                  </tr>
                </thead>

                <tbody>
                  {managerStats.map(
                    (manager, index) => (
                      <tr
                        key={manager.id}
                        onClick={() =>
                          navigate(
                            `/managers/${manager.id}`
                          )
                        }
                      >
                        <td>
                          <div className="dashboard-manager">
                            <span className="dashboard-manager__place">
                              {index + 1}
                            </span>

                            <div className="dashboard-manager__avatar">
                              {getInitials(
                                manager.full_name
                              )}
                            </div>

                            <div>
                              <strong>
                                {manager.full_name}
                              </strong>

                              <span>
                                {manager.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {manager.total}
                        </td>

                        <td>
                          {manager.approved}
                        </td>

                        <td>
                          <span className="dashboard-conversion">
                            {manager.conversion}%
                          </span>
                        </td>

                        <td>
                          <strong>
                            {formatMoney(
                              manager.amount
                            )}
                          </strong>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="dashboard-card dashboard-card--summary">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__eyebrow">
                Итоги
              </span>

              <h2>Общая сводка</h2>
            </div>
          </div>

          <div className="dashboard-summary-list">
            <SummaryItem
              label="Менеджеров"
              value={managers.length}
            />

            <SummaryItem
              label="Заявок без менеджера"
              value={
                applications.filter(
                  (application) =>
                    !application.assigned_manager_id
                ).length
              }
            />

            <SummaryItem
              label="Отказов"
              value={stats.rejected}
            />

            <SummaryItem
              label="Средняя сумма"
              value={formatMoney(
                stats.approved > 0
                  ? stats.approvedAmount /
                      stats.approved
                  : 0
              )}
            />
          </div>

          <button
            className="dashboard-summary-button"
            type="button"
            onClick={() =>
              navigate("/reports")
            }
          >
            Перейти к отчётам
            <ArrowUpRight size={16} />
          </button>
        </article>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  compact = false,
}) {
  return (
    <article className="dashboard-stat-card">
      <div className="dashboard-stat-card__icon">
        <Icon size={20} />
      </div>

      <div className="dashboard-stat-card__content">
        <span>{title}</span>

        <strong
          className={
            compact
              ? "dashboard-stat-card__value--compact"
              : ""
          }
        >
          {value}
        </strong>

        <small>{description}</small>
      </div>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="dashboard-empty">
      <Icon size={38} />

      <strong>{title}</strong>

      <span>{description}</span>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}) {
  return (
    <div className="dashboard-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getStatusLabel(status) {
  return (
    statusConfig[status]?.label ||
    status
  );
}

function getInitials(fullName) {
  if (!fullName) {
    return "CRM";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}