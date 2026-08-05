import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Save,
  Send,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

import {
  applicationService,
} from "../../services/applicationService";

import "../../styles/ContactDrawer.css";

const contactStatusNames = {
  new: "Новый",
  telegram_found: "Telegram найден",
  telegram_not_found: "Telegram не найден",
  assigned: "Закреплён",
  sent: "Сообщение отправлено",
  responded: "Ответил",
  application: "Есть заявки",
  opened: "Открытие",
  rejected: "Отказ",
  duplicate: "Дубликат",
};

const applicationStatusOptions = [
  {
    value: "new",
    title: "Новая",
  },
  {
    value: "in_progress",
    title: "В работе",
  },
  {
    value: "approved",
    title: "Успешно открыта",
  },
  {
    value: "rejected",
    title: "Отказ",
  },
];

const emptyApplicationForm = {
  productId: "",
  status: "new",
  comment: "",
};

const emptyEditingForm = {
  productId: "",
  status: "new",
  comment: "",
};

export default function ContactDrawer({
  contact,
  isOpen,
  onClose,
  onSaveComment,
  onAssignManager,
  onContactChanged,
  managers = [],
  products = [],
  actionLoading = false,
}) {
  const navigate = useNavigate();

  const { profile, user } = useAuth();

  const currentProfile =
    profile || user;

  const canManageContacts = [
    "admin",
    "head",
  ].includes(currentProfile?.role);

  const [
    applications,
    setApplications,
  ] = useState([]);

  const [
    applicationsLoading,
    setApplicationsLoading,
  ] = useState(false);

  const [
    applicationsError,
    setApplicationsError,
  ] = useState("");

  const [
    applicationForm,
    setApplicationForm,
  ] = useState(
    emptyApplicationForm
  );

  const [
    applicationFormError,
    setApplicationFormError,
  ] = useState("");

  const [
    applicationSaving,
    setApplicationSaving,
  ] = useState(false);

  const [
    applicationSuccess,
    setApplicationSuccess,
  ] = useState("");

  const [
    lastCreatedApplicationId,
    setLastCreatedApplicationId,
  ] = useState(null);

  const [
    editingApplicationId,
    setEditingApplicationId,
  ] = useState(null);

  const [
    editingForm,
    setEditingForm,
  ] = useState(
    emptyEditingForm
  );

  const [
    deletingApplicationId,
    setDeletingApplicationId,
  ] = useState(null);

  const [
    commentValue,
    setCommentValue,
  ] = useState("");

  const [
    managerValue,
    setManagerValue,
  ] = useState("");

  const loadApplications = useCallback(
    async () => {
      if (!contact?.id) {
        setApplications([]);
        return;
      }

      setApplicationsLoading(true);
      setApplicationsError("");

      const result =
        await applicationService
          .getApplicationsByContactId(
            contact.id
          );

      if (result.error) {
        console.error(
          "Ошибка загрузки заявок контакта:",
          result.error
        );

        setApplicationsError(
          result.error.message ||
            "Не удалось загрузить заявки"
        );

        setApplications([]);
      } else {
        setApplications(
          result.data || []
        );
      }

      setApplicationsLoading(false);
    },
    [contact?.id]
  );

  useEffect(() => {
    if (!contact) {
      return;
    }

    setCommentValue(
      contact.comment || ""
    );

    setManagerValue(
      contact.manager_id || ""
    );

    setApplicationForm(
      emptyApplicationForm
    );

    setEditingApplicationId(null);
    setEditingForm(
      emptyEditingForm
    );

    setApplicationFormError("");
    setApplicationsError("");
    setApplicationSuccess("");
    setLastCreatedApplicationId(null);
  }, [contact]);

  useEffect(() => {
    if (
      !isOpen ||
      !contact?.id
    ) {
      return;
    }

    loadApplications();
  }, [
    isOpen,
    contact?.id,
    loadApplications,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(event) {
      if (
        event.key === "Escape" &&
        !actionLoading &&
        !applicationSaving
      ) {
        onClose?.();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [
    isOpen,
    actionLoading,
    applicationSaving,
    onClose,
  ]);

  const selectedProduct = useMemo(
    () =>
      products.find(
        (product) =>
          product.id ===
          applicationForm.productId
      ) || null,
    [
      products,
      applicationForm.productId,
    ]
  );

  const managerChanged =
    managerValue !==
    (contact?.manager_id || "");

  const commentChanged =
    commentValue !==
    (contact?.comment || "");

  if (!isOpen || !contact) {
    return null;
  }

  const telegramUsername =
    normalizeTelegramUsername(
      contact.telegram_username
    );

  const telegramLink =
    telegramUsername
      ? `https://t.me/${telegramUsername}`
      : null;

  async function handleCreateApplication() {
    if (
      !applicationForm.productId
    ) {
      setApplicationFormError(
        "Выберите продукт"
      );

      return;
    }

    const managerId =
      contact.manager_id ||
      currentProfile?.id ||
      null;

    if (!managerId) {
      setApplicationFormError(
        "Не удалось определить менеджера"
      );

      return;
    }

    setApplicationSaving(true);
    setApplicationFormError("");
    setApplicationSuccess("");
    setLastCreatedApplicationId(null);

    const result =
      await applicationService
        .createApplicationFromContact(
          contact,
          managerId,
          applicationForm.productId,
          {
            status:
              applicationForm.status,

            comment:
              applicationForm.comment,
          }
        );

    if (result.error) {
      console.error(
        "Ошибка создания заявки:",
        result.error
      );

      setApplicationFormError(
        result.error.message ||
          "Не удалось создать заявку"
      );

      setApplicationSaving(false);
      return;
    }

    if (result.alreadyExists) {
      setApplicationFormError(
        "По выбранному продукту уже существует заявка"
      );

      setApplicationSaving(false);
      return;
    }

    const productName =
      selectedProduct?.name ||
      result.data?.product ||
      "выбранному продукту";

    setApplicationSuccess(
      `Заявка по продукту "${productName}" создана`
    );

    setLastCreatedApplicationId(
      result.data?.id || null
    );

    setApplicationForm(
      emptyApplicationForm
    );

    await loadApplications();

    if (result.contact) {
      onContactChanged?.(
        result.contact
      );
    } else {
      onContactChanged?.({
        ...contact,
        status: "application",
        application_created_at:
          result.data?.created_at ||
          new Date().toISOString(),
      });
    }

    setApplicationSaving(false);
  }

  function startEditingApplication(
    application
  ) {
    setEditingApplicationId(
      application.id
    );

    setEditingForm({
      productId:
        application.product_id || "",

      status:
        application.status || "new",

      comment:
        application.comment || "",
    });

    setApplicationsError("");
    setApplicationSuccess("");
  }

  function cancelEditingApplication() {
    setEditingApplicationId(null);

    setEditingForm(
      emptyEditingForm
    );
  }

  async function saveEditingApplication(
    application
  ) {
    if (!editingForm.productId) {
      setApplicationsError(
        "Выберите продукт заявки"
      );

      return;
    }

    setApplicationSaving(true);
    setApplicationsError("");
    setApplicationSuccess("");

    const result =
      await applicationService
        .updateApplicationProgress(
          application.id,
          {
            productId:
              editingForm.productId,

            status:
              editingForm.status,

            comment:
              editingForm.comment,
          }
        );

    if (result.error) {
      console.error(
        "Ошибка изменения заявки:",
        result.error
      );

      setApplicationsError(
        result.error.message ||
          "Не удалось изменить заявку"
      );

      setApplicationSaving(false);
      return;
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === result.data.id
          ? result.data
          : item
      )
    );

    setApplicationSuccess(
      "Изменения заявки сохранены"
    );

    cancelEditingApplication();

    onContactChanged?.({
      ...contact,
      status: "application",
    });

    setApplicationSaving(false);
  }

  async function handleDeleteApplication(
    application
  ) {
    const productName =
      application.product_data?.name ||
      application.product ||
      "Без продукта";

    const confirmed =
      window.confirm(
        `Удалить заявку по продукту "${productName}"?`
      );

    if (!confirmed) {
      return;
    }

    setDeletingApplicationId(
      application.id
    );

    setApplicationsError("");
    setApplicationSuccess("");

    const result =
      await applicationService
        .deleteApplication(
          application.id
        );

    if (
      result.error &&
      !result.success
    ) {
      console.error(
        "Ошибка удаления заявки:",
        result.error
      );

      setApplicationsError(
        result.error.message ||
          "Не удалось удалить заявку"
      );

      setDeletingApplicationId(null);
      return;
    }

    const remainingApplications =
      applications.filter(
        (item) =>
          item.id !== application.id
      );

    setApplications(
      remainingApplications
    );

    setApplicationSuccess(
      "Заявка удалена"
    );

    const nextContactStatus =
      remainingApplications.length > 0
        ? "application"
        : contact.responded_at
          ? "responded"
          : contact.sent_at
            ? "sent"
            : "assigned";

    onContactChanged?.({
      ...contact,

      status:
        nextContactStatus,

      application_created_at:
        remainingApplications[0]
          ?.created_at || null,
    });

    setDeletingApplicationId(null);
  }

  function openApplication(
    applicationId
  ) {
    if (!applicationId) {
      return;
    }

    onClose?.();

    navigate(
      `/applications/${applicationId}`
    );
  }

  return (
    <div className="contact-drawer-layer">
      <button
        type="button"
        className="contact-drawer-overlay"
        onClick={onClose}
        disabled={
          actionLoading ||
          applicationSaving
        }
        aria-label="Закрыть карточку контакта"
      />

      <aside
        className="contact-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-drawer-title"
      >
        <header className="contact-drawer-header">
          <div className="contact-drawer-person">
            <div className="contact-drawer-avatar">
              {getInitials(
                contact.full_name ||
                  telegramUsername
              )}
            </div>

            <div>
              <span className="contact-drawer-eyebrow">
                Рабочая карточка
              </span>

              <h2 id="contact-drawer-title">
                {contact.full_name ||
                  (telegramUsername
                    ? `@${telegramUsername}`
                    : "") ||
                  contact.phone ||
                  "Без имени"}
              </h2>

              <span
                className={`contact-drawer-status contact-drawer-status--${
                  contact.status || "new"
                }`}
              >
                {contactStatusNames[
                  contact.status
                ] ||
                  contact.status ||
                  "Новый"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="contact-drawer-close"
            onClick={onClose}
            disabled={
              actionLoading ||
              applicationSaving
            }
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        <div className="contact-drawer-content">
          <section className="contact-drawer-quick-actions">
            <QuickAction
              icon={Phone}
              title="Позвонить"
              value={
                contact.phone ||
                "Телефон не указан"
              }
              href={
                contact.phone
                  ? `tel:${contact.phone}`
                  : null
              }
            />

            <QuickAction
              icon={Send}
              title="Открыть Telegram"
              value={
                telegramUsername
                  ? `@${telegramUsername}`
                  : "Telegram не найден"
              }
              href={telegramLink}
              external
            />
          </section>

          {/* ГЛАВНОЕ ДЕЙСТВИЕ МЕНЕДЖЕРА */}
          <section className="contact-drawer-section contact-drawer-section--create">
            <SectionHeading
              title="Создать заявку"
              description="Выберите продукт и текущий этап клиента"
              icon={FilePlus2}
            />

            <label className="contact-drawer-form-field">
              <span>Продукт *</span>

              <select
                className="contact-drawer-select"
                value={
                  applicationForm.productId
                }
                disabled={
                  applicationSaving ||
                  products.length === 0
                }
                onChange={(event) => {
                  setApplicationForm(
                    (current) => ({
                      ...current,

                      productId:
                        event.target.value,
                    })
                  );

                  setApplicationFormError("");
                  setApplicationSuccess("");
                }}
              >
                <option value="">
                  Выберите продукт
                </option>

                {products.map(
                  (product) => (
                    <option
                      key={product.id}
                      value={product.id}
                    >
                      {product.name} —{" "}
                      {formatMoney(
                        product.opening_price
                      )}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="contact-drawer-form-field">
              <span>
                Текущий статус *
              </span>

              <select
                className="contact-drawer-select"
                value={
                  applicationForm.status
                }
                disabled={
                  applicationSaving
                }
                onChange={(event) =>
                  setApplicationForm(
                    (current) => ({
                      ...current,

                      status:
                        event.target.value,
                    })
                  )
                }
              >
                {applicationStatusOptions.map(
                  (status) => (
                    <option
                      key={status.value}
                      value={status.value}
                    >
                      {status.title}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="contact-drawer-form-field">
              <span>
                Комментарий заявки
              </span>

              <textarea
                className="contact-drawer-application-textarea"
                value={
                  applicationForm.comment
                }
                maxLength={1000}
                placeholder="Например: клиент заинтересован, ожидает документы..."
                disabled={
                  applicationSaving
                }
                onChange={(event) =>
                  setApplicationForm(
                    (current) => ({
                      ...current,

                      comment:
                        event.target.value,
                    })
                  )
                }
              />
            </label>

            {selectedProduct && (
              <div className="contact-drawer-selected-product">
                <div>
                  <span>
                    Стоимость успешного открытия
                  </span>

                  <strong>
                    {formatMoney(
                      selectedProduct.opening_price
                    )}
                  </strong>
                </div>

                <CheckCircle2 size={20} />
              </div>
            )}

            {products.length === 0 && (
              <p className="contact-drawer-hint">
                Активные продукты не найдены.
                Руководителю нужно добавить
                продукты в настройках CRM.
              </p>
            )}

            {applicationFormError && (
              <div className="contact-drawer-application-error">
                <XCircle size={17} />

                <span>
                  {applicationFormError}
                </span>
              </div>
            )}

            {applicationSuccess && (
              <div className="contact-drawer-application-success">
                <CheckCircle2 size={18} />

                <div>
                  <strong>
                    {applicationSuccess}
                  </strong>

                  {lastCreatedApplicationId && (
                    <button
                      type="button"
                      onClick={() =>
                        openApplication(
                          lastCreatedApplicationId
                        )
                      }
                    >
                      Открыть заявку
                      <ArrowUpRight
                        size={15}
                      />
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              className="contact-drawer-action contact-drawer-action--application"
              disabled={
                applicationSaving ||
                !applicationForm.productId
              }
              onClick={
                handleCreateApplication
              }
            >
              <FilePlus2 size={17} />

              {applicationSaving
                ? "Создаём заявку..."
                : "Создать заявку"}
            </button>
          </section>

          {/* ИСТОРИЯ ЗАЯВОК */}
          <section className="contact-drawer-section">
            <SectionHeading
              title={`Заявки клиента (${applications.length})`}
              description="История продуктов и текущих статусов"
              icon={CheckCircle2}
            />

            {applicationsError && (
              <div className="contact-drawer-application-error">
                <XCircle size={17} />

                <span>
                  {applicationsError}
                </span>
              </div>
            )}

            {applicationsLoading ? (
              <div className="contact-drawer-applications-state">
                <LoaderCircle
                  size={22}
                  className="contact-drawer-spinner"
                />

                <span>
                  Загружаем заявки...
                </span>
              </div>
            ) : applications.length ===
              0 ? (
              <div className="contact-drawer-applications-state">
                <FilePlus2 size={26} />

                <strong>
                  Заявок пока нет
                </strong>

                <span>
                  Заполните форму выше и
                  создайте первую заявку.
                </span>
              </div>
            ) : (
              <div className="contact-drawer-applications-list">
                {applications.map(
                  (application) => {
                    const isEditing =
                      editingApplicationId ===
                      application.id;

                    const isDeleting =
                      deletingApplicationId ===
                      application.id;

                    const productPrice =
                      application
                        .product_data
                        ?.opening_price;

                    return (
                      <article
                        className="contact-drawer-application-card"
                        key={application.id}
                      >
                        {isEditing ? (
                          <div className="contact-drawer-application-edit">
                            <label>
                              <span>
                                Продукт
                              </span>

                              <select
                                value={
                                  editingForm.productId
                                }
                                disabled={
                                  applicationSaving
                                }
                                onChange={(event) =>
                                  setEditingForm(
                                    (current) => ({
                                      ...current,

                                      productId:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                              >
                                {products.map(
                                  (product) => (
                                    <option
                                      key={
                                        product.id
                                      }
                                      value={
                                        product.id
                                      }
                                    >
                                      {
                                        product.name
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </label>

                            <label>
                              <span>
                                Статус
                              </span>

                              <select
                                value={
                                  editingForm.status
                                }
                                disabled={
                                  applicationSaving
                                }
                                onChange={(event) =>
                                  setEditingForm(
                                    (current) => ({
                                      ...current,

                                      status:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                              >
                                {applicationStatusOptions.map(
                                  (status) => (
                                    <option
                                      key={
                                        status.value
                                      }
                                      value={
                                        status.value
                                      }
                                    >
                                      {
                                        status.title
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </label>

                            <label>
                              <span>
                                Комментарий
                              </span>

                              <textarea
                                value={
                                  editingForm.comment
                                }
                                disabled={
                                  applicationSaving
                                }
                                placeholder="Комментарий заявки"
                                onChange={(event) =>
                                  setEditingForm(
                                    (current) => ({
                                      ...current,

                                      comment:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                              />
                            </label>

                            <div className="contact-drawer-application-edit-actions">
                              <button
                                type="button"
                                onClick={
                                  cancelEditingApplication
                                }
                                disabled={
                                  applicationSaving
                                }
                              >
                                Отмена
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  saveEditingApplication(
                                    application
                                  )
                                }
                                disabled={
                                  applicationSaving
                                }
                              >
                                <Save size={15} />

                                {applicationSaving
                                  ? "Сохраняем..."
                                  : "Сохранить"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="contact-drawer-application-card__top">
                              <div>
                                <strong>
                                  {application
                                    .product_data
                                    ?.name ||
                                    application.product ||
                                    "Без продукта"}
                                </strong>

                                <span>
                                  Создана:{" "}
                                  {formatDate(
                                    application.created_at
                                  )}
                                </span>
                              </div>

                              <span
                                className={`contact-drawer-application-status contact-drawer-application-status--${application.status}`}
                              >
                                {getApplicationStatusName(
                                  application.status
                                )}
                              </span>
                            </div>

                            <div className="contact-drawer-application-meta">
                              <div>
                                <span>
                                  Стоимость открытия
                                </span>

                                <strong>
                                  {productPrice ===
                                    null ||
                                  productPrice ===
                                    undefined
                                    ? "Не указана"
                                    : formatMoney(
                                        productPrice
                                      )}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  Обновлена
                                </span>

                                <strong>
                                  {formatDate(
                                    application.updated_at
                                  )}
                                </strong>
                              </div>
                            </div>

                            {application.comment && (
                              <p className="contact-drawer-application-comment">
                                {
                                  application.comment
                                }
                              </p>
                            )}

                            <div className="contact-drawer-application-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  startEditingApplication(
                                    application
                                  )
                                }
                              >
                                <Pencil size={15} />
                                Редактировать
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openApplication(
                                    application.id
                                  )
                                }
                              >
                                <ArrowUpRight
                                  size={15}
                                />
                                Открыть
                              </button>

                              <button
                                type="button"
                                className="contact-drawer-application-delete"
                                onClick={() =>
                                  handleDeleteApplication(
                                    application
                                  )
                                }
                                disabled={
                                  isDeleting
                                }
                              >
                                <Trash2 size={15} />

                                {isDeleting
                                  ? "Удаляем..."
                                  : "Удалить"}
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            )}
          </section>

          {/* КРАТКИЕ ДАННЫЕ КОНТАКТА */}
          <section className="contact-drawer-section">
            <SectionHeading
              title="Контактные данные"
              description="Информация из общей базы рассылки"
              icon={UserRound}
            />

            <InfoRow
              icon={Phone}
              label="Телефон"
              value={
                contact.phone ||
                "Телефон не указан"
              }
            />

            <InfoRow
              icon={Mail}
              label="Email"
              value={
                contact.email ||
                "Email не указан"
              }
            />

            <InfoRow
              icon={Send}
              label="Telegram"
              value={
                telegramUsername
                  ? `@${telegramUsername}`
                  : "Telegram не найден"
              }
            />
          </section>

          {/* КОММЕНТАРИЙ КОНТАКТА */}
          <section className="contact-drawer-section">
            <div className="contact-drawer-section-heading">
              <div>
                <h3>
                  Общий комментарий
                </h3>

                <p>
                  Информация, относящаяся ко
                  всему контакту
                </p>
              </div>

              <span>
                {commentValue.length}/1000
              </span>
            </div>

            <div className="contact-drawer-comment-wrapper">
              <MessageCircle size={18} />

              <textarea
                className="contact-drawer-comment"
                value={commentValue}
                maxLength={1000}
                placeholder="Общая информация по клиенту..."
                disabled={actionLoading}
                onChange={(event) =>
                  setCommentValue(
                    event.target.value
                  )
                }
              />
            </div>

            <button
              type="button"
              className="contact-drawer-save-comment"
              disabled={
                actionLoading ||
                !commentChanged
              }
              onClick={() =>
                onSaveComment?.(
                  contact,
                  commentValue
                )
              }
            >
              <Save size={17} />

              {actionLoading
                ? "Сохраняем..."
                : "Сохранить комментарий"}
            </button>
          </section>

          {/* ТОЛЬКО ДЛЯ РУКОВОДИТЕЛЯ */}
          {canManageContacts && (
            <section className="contact-drawer-section">
              <SectionHeading
                title="Ответственный менеджер"
                description="Доступно только руководителю и администратору"
                icon={UserRound}
              />

              <select
                className="contact-drawer-select"
                value={managerValue}
                disabled={actionLoading}
                onChange={(event) =>
                  setManagerValue(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Не назначен
                </option>

                {managers.map(
                  (manager) => (
                    <option
                      key={manager.id}
                      value={manager.id}
                    >
                      {manager.full_name ||
                        manager.email ||
                        "Без имени"}
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                className="contact-drawer-save-comment"
                disabled={
                  actionLoading ||
                  !managerChanged
                }
                onClick={() =>
                  onAssignManager?.(
                    contact,
                    managerValue || null
                  )
                }
              >
                <Save size={17} />

                {actionLoading
                  ? "Сохраняем..."
                  : managerValue
                    ? "Сохранить менеджера"
                    : "Снять назначение"}
              </button>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function SectionHeading({
  title,
  description,
  icon: Icon,
}) {
  return (
    <div className="contact-drawer-section-heading">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <Icon size={18} />
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  value,
  href,
  external = false,
}) {
  const content = (
    <>
      <div className="contact-drawer-quick-action__icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>

      {href && (
        <ExternalLink size={15} />
      )}
    </>
  );

  if (!href) {
    return (
      <div className="contact-drawer-quick-action contact-drawer-quick-action--disabled">
        {content}
      </div>
    );
  }

  return (
    <a
      className="contact-drawer-quick-action"
      href={href}
      target={
        external
          ? "_blank"
          : undefined
      }
      rel={
        external
          ? "noreferrer"
          : undefined
      }
    >
      {content}
    </a>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="contact-drawer-info">
      <div className="contact-drawer-info-icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function normalizeTelegramUsername(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "");
}

function getInitials(value) {
  if (!value) {
    return "К";
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getApplicationStatusName(
  status
) {
  return (
    applicationStatusOptions.find(
      (item) =>
        item.value === status
    )?.title ||
    status ||
    "Не указан"
  );
}

function formatDate(value) {
  if (!value) {
    return "Не указано";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }
  ).format(Number(value || 0));
}