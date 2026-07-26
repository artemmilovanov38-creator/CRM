import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import {
  BarChart3,
  Bell,
  Calculator,
  ChartNoAxesCombined,
  CheckCheck,
  FileText,
  LogOut,
  PackageSearch,
  Send,
  Settings,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext.jsx";

import { notificationService } from "../../services/notificationService";

const navigation = [
  {
    title: "Дашборд",
    icon: BarChart3,
    path: "/dashboard",
    roles: ["admin", "head", "manager"],
  },
  {
    title: "Входящий поток",
    icon: Send,
    path: "/incoming",
    roles: ["admin", "head", "manager"],
  },
  {
    title: "Заявки",
    icon: FileText,
    path: "/applications",
    roles: ["admin", "head", "manager"],
  },
  {
    title: "Менеджеры",
    icon: Users,
    path: "/managers",
    roles: ["admin", "head"],
  },
  {
    title: "Рассылки",
    icon: PackageSearch,
    path: "/mailings",
    roles: ["admin", "head", "manager"],
  },
  {
    title: "Расчёт зарплаты",
    icon: Calculator,
    path: "/salaries",
    roles: ["admin", "head"],
  },
  {
    title: "Отчёты",
    icon: ChartNoAxesCombined,
    path: "/reports",
    roles: ["admin", "head"],
  },
  {
    title: "Пользователи",
    icon: UserCog,
    path: "/users",
    roles: ["admin"],
  },
  {
    title: "Настройки",
    icon: Settings,
    path: "/settings",
    roles: ["admin", "head"],
  },
];

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const notificationRef = useRef(null);

  const [notifications, setNotifications] =
    useState([]);

  const [isNotificationsOpen, setIsNotificationsOpen] =
    useState(false);

  const [isNotificationsLoading, setIsNotificationsLoading] =
    useState(false);

  const [notificationError, setNotificationError] =
    useState("");

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read
  ).length;

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return undefined;
    }

    loadNotifications();

    const channel = notificationService.subscribe(
      user.id,
      () => {
        loadNotifications({
          showLoading: false,
        });
      }
    );

    return () => {
      notificationService.unsubscribe(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target
        )
      ) {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleDocumentClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentClick
      );
    };
  }, []);

  async function loadNotifications({
    showLoading = true,
  } = {}) {
    if (!user?.id) {
      return;
    }

    if (showLoading) {
      setIsNotificationsLoading(true);
    }

    setNotificationError("");

    const { data, error } =
      await notificationService.getNotifications(
        user.id
      );

    if (error) {
      console.error(
        "Ошибка загрузки уведомлений:",
        error
      );

      setNotificationError(
        "Не удалось загрузить уведомления"
      );

      setIsNotificationsLoading(false);
      return;
    }

    setNotifications(data || []);
    setIsNotificationsLoading(false);
  }

  async function handleLogout() {
    const result = await logout();

    if (!result.success) {
      console.error(result.message);
      return;
    }

    navigate("/login", {
      replace: true,
    });
  }

  async function handleNotificationClick(
    notification
  ) {
    if (!notification.is_read) {
      const { success, error } =
        await notificationService.markAsRead(
          notification.id
        );

      if (error || !success) {
        console.error(
          "Ошибка обновления уведомления:",
          error
        );
      } else {
        setNotifications(
          (currentNotifications) =>
            currentNotifications.map((item) =>
              item.id === notification.id
                ? {
                    ...item,
                    is_read: true,
                  }
                : item
            )
        );
      }
    }

    setIsNotificationsOpen(false);

    if (notification.application_id) {
      navigate(
        `/applications/${notification.application_id}`
      );
    }
  }

  async function handleMarkAllAsRead() {
    if (!user?.id || unreadCount === 0) {
      return;
    }

    const { success, error } =
      await notificationService.markAllAsRead(
        user.id
      );

    if (error || !success) {
      console.error(
        "Ошибка прочтения уведомлений:",
        error
      );

      setNotificationError(
        "Не удалось отметить уведомления"
      );

      return;
    }

    setNotifications(
      (currentNotifications) =>
        currentNotifications.map(
          (notification) => ({
            ...notification,
            is_read: true,
          })
        )
    );
  }

  async function handleDeleteNotification(
    event,
    notificationId
  ) {
    event.stopPropagation();

    const { success, error } =
      await notificationService.deleteNotification(
        notificationId
      );

    if (error || !success) {
      console.error(
        "Ошибка удаления уведомления:",
        error
      );

      return;
    }

    setNotifications(
      (currentNotifications) =>
        currentNotifications.filter(
          (notification) =>
            notification.id !== notificationId
        )
    );
  }

  const availableNavigation = navigation.filter(
    (item) => {
      if (!item.roles) {
        return true;
      }

      return item.roles.includes(user?.role);
    }
  );

  const userInitials = getInitials(
    user?.name ||
      user?.full_name ||
      user?.email
  );

  return (
    <header className="header">
      <div className="header__inner">
        <NavLink
          className="header__logo"
          to="/dashboard"
        >
          <div className="header__logo-mark">
            C
          </div>

          <div>
            <div className="header__logo-title">
              CRM Stats
            </div>

            <div className="header__logo-subtitle">
              Аналитика команды
            </div>
          </div>
        </NavLink>

        <nav className="header__nav">
          {availableNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  [
                    "header__nav-item",
                    isActive
                      ? "header__nav-item--active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <Icon size={16} />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="header__user">
          <div className="header__user-avatar">
            {userInitials}
          </div>

          <div className="header__user-info">
            <strong>
              {user?.name ||
                user?.full_name ||
                "Пользователь"}
            </strong>

           <span>{getRoleLabel(user?.role)}</span>
          </div>
        </div>

        <div className="header__actions">
          <div
            className="header-notifications"
            ref={notificationRef}
          >
            <button
              className="header__icon-button"
              type="button"
              aria-label="Уведомления"
              aria-expanded={
                isNotificationsOpen
              }
              onClick={() =>
                setIsNotificationsOpen(
                  (currentValue) =>
                    !currentValue
                )
              }
            >
              <Bell size={18} />

              {unreadCount > 0 && (
                <span className="header__notification">
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="notifications-dropdown">
                <div className="notifications-dropdown__header">
                  <div>
                    <strong>Уведомления</strong>

                    <span>
                      {unreadCount > 0
                        ? `Непрочитанных: ${unreadCount}`
                        : "Новых уведомлений нет"}
                    </span>
                  </div>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={
                        handleMarkAllAsRead
                      }
                    >
                      <CheckCheck size={15} />
                      <span>Прочитать все</span>
                    </button>
                  )}
                </div>

                <div className="notifications-dropdown__body">
                  {isNotificationsLoading ? (
                    <div className="notifications-dropdown__state">
                      <div className="notifications-dropdown__spinner" />

                      <span>
                        Загрузка уведомлений...
                      </span>
                    </div>
                  ) : notificationError ? (
                    <div className="notifications-dropdown__state">
                      <strong>
                        Произошла ошибка
                      </strong>

                      <span>
                        {notificationError}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          loadNotifications()
                        }
                      >
                        Повторить
                      </button>
                    </div>
                  ) : notifications.length ===
                    0 ? (
                    <div className="notifications-dropdown__state">
                      <Bell size={32} />

                      <strong>
                        Уведомлений пока нет
                      </strong>

                      <span>
                        Здесь появятся новые события
                        CRM.
                      </span>
                    </div>
                  ) : (
                    notifications.map(
                      (notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={
                            notification
                          }
                          onClick={
                            handleNotificationClick
                          }
                          onDelete={
                            handleDeleteNotification
                          }
                        />
                      )
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            className="header__logout"
            type="button"
            onClick={handleLogout}
          >
            <LogOut size={17} />
            <span>Выйти</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function NotificationItem({
  notification,
  onClick,
  onDelete,
}) {
  return (
    <article
      className={[
        "notification-item",
        !notification.is_read
          ? "notification-item--unread"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(notification)}
    >
      <div className="notification-item__icon">
        <Bell size={16} />
      </div>

      <div className="notification-item__content">
        <div className="notification-item__top">
          <strong>
            {notification.title}
          </strong>

          {!notification.is_read && (
            <span className="notification-item__dot" />
          )}
        </div>

        {notification.message && (
          <p>{notification.message}</p>
        )}

        <time>
          {formatNotificationDate(
            notification.created_at
          )}
        </time>
      </div>

      <button
        className="notification-item__delete"
        type="button"
        aria-label="Удалить уведомление"
        title="Удалить уведомление"
        onClick={(event) =>
          onDelete(event, notification.id)
        }
      >
        <Trash2 size={14} />
      </button>
    </article>
  );
}

function getInitials(value) {
  if (!value) {
    return "U";
  }

  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatNotificationDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  const now = new Date();

  const difference =
    now.getTime() - date.getTime();

  const minutes = Math.floor(
    difference / 60000
  );

  if (minutes < 1) {
    return "Только что";
  }

  if (minutes < 60) {
    return `${minutes} мин. назад`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours} ч. назад`;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);


}
function getRoleLabel(role) {
  const labels = {
    admin: "Администратор",
    head: "Руководитель",
    manager: "Менеджер",
  };

  return labels[role] || "Сотрудник";
}