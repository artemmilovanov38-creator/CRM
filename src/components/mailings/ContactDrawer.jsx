import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  getApplicationOpenedAt,
  getApplicationPayout,
} from "../../services/applicationService";
import { incomingResponseService } from "../../services/incomingResponseService";
import { formatServiceError } from "../../utils/serviceError";
import { formatTelegramDisplay, getTelegramHref } from "../../utils/telegram";
import { productHintLabel } from "../../utils/sharedContact";
import { isoToDateInput, todayDateInput } from "../../utils/periodRange";
import { getApplicationDateForm } from "../../utils/applicationDates";
import ApplicationEventDatesFields, {
  ApplicationEventDatesView,
} from "../applications/ApplicationEventDates";

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

function getCreateApplicationForm(contact) {
  const dates = getApplicationDateForm({
    created_at: null,
    mailing_contact:
      contact?.shared_existing ||
      contact?.owned_by_me === false
        ? null
        : contact,
  });

  return {
    productId: "",
    status: "in_progress",
    comment: "",
    ppId: "",
    wroteOn:
      dates.wrote_on || todayDateInput(),
    submittedOn: todayDateInput(),
    openedOn: todayDateInput(),
  };
}

function createSubmitKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `submit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEmptyEditingForm() {
  return {
    productId: "",
    status: "new",
    comment: "",
    ppId: "",
    wroteOn: "",
    submittedOn: "",
    openedOn: "",
  };
}

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

  const canEditThisContact =
    canManageContacts ||
    contact?.owned_by_me === true ||
    (
      contact?.owned_by_me !== false &&
      !contact?.shared_existing &&
      (
        !contact?.manager_id ||
        contact.manager_id === currentProfile?.id
      )
    );

  const [
    applications,
    setApplications,
  ] = useState([]);

  const [productHints, setProductHints] =
    useState([]);

  const [serverAsksConfirm, setServerAsksConfirm] =
    useState(false);

  const submitKeyRef = useRef("");

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
    getCreateApplicationForm(contact)
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
    isCreateFormOpen,
    setIsCreateFormOpen,
  ] = useState(false);

  const [
    editingApplicationId,
    setEditingApplicationId,
  ] = useState(null);

  const [
    editingForm,
    setEditingForm,
  ] = useState(
    getEmptyEditingForm()
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

  const [contactWroteOn, setContactWroteOn] =
    useState("");

  const [savingWroteOn, setSavingWroteOn] =
    useState(false);

  const loadApplications = useCallback(
    async () => {
      if (!contact?.id) {
        setApplications([]);
        return;
      }

      setApplicationsLoading(true);
      setApplicationsError("");

      const [result, hintsResult] =
        await Promise.all([
          applicationService
            .getApplicationsByContactId(
              contact.id
            ),
          applicationService
            .listContactProductHints(
              contact.id
            ),
        ]);

      setProductHints(
        hintsResult.data ||
          contact.products ||
          []
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
        setIsCreateFormOpen(true);
      } else {
        const nextApplications =
          result.data || [];

        setApplications(
          nextApplications
        );

        setIsCreateFormOpen(
          nextApplications.length === 0
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

    setContactWroteOn(
      isoToDateInput(contact.responded_at) ||
        todayDateInput()
    );

    setApplicationForm(
      getCreateApplicationForm(contact)
    );

    setIsCreateFormOpen(
      Array.isArray(contact.applications) &&
        contact.applications.length === 0
    );

    setEditingApplicationId(null);
    setEditingForm(
      getEmptyEditingForm()
    );

    setApplicationFormError("");
    setApplicationsError("");
    setApplicationSuccess("");
    setLastCreatedApplicationId(null);
    setProductHints(contact.products || []);
    setServerAsksConfirm(false);
    submitKeyRef.current = createSubmitKey();
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

  const usedProductIds = useMemo(
    () =>
      new Set(
        [
          ...applications.map((item) =>
            String(item.product_id || "")
          ),
          ...productHints.map((item) =>
            String(item.product_id || "")
          ),
        ].filter(Boolean)
      ),
    [applications, productHints]
  );

  const existingProductNames = useMemo(
    () =>
      productHintLabel([
        ...productHints,
        ...applications.map((item) => ({
          product_id: item.product_id,
          product_name:
            item.product_data?.name ||
            item.product,
        })),
      ]),
    [applications, productHints]
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
    formatTelegramDisplay(
      contact.telegram_username ||
        contact.full_name,
      false
    );

  const telegramLink = getTelegramHref(
    contact.telegram_username ||
      contact.full_name
  );

  async function handleCreateApplication() {
    if (
      !applicationForm.productId
    ) {
      setApplicationFormError(
        "Выберите продукт"
      );

      return;
    }

    const sameProductExists = usedProductIds.has(
      String(applicationForm.productId)
    );

    if (
      applicationForm.status === "approved" &&
      !applicationForm.openedOn
    ) {
      setApplicationFormError(
        "Укажите дату «Когда успешно открыта». Именно она идёт в зарплату."
      );

      return;
    }

    const managerId =
      currentProfile?.id || null;

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

            pp_id:
              applicationForm.ppId,

            submitted_on:
              applicationForm.submittedOn,

            opened_on:
              applicationForm.status ===
              "approved"
                ? applicationForm.openedOn
                : undefined,

            wrote_on:
              applicationForm.wroteOn,

            confirmDuplicate:
              sameProductExists ||
              serverAsksConfirm,

            submitKey:
              submitKeyRef.current,
          }
        );

    if (result.needsConfirmation) {
      setServerAsksConfirm(true);
      setApplicationFormError(
        `По продукту "${selectedProduct?.name || "выбранному продукту"}" уже есть заявка. Подтвердите, если это отдельная сделка: старая заявка не изменится.`
      );
      setApplicationSaving(false);
      return;
    }

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
      getCreateApplicationForm(contact)
    );

    setIsCreateFormOpen(false);

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

    submitKeyRef.current = createSubmitKey();
    setServerAsksConfirm(false);
    setApplicationSaving(false);
  }

  function startEditingApplication(
    application
  ) {
    setEditingApplicationId(
      application.id
    );

    setIsCreateFormOpen(false);

    const dates = getApplicationDateForm({
      ...application,
      mailing_contact: contact,
    });

    setEditingForm({
      productId:
        application.product_id || "",

      status:
        application.status || "new",

      comment:
        application.comment || "",

      ppId:
        application.pp_id || "",

      wroteOn: dates.wrote_on,
      submittedOn: dates.submitted_on,
      openedOn:
        dates.opened_on || todayDateInput(),
    });

    setApplicationsError("");
    setApplicationSuccess("");
  }

  function cancelEditingApplication() {
    setEditingApplicationId(null);

    setEditingForm(
      getEmptyEditingForm()
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

    if (
      editingForm.status === "approved" &&
      !editingForm.openedOn
    ) {
      setApplicationsError(
        "Укажите дату «Когда успешно открыта». Именно она идёт в зарплату."
      );

      return;
    }

    setApplicationSaving(true);
    setApplicationsError("");
    setApplicationSuccess("");

    const updates = {
      status: editingForm.status,
      comment: editingForm.comment,
      ppId: editingForm.ppId,
      submittedOn: editingForm.submittedOn,
      wroteOn: editingForm.wroteOn,
      openedOn:
        editingForm.status === "approved"
          ? editingForm.openedOn
          : undefined,
    };

    if (
      editingForm.productId &&
      String(editingForm.productId) !==
        String(application.product_id || "")
    ) {
      updates.productId =
        editingForm.productId;
    }

    const result =
      await applicationService
        .updateApplicationProgress(
          application.id,
          updates
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

    await loadApplications();

    onContactChanged?.({
      ...contact,
      status: "application",
    });

    setApplicationSaving(false);
  }

  async function handleQuickStatusChange(
    application,
    nextStatus
  ) {
    if (
      !application?.id ||
      !nextStatus ||
      nextStatus === application.status
    ) {
      return;
    }

    if (nextStatus === "approved") {
      const dates = getApplicationDateForm({
        ...application,
        mailing_contact: contact,
      });

      setEditingApplicationId(application.id);
      setIsCreateFormOpen(false);
      setEditingForm({
        productId: application.product_id || "",
        status: "approved",
        comment: application.comment || "",
        ppId: application.pp_id || "",
        wroteOn:
          dates.wrote_on || contactWroteOn,
        submittedOn: dates.submitted_on,
        openedOn:
          dates.opened_on || todayDateInput(),
      });
      setApplicationSuccess(
        "Укажите дату «Когда успешно открыта» и нажмите «Сохранить». В зарплату пойдёт этот день."
      );
      return;
    }

    setApplicationSaving(true);
    setApplicationsError("");
    setApplicationSuccess("");
    setApplicationFormError("");

    const result =
      await applicationService
        .updateStatus(
          application.id,
          nextStatus
        );

    if (result.error) {
      console.error(
        "Ошибка изменения статуса:",
        result.error
      );

      setApplicationsError(
        result.error.message ||
          "Не удалось изменить статус"
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
      "Статус заявки обновлён"
    );

    onContactChanged?.({
      ...contact,
      status: "application",
    });

    setApplicationSaving(false);
  }

  async function handleContactWroteOnChange(nextDate) {
    setContactWroteOn(nextDate);

    if (!contact?.id || !nextDate) {
      return;
    }

    setSavingWroteOn(true);
    setApplicationsError("");

    const result =
      await incomingResponseService.updateRespondedAt(
        contact.id,
        nextDate
      );

    if (result.error) {
      setApplicationsError(
        formatServiceError(
          result.error,
          "Не удалось сохранить дату «когда написал»"
        )
      );
      setSavingWroteOn(false);
      return;
    }

    onContactChanged?.(result.data || {
      ...contact,
      responded_at: result.data?.responded_at,
    });
    setSavingWroteOn(false);
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

    setIsCreateFormOpen(
      remainingApplications.length === 0
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

  function openCreateForm() {
    setEditingApplicationId(null);
    setEditingForm(getEmptyEditingForm());
    setApplicationForm(
      getCreateApplicationForm(contact)
    );
    setApplicationFormError("");
    setApplicationSuccess("");
    setLastCreatedApplicationId(null);
    setIsCreateFormOpen(true);
  }

  function closeCreateForm() {
    setApplicationForm(
      getCreateApplicationForm(contact)
    );
    setApplicationFormError("");
    setIsCreateFormOpen(false);
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
          {(contact.shared_existing ||
            contact.owned_by_me === false) && (
            <div className="contact-drawer-shared-notice">
              Контакт уже есть в CRM. Можно создать новую заявку.
            </div>
          )}

          {existingProductNames.length > 0 && (
            <div className="contact-drawer-shared-notice">
              Уже есть продукты:{" "}
              {existingProductNames.join(", ")}.
              Новая заявка не изменит старые.
            </div>
          )}

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

          {canEditThisContact && (
          <section className="contact-drawer-section">
            <label className="contact-drawer-form-field">
              <span>Когда человек написал</span>
              <input
                className="contact-drawer-select"
                type="date"
                value={contactWroteOn}
                max={todayDateInput()}
                disabled={
                  actionLoading || savingWroteOn
                }
                onChange={(event) =>
                  handleContactWroteOnChange(
                    event.target.value
                  )
                }
              />
              <small>
                Общая дата входящего. Для конверсии, не
                для зарплаты.
              </small>
            </label>
          </section>
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

          {applications.length > 0 &&
            !isCreateFormOpen && (
              <button
                type="button"
                className="contact-drawer-action contact-drawer-action--application"
                disabled={
                  applicationSaving ||
                  products.length === 0
                }
                onClick={openCreateForm}
              >
                <FilePlus2 size={17} />
                Создать ещё заявку
              </button>
            )}

          {isCreateFormOpen && (
          <section className="contact-drawer-section contact-drawer-section--create">
            <SectionHeading
              title={
                applications.length > 0
                  ? "Добавить продукт"
                  : "Создать заявку"
              }
              description="Откроется пустая форма новой заявки. Существующие заявки не изменятся."
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
                  setServerAsksConfirm(false);
                }}
              >
                <option value="">
                  Выберите продукт
                </option>

                {products.map(
                  (product) => {
                    const alreadyUsed =
                      usedProductIds.has(
                        String(product.id)
                      );

                    return (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name} —{" "}
                        {formatMoney(
                          product.opening_price
                        )}
                        {alreadyUsed
                          ? " (уже есть заявка)"
                          : ""}
                      </option>
                    );
                  }
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
                    (current) => {
                      const nextStatus =
                        event.target.value;

                      return {
                        ...current,
                        status: nextStatus,
                        openedOn:
                          nextStatus ===
                            "approved" &&
                          !current.openedOn
                            ? todayDateInput()
                            : current.openedOn,
                      };
                    }
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

            <ApplicationEventDatesFields
              wroteOn={applicationForm.wroteOn}
              submittedOn={applicationForm.submittedOn}
              openedOn={applicationForm.openedOn}
              status={applicationForm.status}
              disabled={applicationSaving}
              onWroteChange={(value) =>
                setApplicationForm((current) => ({
                  ...current,
                  wroteOn: value,
                }))
              }
              onSubmittedChange={(value) =>
                setApplicationForm((current) => ({
                  ...current,
                  submittedOn: value,
                }))
              }
              onOpenedChange={(value) =>
                setApplicationForm((current) => ({
                  ...current,
                  openedOn: value,
                }))
              }
            />

            <label className="contact-drawer-form-field">
              <span>ID ПП</span>

              <input
                className="contact-drawer-select"
                type="text"
                inputMode="numeric"
                value={
                  applicationForm.ppId
                }
                placeholder="Введите цифры вручную"
                disabled={
                  applicationSaving
                }
                onChange={(event) =>
                  setApplicationForm(
                    (current) => ({
                      ...current,

                      ppId:
                        event.target.value.replace(
                          /\D/g,
                          ""
                        ),
                    })
                  )
                }
              />
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

            {(usedProductIds.has(
              String(applicationForm.productId)
            ) ||
              serverAsksConfirm) && (
              <div className="contact-drawer-application-warning">
                По этому продукту уже есть заявка.
                Новая создастся отдельно и не
                изменит старую. Нажмите
                «Подтвердить и создать», если это
                другая сделка.
              </div>
            )}

            {applicationFormError && (
              <div className="contact-drawer-application-error">
                <XCircle size={17} />

                <span>
                  {applicationFormError}
                </span>
              </div>
            )}

            <div className="contact-drawer-create-actions">
              {applications.length > 0 && (
                <button
                  type="button"
                  className="contact-drawer-save-comment"
                  disabled={
                    applicationSaving
                  }
                  onClick={
                    closeCreateForm
                  }
                >
                  Отмена
                </button>
              )}

              <button
                type="button"
                className="contact-drawer-action contact-drawer-action--application"
                disabled={
                  applicationSaving ||
                  !applicationForm.productId ||
                  products.length === 0
                }
                onClick={
                  handleCreateApplication
                }
              >
                <FilePlus2 size={17} />

                {applicationSaving
                  ? "Создаём заявку..."
                  : usedProductIds.has(
                        String(
                          applicationForm.productId
                        )
                      ) || serverAsksConfirm
                    ? "Подтвердить и создать"
                    : applications.length > 0
                      ? "Создать ещё заявку"
                      : "Создать заявку"}
              </button>
            </div>
          </section>
          )}

          {/* ИСТОРИЯ ЗАЯВОК */}
          <section className="contact-drawer-section">
            <SectionHeading
              title={`Заявки клиента (${applications.length})`}
              description={
                canManageContacts
                  ? "Все заявки этого контакта. У каждой свой продукт, статус и менеджер."
                  : "Здесь только ваши заявки. Чужие сделки нельзя изменить или удалить."
              }
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
                      getApplicationPayout(
                        application
                      );

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
                                    (current) => {
                                      const nextStatus =
                                        event.target.value;

                                      return {
                                        ...current,
                                        status:
                                          nextStatus,
                                        openedOn:
                                          nextStatus ===
                                            "approved" &&
                                          !current.openedOn
                                            ? todayDateInput()
                                            : current.openedOn,
                                      };
                                    }
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

                            <ApplicationEventDatesFields
                              wroteOn={editingForm.wroteOn}
                              submittedOn={
                                editingForm.submittedOn
                              }
                              openedOn={editingForm.openedOn}
                              status={editingForm.status}
                              disabled={applicationSaving}
                              onWroteChange={(value) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  wroteOn: value,
                                }))
                              }
                              onSubmittedChange={(value) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  submittedOn: value,
                                }))
                              }
                              onOpenedChange={(value) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  openedOn: value,
                                }))
                              }
                            />

                            <label>
                              <span>
                                ID ПП
                              </span>

                              <input
                                type="text"
                                inputMode="numeric"
                                value={
                                  editingForm.ppId
                                }
                                disabled={
                                  applicationSaving
                                }
                                placeholder="Введите цифры вручную"
                                onChange={(event) =>
                                  setEditingForm(
                                    (current) => ({
                                      ...current,

                                      ppId:
                                        event.target.value.replace(
                                          /\D/g,
                                          ""
                                        ),
                                    })
                                  )
                                }
                              />
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
                                  ID заявки:{" "}
                                  {application.id}
                                </span>
                              </div>

                              <select
                                className={`contact-drawer-application-status-select contact-drawer-application-status--${application.status}`}
                                value={
                                  application.status ===
                                  "waiting"
                                    ? "new"
                                    : application.status
                                }
                                disabled={
                                  applicationSaving ||
                                  isDeleting
                                }
                                aria-label="Изменить статус заявки"
                                onChange={(event) =>
                                  handleQuickStatusChange(
                                    application,
                                    event.target.value
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
                            </div>

                            <div className="contact-drawer-application-meta">
                              <div>
                                <span>
                                  Стоимость / выплата
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
                                  ID ПП
                                </span>

                                <strong>
                                  {application.pp_id ||
                                    "Не указан"}
                                </strong>
                              </div>
                            </div>

                            <ApplicationEventDatesView
                              wroteAt={
                                contact.responded_at
                              }
                              submittedAt={
                                application.created_at
                              }
                              openedAt={getApplicationOpenedAt(
                                application
                              )}
                              status={application.status}
                            />

                            <p className="contact-drawer-application-comment">
                              {application.comment ||
                                "Комментарий не указан"}
                            </p>

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
                                Открыть и редактировать
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
                                Полная карточка
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

            {(canEditThisContact || contact.email) && (
              <InfoRow
                icon={Mail}
                label="Email"
                value={
                  contact.email ||
                  "Email не указан"
                }
              />
            )}

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

          {canEditThisContact && (
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
          )}

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