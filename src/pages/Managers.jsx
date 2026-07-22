import {
  CalendarDays,
  Mail,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import "../styles/Managers.css";

import { profileService } from "../services/profileService";

const roleLabels = {
  leader: "Руководитель",
  manager: "Менеджер",
};

const statusLabels = {
  active: "Активен",
  inactive: "Неактивен",
  blocked: "Заблокирован",
};

export default function Managers() {
  const navigate = useNavigate();

  const [managers, setManagers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    loadManagers();
  }, []);

  async function loadManagers() {
    setIsLoading(true);
    setError("");

    const { data, error: managersError } =
      await profileService.getManagers();

    if (managersError) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersError
      );

      setError(
        "Не удалось загрузить список менеджеров"
      );

      setManagers([]);
      setIsLoading(false);

      return;
    }

    setManagers(data);
    setIsLoading(false);
  }

  const filteredManagers = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return managers.filter((manager) => {
      const matchesSearch =
        !normalizedSearch ||
        manager.full_name
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        manager.email
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        manager.phone
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        manager.telegram
          ?.toLowerCase()
          .includes(normalizedSearch);

      const matchesRole =
        roleFilter === "all" ||
        manager.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        manager.status === statusFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );
    });
  }, [
    managers,
    search,
    roleFilter,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: managers.length,

      active: managers.filter(
        (manager) =>
          manager.status === "active"
      ).length,

      leaders: managers.filter(
        (manager) =>
          manager.role === "leader"
      ).length,

      blocked: managers.filter(
        (manager) =>
          manager.status === "blocked"
      ).length,
    };
  }, [managers]);

  return (
    <main className="managers-page">
      <section className="managers-page__header">
        <div>
          <span className="managers-page__eyebrow">
            Команда
          </span>

          <h1>Менеджеры</h1>

          <p>
            Список сотрудников, их контакты,
            роли и текущий статус работы.
          </p>
        </div>

        <button
          className="managers-page__refresh"
          type="button"
          onClick={loadManagers}
          disabled={isLoading}
        >
          Обновить
        </button>
      </section>

      <section className="managers-stats">
        <StatCard
          title="Всего сотрудников"
          value={stats.total}
          icon={Users}
        />

        <StatCard
          title="Активные"
          value={stats.active}
          icon={UserCheck}
        />

        <StatCard
          title="Руководители"
          value={stats.leaders}
          icon={ShieldCheck}
        />

        <StatCard
          title="Заблокированы"
          value={stats.blocked}
          icon={UserCheck}
        />
      </section>

      {error && (
        <div className="managers-alert managers-alert--error">
          {error}
        </div>
      )}

      <section className="managers-panel">
        <div className="managers-toolbar">
          <div className="managers-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Поиск по имени, email, телефону или Telegram"
            />
          </div>

          <select
            className="managers-filter"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value)
            }
          >
            <option value="all">
              Все роли
            </option>

            <option value="leader">
              Руководители
            </option>

            <option value="manager">
              Менеджеры
            </option>
          </select>

          <select
            className="managers-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Все статусы
            </option>

            <option value="active">
              Активные
            </option>

            <option value="inactive">
              Неактивные
            </option>

            <option value="blocked">
              Заблокированные
            </option>
          </select>
        </div>

        {isLoading ? (
          <div className="managers-state">
            <div className="managers-state__spinner" />
            <span>Загрузка менеджеров...</span>
          </div>
        ) : filteredManagers.length === 0 ? (
          <div className="managers-state">
            <Users size={38} />

            <strong>
              Менеджеры не найдены
            </strong>

            <span>
              Добавьте пользователя с ролью
              manager или leader.
            </span>
          </div>
        ) : (
          <div className="managers-grid">
            {filteredManagers.map((manager) => (
              <article
                className="manager-card"
                key={manager.id}
              >
                <div className="manager-card__top">
                  <div className="manager-card__avatar">
                    {getInitials(
                      manager.full_name
                    )}
                  </div>

                  <div className="manager-card__identity">
                    <strong>
                      {manager.full_name ||
                        "Без имени"}
                    </strong>

                    <span>
                      {roleLabels[manager.role] ||
                        manager.role}
                    </span>
                  </div>

                  <span
                    className={`manager-card__status manager-card__status--${manager.status}`}
                  >
                    {statusLabels[
                      manager.status
                    ] || manager.status}
                  </span>
                </div>

                <div className="manager-card__contacts">
                  <ContactRow
                    icon={Mail}
                    value={manager.email}
                  />

                  <ContactRow
                    icon={Phone}
                    value={
                      manager.phone ||
                      "Телефон не указан"
                    }
                  />

                  <ContactRow
                    icon={MessageCircle}
                    value={
                      manager.telegram ||
                      "Telegram не указан"
                    }
                  />

                  <ContactRow
                    icon={CalendarDays}
                    value={
                      manager.hire_date
                        ? `Работает с ${formatDate(
                            manager.hire_date
                          )}`
                        : "Дата начала не указана"
                    }
                  />
                </div>

                <button
                  className="manager-card__button"
                  type="button"
                  onClick={() =>
                    navigate(
                      `/managers/${manager.id}`
                    )
                  }
                >
                  Открыть карточку
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}) {
  return (
    <article className="managers-stat-card">
      <div className="managers-stat-card__icon">
        <Icon size={20} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ContactRow({
  icon: Icon,
  value,
}) {
  return (
    <div className="manager-card__contact">
      <Icon size={15} />
      <span>{value}</span>
    </div>
  );
}

function getInitials(fullName) {
  if (!fullName) {
    return "М";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateValue));
}