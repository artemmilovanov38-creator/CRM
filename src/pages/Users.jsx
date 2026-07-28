import {
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserRoundX,
  Users as UsersIcon,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";
import UserDrawer from "../components/Users/UserDrawer";
import { profileService } from "../services/profileService";
import "../styles/Users.css";

const roleLabels = {
  admin: "Администратор",
  head: "Руководитель",
  manager: "Менеджер",
  intern: "Стажёр",
};

const statusLabels = {
  active: "Активен",
  inactive: "Неактивен",
  blocked: "Заблокирован",
};

export default function Users() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [isLoading, setIsLoading] =
    useState(true);

  const [updatingUserId, setUpdatingUserId] =
    useState(null);

    const [isDrawerLoading, setIsDrawerLoading] =
  useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

    const [selectedUser, setSelectedUser] =
  useState(null);

const [isUserDrawerOpen, setIsUserDrawerOpen] =
  useState(false);

function handleOpenCreateUser() {
  setSelectedUser(null);
  setError("");
  setSuccessMessage("");
  setIsUserDrawerOpen(true);
}

function handleOpenUser(profile) {
  setSelectedUser(profile);
  setError("");
  setSuccessMessage("");
  setIsUserDrawerOpen(true);
}

function handleCloseUserDrawer() {
  if (updatingUserId || isDrawerLoading) {
    return;
  }

  setIsUserDrawerOpen(false);
  setSelectedUser(null);
}

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(values) {
  setIsDrawerLoading(true);
  setError("");
  setSuccessMessage("");

  const {
    data,
    error: createError,
    warning,
  } = await profileService.createUser(values);

  if (createError) {
    console.error(
      "Ошибка создания пользователя:",
      createError
    );

    setError(
      createError.message ||
        "Не удалось создать пользователя"
    );

    setIsDrawerLoading(false);
    return;
  }

  if (data) {
    setUsers((currentUsers) => [
      data,
      ...currentUsers,
    ]);
  } else {
    await loadUsers();
  }

  setIsUserDrawerOpen(false);
  setSelectedUser(null);
  setIsDrawerLoading(false);

  setSuccessMessage(
    warning ||
      `Сотрудник ${
        data?.full_name || values.full_name
      } успешно создан`
  );
}

async function handleSaveUser(profile, values) {
  setIsDrawerLoading(true);
  setError("");
  setSuccessMessage("");

  const { data, error } =
    await profileService.updateProfile(
      profile.id,
      values
    );

  if (error) {
    console.error(error);

    setError(
      "Не удалось сохранить изменения"
    );

    setIsDrawerLoading(false);
    return;
  }

  setUsers((currentUsers) =>
    currentUsers.map((user) =>
      user.id === profile.id ? data : user
    )
  );

  setSelectedUser(data);

  setSuccessMessage(
    "Изменения успешно сохранены"
  );

  setIsDrawerLoading(false);
}

async function handleDeleteUser(profile) {
  if (!profile?.id) {
    return;
  }

  if (profile.id === currentUser?.id) {
    setError(
      "Нельзя удалить собственный аккаунт"
    );

    return;
  }

  setIsDrawerLoading(true);
  setError("");
  setSuccessMessage("");

  const {
    data,
    error: deleteError,
  } = await profileService.deleteUser(
    profile.id
  );

  if (deleteError) {
    console.error(
      "Ошибка удаления пользователя:",
      deleteError
    );

    setError(
      deleteError.message ||
        "Не удалось удалить пользователя"
    );

    setIsDrawerLoading(false);
    return;
  }

  setUsers((currentUsers) =>
    currentUsers.filter(
      (user) => user.id !== profile.id
    )
  );

  setIsUserDrawerOpen(false);
  setSelectedUser(null);
  setIsDrawerLoading(false);

  setSuccessMessage(
    data?.warning ||
      `Сотрудник ${
        profile.full_name || profile.email
      } удалён`
  );
}

  async function loadUsers() {
    setIsLoading(true);
    setError("");

    const { data, error: profilesError } =
      await profileService.getProfiles();

    if (profilesError) {
      console.error(
        "Ошибка загрузки пользователей:",
        profilesError
      );

      setError(
        "Не удалось загрузить пользователей"
      );

      setUsers([]);
      setIsLoading(false);

      return;
    }

    setUsers(data);
    setIsLoading(false);
  }

  async function handleRoleChange(
    profileId,
    newRole
  ) {
    const targetUser = users.find(
      (item) => item.id === profileId
    );

    if (!targetUser) {
      return;
    }

    if (profileId === currentUser?.id) {
      setError(
        "Нельзя изменить роль собственного аккаунта"
      );

      return;
    }

    setUpdatingUserId(profileId);
    setError("");
    setSuccessMessage("");

    const { data, error: updateError } =
      await profileService.updateProfile(
        profileId,
        {
          role: newRole,
        }
      );

    if (updateError) {
      console.error(
        "Ошибка изменения роли:",
        updateError
      );

      setError("Не удалось изменить роль");
      setUpdatingUserId(null);

      return;
    }

    setUsers((currentUsers) =>
      currentUsers.map((item) =>
        item.id === profileId ? data : item
      )
    );

    setSuccessMessage(
      `Роль пользователя ${targetUser.full_name} изменена`
    );

    setUpdatingUserId(null);
  }

  async function handleStatusToggle(profile) {
    if (profile.id === currentUser?.id) {
      setError(
        "Нельзя заблокировать собственный аккаунт"
      );

      return;
    }

    const newStatus =
      profile.status === "blocked"
        ? "active"
        : "blocked";

    setUpdatingUserId(profile.id);
    setError("");
    setSuccessMessage("");

    const { data, error: updateError } =
      await profileService.updateProfile(
        profile.id,
        {
          status: newStatus,
        }
      );

    if (updateError) {
      console.error(
        "Ошибка изменения статуса:",
        updateError
      );

      setError(
        "Не удалось изменить статус пользователя"
      );

      setUpdatingUserId(null);

      return;
    }

    setUsers((currentUsers) =>
      currentUsers.map((item) =>
        item.id === profile.id ? data : item
      )
    );

    setSuccessMessage(
      newStatus === "blocked"
        ? `${profile.full_name} заблокирован`
        : `${profile.full_name} разблокирован`
    );

    setUpdatingUserId(null);
  }

  const filteredUsers = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return users.filter((profile) => {
      const matchesSearch =
        !normalizedSearch ||
        profile.full_name
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        profile.email
          ?.toLowerCase()
          .includes(normalizedSearch);

      const matchesRole =
        roleFilter === "all" ||
        profile.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        profile.status === statusFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );
    });
  }, [
    users,
    search,
    roleFilter,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: users.length,

      admins: users.filter(
        (profile) => profile.role === "admin"
      ).length,

      managers: users.filter(
        (profile) => profile.role === "manager"
      ).length,

      blocked: users.filter(
        (profile) =>
          profile.status === "blocked"
      ).length,
    };
  }, [users]);

  return (
    <main className="users-page">
      <section className="users-page__header">
        <div>
          <span className="users-page__eyebrow">
            Управление доступом
          </span>

          <h1>Пользователи</h1>

          <p>
            Управляйте ролями, статусами и
            доступом сотрудников к CRM.
          </p>
        </div>

       <div className="users-page__header-actions">
  <button
    className="users-page__refresh"
    type="button"
    onClick={loadUsers}
    disabled={isLoading}
  >
    Обновить
  </button>

  <button
    className="users-page__create"
    type="button"
    onClick={handleOpenCreateUser}
  >
    + Новый сотрудник
  </button>
</div>
      </section>

      <section className="users-stats">
        <StatCard
          title="Всего пользователей"
          value={stats.total}
          icon={UsersIcon}
        />

        <StatCard
          title="Администраторы"
          value={stats.admins}
          icon={ShieldCheck}
        />

        <StatCard
          title="Менеджеры"
          value={stats.managers}
          icon={UserCheck}
        />

        <StatCard
          title="Заблокированы"
          value={stats.blocked}
          icon={UserRoundX}
        />
      </section>

      {error && (
        <div className="users-alert users-alert--error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="users-alert users-alert--success">
          {successMessage}
        </div>
      )}

      <section className="users-panel">
        <div className="users-toolbar">
          <div className="users-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Поиск по имени или email"
            />
          </div>

          <select
            className="users-filter"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value)
            }
          >
            <option value="all">
              Все роли
            </option>

            <option value="admin">
              Администраторы
            </option>

            <option value="head">
  Руководители
