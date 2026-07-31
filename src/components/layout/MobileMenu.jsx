import {
  LogOut,
  X,
} from "lucide-react";

import { NavLink } from "react-router-dom";

export default function MobileMenu({
  isOpen,
  navigation,
  user,
  onClose,
  onLogout,
}) {
  if (!isOpen) {
    return null;
  }

  const userName =
    user?.name ||
    user?.full_name ||
    user?.email ||
    "Пользователь";

  return (
    <>
      <button
        className="mobile-menu-overlay"
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
      />

      <aside
        className="mobile-menu"
        aria-label="Мобильная навигация"
      >
        <div className="mobile-menu__header">
          <div className="mobile-menu__brand">
            <div className="mobile-menu__brand-mark">
              C
            </div>

            <div>
              <strong>CRM Stats</strong>
              <span>Управление командой</span>
            </div>
          </div>

          <button
            className="mobile-menu__close"
            type="button"
            aria-label="Закрыть меню"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>

        <div className="mobile-menu__profile">
          <div className="mobile-menu__avatar">
            {getInitials(userName)}
          </div>

          <div>
            <strong>{userName}</strong>
            <span>{getRoleLabel(user?.role)}</span>
          </div>
        </div>

        <nav className="mobile-menu__navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    "mobile-menu__link",
                    isActive
                      ? "mobile-menu__link--active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <span className="mobile-menu__link-icon">
                  <Icon size={19} />
                </span>

                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mobile-menu__footer">
          <button
            type="button"
            onClick={onLogout}
          >
            <LogOut size={19} />
            Выйти из аккаунта
          </button>
        </div>
      </aside>
    </>
  );
}

function getInitials(value) {
  if (!value) {
    return "U";
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getRoleLabel(role) {
  const labels = {
    admin: "Администратор",
    head: "Руководитель",
    manager: "Менеджер",
  };

  return labels[role] || "Сотрудник";
}