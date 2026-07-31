import {
  CalendarDays,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  Trash2,
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
  head: "Руководитель",
  manager: "Менеджер",
};

const statusLabels = {
  active: "Активен",
  inactive: "Неактивен",
  blocked: "Заблокирован",
};

export default function Managers() {
  const navigate = useNavigate();

  const [managers, setManagers] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [roleFilter, setRoleFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    loadManagers();
  }, []);


  async function handleDeleteMailing(
  mailing
) {
  if (!mailing?.id) {
    return;
  }

  const mailingName =
    mailing.name ||
    mailing.title ||
    "Без названия";

  const confirmed = window.confirm(
    `Удалить рассылку "${mailingName}"?\n\nБудут удалены сама рассылка и все её контакты.\n\nЭто действие нельзя отменить.`
  );

  if (!confirmed) {
    return;
  }

  const confirmationText =
    window.prompt(
      `Для подтверждения напишите слово УДАЛИТЬ`
    );

  if (
    confirmationText?.trim() !==
    "УДАЛИТЬ"
  ) {
    window.alert(
      "Удаление отменено."
    );

    return;
  }

  const result =
    await mailingService.deleteMailing(
      mailing.id
    );

  if (result.error) {
    console.error(
      "Ошибка удаления рассылки:",
      result.error
    );

    window.alert(
      result.error.message ||
        "Не удалось удалить рассылку."
    );

    return;
  }

  setMailingsData((current) =>
    current.filter(
      (item) =>
        item.id !== mailing.id
    )
  );

  window.alert(
    `Рассылка "${mailingName}" удалена.`
  );
}
  async function loadManagers() {
    setIsLoading(true);
    setError("");

    const {
      data,
      error: managersError,
    } =
      await profileService.getManagers();

    if (managersError) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersError
      );

      setError(
        managersError.message ||
          "Не удалось загрузить список менеджеров"
      );

      setManagers([]);
      setIsLoading(false);

      return;
    }

    setManagers(data || []);
    setIsLoading(false);
  }

  const filteredManagers = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return managers.filter((manager) => {
      const searchableValue = [
        manager.full_name,
        manager.email,
        manager.phone,
        manager.telegram,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        searchableValue.includes(
          normalizedSearch
        );

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

      heads: managers.filter(
        (manager) =>
          manager.role === "head"
      ).length,

      blocked: managers.filter(
        (manager) =>
          manager.status === "blocked"
      ).length,
    };
  }, [managers]);

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  const hasFilters =
    Boolean(search) ||
    roleFilter !== "all" ||
    statusFilter !== "all";

  return (
    <main className="managers-page">
      <section className="managers-page__header">
        <div>
          <span className="managers-page__eyebrow">
            Команда
          </span>

          <h1>Менеджеры</h1>

          <p>
            Сотрудники команды, их роли,
            контакты и текущий статус работы.
          </p>
        </div>

        <button
          className="managers-page__refresh"
          type="button"
          onClick={loadManagers}
          disabled={isLoading}
        >
          <RefreshCw
            size={17}
            className={
              isLoading
                ? "managers-page__refresh-icon managers-page__refresh-icon--loading"
                : "managers-page__refresh-icon"
            }
          />

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
          variant="success"
        />

        <StatCard
          title="Руководители"
          value={stats.heads}
          icon={ShieldCheck}
          variant="purple"
        />

        <StatCard
          title="Заблокированы"
          value={stats.blocked}
          icon={UserCheck}
          variant="danger"
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
                setSearch(
                  event.target.value
                )
              }
              placeholder="Имя, email, телефон или Telegram"
            />

            {search && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={16} />
              </button>
            )}
          </div>

          <select
            className="managers-filter"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Все роли
            </option>

            <option value="head">
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

          {hasFilters && (
            <button
              className="managers-reset"
              type="button"
              onClick={resetFilters}
            >
              Сбросить
            </button>
          )}
        </div>

        <div className="managers-result-line">
          Найдено сотрудников:{" "}
          <strong>
            {filteredManagers.length}
          </strong>
        </div>

        {isLoading ? (
          <div className="managers-state">
            <div className="managers-state__spinner" />

            <strong>
              Загружаем сотрудников
            </strong>

            <span>
              Получаем актуальные данные команды.
            </span>
          </div>
        ) : filteredManagers.length === 0 ? (
          <div className="managers-state">
            <Users size={40} />

            <strong>
              Сотрудники не найдены
            </strong>

            <span>
              Измените поиск или выбранные фильтры.
            </span>

            {hasFilters && (
              <button
                className="managers-state__button"
                type="button"
                onClick={resetFilters}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <div className="managers-grid">
            {filteredManagers.map(
              (manager) => (
                <ManagerCard
                  key={manager.id}
                  manager={manager}
                  onOpen={() =>
                    navigate(
                      `/managers/${manager.id}`
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ManagerCard({
  manager,
  onOpen,
}) {
  return (
    <article className="manager-card">
      <button
        className="manager-card__main"
        type="button"
        onClick={onOpen}
      >
        <div className="manager-card__top">
          <div className="manager-card__avatar">
            {getInitials(
              manager.full_name ||
                manager.email
            )}
          </div>

          <div className="manager-card__identity">
            <strong>
              {manager.full_name ||
                "Без имени"}
            </strong>

            <span>
              {roleLabels[manager.role] ||
                manager.role ||
                "Сотрудник"}
            </span>
          </div>

          <span
            className={`manager-card__status manager-card__status--${
              manager.status || "inactive"
            }`}
          >
            {statusLabels[
              manager.status
            ] ||
              manager.status ||
              "Неизвестно"}
          </span>
        </div>

        <div className="manager-card__contacts">
          <ContactRow
            icon={Mail}
            label="Email"
            value={
              manager.email ||
              "Email не указан"
            }
          />

          <ContactRow
            icon={Phone}
            label="Телефон"
            value={
              manager.phone ||
              "Телефон не указан"
            }
          />

          <ContactRow
            icon={MessageCircle}
            label="Telegram"
            value={
              manager.telegram ||
              "Telegram не указан"
            }
          />

          <ContactRow
            icon={CalendarDays}
            label="Дата начала"
            value={
              manager.hire_date
                ? formatDate(
                    manager.hire_date
                  )
                : "Не указана"
            }
          />
        </div>
      </button>

      <div className="manager-card__quick-actions">
        {manager.phone ? (
          <a
            href={`tel:${manager.phone}`}
            aria-label="Позвонить менеджеру"
          >
            <Phone size={17} />
            Позвонить
          </a>
        ) : (
          <span className="manager-card__quick-action-disabled">
            <Phone size={17} />
            Нет телефона
          </span>
        )}

        {getTelegramLink(
          manager.telegram
        ) ? (
          <a
            href={getTelegramLink(
              manager.telegram
            )}
            target="_blank"
            rel="noreferrer"
            aria-label="Открыть Telegram"
          >
            <MessageCircle size={17} />
            Telegram
          </a>
        ) : (
          <span className="manager-card__quick-action-disabled">
            <MessageCircle size={17} />
            Нет Telegram
          </span>
        )}
      </div>

      <button
        className="manager-card__button"
        type="button"
        onClick={onOpen}
      >
        Открыть карточку
      </button>
    </article>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  variant = "",
}) {
  return (
    <article
      className={[
        "managers-stat-card",
        variant
          ? `managers-stat-card--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
  label,
  value,
}) {
  return (
    <div className="manager-card__contact">
      <div className="manager-card__contact-icon">
        <Icon size={15} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function getTelegramLink(value) {
  if (!value) {
    return null;
  }

  const username = String(value)
    .trim()
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/^@/, "");

  if (!username) {
    return null;
  }

  return `https://t.me/${username}`;
}

function getInitials(fullName) {
  if (!fullName) {
    return "М";
  }

  return String(fullName)
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

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}