</option>

            <option value="manager">
              Менеджеры
            </option>

            
          </select>

          <select
            className="users-filter"
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
          <div className="users-state">
            <div className="users-state__spinner" />
            <span>Загрузка пользователей...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="users-state">
            <UserCog size={36} />
            <strong>
              Пользователи не найдены
            </strong>
            <span>
              Измените параметры поиска или
              фильтры.
            </span>
          </div>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Дата создания</th>
                  <th>Действия</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((profile) => {
                  const isCurrentUser =
                    profile.id === currentUser?.id;

                  const isUpdating =
                    updatingUserId === profile.id;

                  return (
                    <tr key={profile.id}>
                      <td>
                        <button
  className="users-user-card"
  type="button"
  onClick={() => handleOpenUser(profile)}
>
  <div className="users-user-card__avatar">
    {getInitials(profile.full_name)}
  </div>

  <div className="users-user-card__content">
    <strong>
      {profile.full_name || "Без имени"}
    </strong>

    <span>
      {profile.email}
    </span>

    {isCurrentUser && (
      <div className="users-user-card__badge">
        Ваш аккаунт
      </div>
    )}
  </div>
</button>
                      </td>

                      <td>
                        <select
                          className="users-table__role"
                          value={profile.role}
                          disabled={
                            isUpdating ||
                            isCurrentUser
                          }
                          onChange={(event) =>
                            handleRoleChange(
                              profile.id,
                              event.target.value
                            )
                          }
                        >
                          <option value="admin">
                            Администратор
                          </option>

                         <option value="head">
  Руководитель
</option>

                          <option value="manager">
                            Менеджер
                          </option>

                          
                        </select>
                      </td>

                      <td>
                        <span
                          className={`users-status users-status--${profile.status}`}
                        >
                          {statusLabels[
                            profile.status
                          ] || profile.status}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          profile.created_at
                        )}
                      </td>

                      <td>
                        <button
                          className={`users-table__action ${
                            profile.status ===
                            "blocked"
                              ? "users-table__action--restore"
                              : "users-table__action--block"
                          }`}
                          type="button"
                          disabled={
                            isUpdating ||
                            isCurrentUser
                          }
                          onClick={() =>
                            handleStatusToggle(
                              profile
                            )
                          }
                        >
                          {isUpdating
                            ? "Сохранение..."
                            : profile.status ===
                                "blocked"
                              ? "Разблокировать"
                              : "Заблокировать"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

<UserDrawer
  isOpen={isUserDrawerOpen}
  profile={selectedUser}
  currentUserId={currentUser?.id}
  actionLoading={
    Boolean(updatingUserId) ||
    isDrawerLoading
  }
  onClose={handleCloseUserDrawer}
  onCreate={handleCreateUser}
  onDelete={handleDeleteUser}
  onSave={handleSaveUser}
  onToggleStatus={handleStatusToggle}
/>
</main>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}) {
  return (
    <article className="users-stat-card">
      <div className="users-stat-card__icon">
        <Icon size={20} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function getInitials(fullName) {
  if (!fullName) {
    return "П";
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