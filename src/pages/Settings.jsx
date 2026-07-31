import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Bell,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Database,
  Download,
  KeyRound,
  Mail,
  MessageSquare,
  Save,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
  CirclePlus,
Pencil,
Power,
Trash2,
X,
} from "lucide-react";

import { productService } from "../services/productService";

const settingsSections = [
  {
    id: "general",
    title: "Общие",
    description: "Название, контакты и параметры CRM",
    icon: Settings2,
  },
  {
    id: "salaries",
    title: "Ставки",
    description: "Стоимость продуктов и расчёт зарплаты",
    icon: WalletCards,
  },
  {
    id: "roles",
    title: "Роли и права",
    description: "Доступ сотрудников к разделам CRM",
    icon: Users,
  },
  {
    id: "integrations",
    title: "Интеграции",
    description: "Telegram, Supabase, SMTP и Webhook",
    icon: Bot,
  },
  {
    id: "mailings",
    title: "Рассылки",
    description: "Лимиты, интервалы и автоматизация",
    icon: MessageSquare,
  },
  {
    id: "notifications",
    title: "Уведомления",
    description: "Каналы и типы уведомлений",
    icon: Bell,
  },
  {
    id: "security",
    title: "Безопасность",
    description: "Пароли, 2FA и активные сессии",
    icon: ShieldCheck,
  },
  {
    id: "database",
    title: "Данные",
    description: "Импорт, экспорт и резервные копии",
    icon: Database,
  },
];

const initialSettings = {
  general: {
    crmName: "CRM Stats",
    companyName: "BonusTest",
    supportEmail: "support@bonustest.ru",
    supportTelegram: "@BonusTestSupport",
    timezone: "Europe/Moscow",
  },

  

  integrations: {
    telegramBotToken: "",
    supabaseUrl: "",
    supabaseKey: "",
    webhookUrl: "",
    smtpHost: "",
    smtpPort: "587",
  },

  mailings: {
    dailyLimit: 5000,
    batchSize: 100,
    intervalSeconds: 30,
    pauseMinutes: 10,
    autoPause: true,
  },

  notifications: {
    telegram: true,
    email: true,
    push: false,
    sound: true,
    newApplication: true,
    applicationApproved: true,
    mailingCompleted: true,
    managerInactive: false,
  },

  security: {
    twoFactor: false,
    autoLogout: true,
    sessionMinutes: 120,
    loginNotifications: true,
    ipWhitelist: false,
  },
};

const initialRoles = [
  {
    id: 1,
    title: "Администратор",
    description: "Полный доступ ко всем разделам и настройкам",
    permissions: {
      salaries: true,
      mailings: true,
      deleteApplications: true,
      manageUsers: true,
      reports: true,
      settings: true,
    },
  },
  {
    id: 2,
    title: "Руководитель",
    description: "Контроль команды, отчётов и зарплат",
    permissions: {
      salaries: true,
      mailings: true,
      deleteApplications: true,
      manageUsers: false,
      reports: true,
      settings: false,
    },
  },
  {
    id: 3,
    title: "Менеджер",
    description: "Работа с заявками и клиентами",
    permissions: {
      salaries: false,
      mailings: false,
      deleteApplications: false,
      manageUsers: false,
      reports: false,
      settings: false,
    },
  },
  {
    id: 4,
    title: "Стажёр",
    description: "Ограниченный доступ к назначенным заявкам",
    permissions: {
      salaries: false,
      mailings: false,
      deleteApplications: false,
      manageUsers: false,
      reports: false,
      settings: false,
    },
  },
];

const permissionsList = [
  {
    id: "salaries",
    title: "Просмотр зарплат",
  },
  {
    id: "mailings",
    title: "Управление рассылками",
  },
  {
    id: "deleteApplications",
    title: "Удаление заявок",
  },
  {
    id: "manageUsers",
    title: "Управление пользователями",
  },
  {
    id: "reports",
    title: "Просмотр отчётов",
  },
  {
    id: "settings",
    title: "Изменение настроек",
  },
];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      className={
        checked
          ? "settings-toggle settings-toggle--active"
          : "settings-toggle"
      }
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
const initialProductForm = {
  name: "",
  description: "",
  opening_price: "",
  is_active: true,
};

export default function Settings() {
  const [activeSection, setActiveSection] = useState("general");
  const [settings, setSettings] = useState(initialSettings);
  const [roles, setRoles] = useState(initialRoles);
  const [saved, setSaved] = useState(false);
  const [products, setProducts] =
  useState([]);

const [productsLoading, setProductsLoading] =
  useState(true);

const [productsError, setProductsError] =
  useState("");

const [productModalOpen, setProductModalOpen] =
  useState(false);

const [editingProduct, setEditingProduct] =
  useState(null);

const [productForm, setProductForm] =
  useState(initialProductForm);

const [productSaving, setProductSaving] =
  useState(false);

const [productFormError, setProductFormError] =
  useState("");

 

  function updateSetting(section, field, value) {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  }

  function updatePermission(roleId, permission, value) {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === roleId
          ? {
              ...role,
              permissions: {
                ...role.permissions,
                [permission]: value,
              },
            }
          : role
      )
    );
  }

  function saveSettings() {
    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 2500);
  }


  const loadProducts = useCallback(async () => {
  setProductsLoading(true);
  setProductsError("");

  const { data, error } =
    await productService.getProducts();

  if (error) {
    console.error(
      "Ошибка загрузки продуктов:",
      error
    );

    setProductsError(
      error.message ||
        "Не удалось загрузить продукты"
    );

    setProducts([]);
    setProductsLoading(false);
    return;
  }

  setProducts(data || []);
  setProductsLoading(false);
}, []);

useEffect(() => {
  loadProducts();
}, [loadProducts]);

function openCreateProductModal() {
  setEditingProduct(null);

  setProductForm(
    initialProductForm
  );

  setProductFormError("");
  setProductModalOpen(true);
}

function openEditProductModal(product) {
  setEditingProduct(product);

  setProductForm({
    name: product.name || "",

    description:
      product.description || "",

    opening_price:
      product.opening_price ?? "",

    is_active:
      product.is_active !== false,
  });

  setProductFormError("");
  setProductModalOpen(true);
}

function closeProductModal() {
  if (productSaving) {
    return;
  }

  setProductModalOpen(false);
  setEditingProduct(null);
  setProductForm(initialProductForm);
  setProductFormError("");
}

function handleProductFormChange(event) {
  const {
    name,
    value,
    type,
    checked,
  } = event.target;

  setProductForm((current) => ({
    ...current,

    [name]:
      type === "checkbox"
        ? checked
        : value,
  }));
}

async function handleSaveProduct(event) {
  event.preventDefault();

  const name =
    productForm.name.trim();

  const openingPrice = Number(
    productForm.opening_price
  );

  if (!name) {
    setProductFormError(
      "Введите название продукта"
    );

    return;
  }

  if (
    productForm.opening_price === "" ||
    !Number.isFinite(openingPrice) ||
    openingPrice < 0
  ) {
    setProductFormError(
      "Стоимость открытия должна быть числом от 0"
    );

    return;
  }

  setProductSaving(true);
  setProductFormError("");

  const values = {
    name,

    description:
      productForm.description.trim() ||
      null,

    opening_price: openingPrice,

    is_active:
      Boolean(productForm.is_active),
  };

  const result = editingProduct
    ? await productService.updateProduct(
        editingProduct.id,
        values
      )
    : await productService.createProduct(
        values
      );

  if (result.error) {
    console.error(
      "Ошибка сохранения продукта:",
      result.error
    );

    setProductFormError(
      result.error.message ||
        "Не удалось сохранить продукт"
    );

    setProductSaving(false);
    return;
  }

  await loadProducts();

  setProductSaving(false);
  closeProductModal();
}

async function handleToggleProduct(product) {
  const result =
    await productService.setProductActive(
      product.id,
      !product.is_active
    );

  if (result.error) {
    window.alert(
      result.error.message ||
        "Не удалось изменить статус продукта"
    );

    return;
  }

  setProducts((current) =>
    current.map((item) =>
      item.id === product.id
        ? result.data
        : item
    )
  );
}

async function handleDeleteProduct(product) {
  const confirmed = window.confirm(
    `Удалить продукт "${product.name}"?\n\nЕсли он используется в заявках, Supabase может запретить удаление. В таком случае продукт лучше отключить.`
  );

  if (!confirmed) {
    return;
  }

  const result =
    await productService.deleteProduct(
      product.id
    );

  if (result.error) {
    console.error(
      "Ошибка удаления продукта:",
      result.error
    );

    window.alert(
      result.error.message ||
        "Не удалось удалить продукт. Возможно, он уже используется в заявках."
    );

    return;
  }

  setProducts((current) =>
    current.filter(
      (item) =>
        item.id !== product.id
    )
  );
}
  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Настройки</h1>

          <p className="page-description">
            Управление параметрами CRM, ролями, интеграциями и безопасностью
          </p>
        </div>

        <button
          className={
            saved
              ? "primary-button settings-save-button settings-save-button--saved"
              : "primary-button settings-save-button"
          }
          type="button"
          onClick={saveSettings}
        >
          {saved ? <Check size={17} /> : <Save size={17} />}

          <span>{saved ? "Сохранено" : "Сохранить изменения"}</span>
        </button>
      </div>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-heading">
            <span>Разделы</span>
          </div>

          <nav className="settings-navigation">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <button
                  className={
                    isActive
                      ? "settings-navigation-item settings-navigation-item--active"
                      : "settings-navigation-item"
                  }
                  type="button"
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                >
                  <div className="settings-navigation-icon">
                    <Icon size={17} />
                  </div>

                  <div>
                    <strong>{section.title}</strong>
                    <span>{section.description}</span>
                  </div>

                  <ChevronRight size={15} />
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="settings-content">
          {activeSection === "general" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon">
                  <Building2 size={20} />
                </div>

                <div>
                  <h2>Общие настройки</h2>
                  <p>
                    Основная информация о компании и системе
                  </p>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Название CRM</span>

                  <input
                    type="text"
                    value={settings.general.crmName}
                    onChange={(event) =>
                      updateSetting(
                        "general",
                        "crmName",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Название компании</span>

                  <input
                    type="text"
                    value={settings.general.companyName}
                    onChange={(event) =>
                      updateSetting(
                        "general",
                        "companyName",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Email поддержки</span>

                  <input
                    type="email"
                    value={settings.general.supportEmail}
                    onChange={(event) =>
                      updateSetting(
                        "general",
                        "supportEmail",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Telegram поддержки</span>

                  <input
                    type="text"
                    value={settings.general.supportTelegram}
                    onChange={(event) =>
                      updateSetting(
                        "general",
                        "supportTelegram",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="settings-field settings-field--wide">
                  <span>Часовой пояс</span>

                  <select
                    value={settings.general.timezone}
                    onChange={(event) =>
                      updateSetting(
                        "general",
                        "timezone",
                        event.target.value
                      )
                    }
                  >
                    <option value="Europe/Moscow">
                      Москва — UTC+3
                    </option>

                    <option value="Asia/Yekaterinburg">
                      Екатеринбург — UTC+5
                    </option>

                    <option value="Asia/Novosibirsk">
                      Новосибирск — UTC+7
                    </option>

                    <option value="Europe/Amsterdam">
                      Амстердам — UTC+1
                    </option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {activeSection === "salaries" && (
  <div className="settings-panel">
    <div className="settings-panel-heading">
      <div className="settings-panel-icon settings-panel-icon--green">
        <WalletCards size={20} />
      </div>

      <div>
        <h2>
          Продукты и ставки
        </h2>

        <p>
          Стоимость одного успешного
          открытия по каждому продукту
        </p>
      </div>
    </div>

    <div className="settings-products-toolbar">
      <div>
        <strong>
          Список продуктов
        </strong>

        <span>
          Активные продукты доступны
          менеджерам при создании заявки
        </span>
      </div>

      <button
        className="primary-button button-with-icon"
        type="button"
        onClick={openCreateProductModal}
      >
        <CirclePlus size={17} />
        Добавить продукт
      </button>
    </div>

    {productsError && (
      <div className="settings-products-error">
        <span>{productsError}</span>

        <button
          type="button"
          onClick={loadProducts}
        >
          Повторить
        </button>
      </div>
    )}

    {productsLoading ? (
      <div className="settings-products-state">
        Загружаем продукты...
      </div>
    ) : products.length === 0 ? (
      <div className="settings-products-state">
        <WalletCards size={32} />

        <strong>
          Продуктов пока нет
        </strong>

        <span>
          Добавьте первый продукт и
          укажите стоимость открытия.
        </span>

        <button
          className="primary-button button-with-icon"
          type="button"
          onClick={openCreateProductModal}
        >
          <CirclePlus size={17} />
          Добавить продукт
        </button>
      </div>
    ) : (
      <div className="settings-products-list">
        {products.map((product) => (
          <article
            className={
              product.is_active
                ? "settings-product-card"
                : "settings-product-card settings-product-card--inactive"
            }
            key={product.id}
          >
            <div className="settings-product-main">
              <div className="settings-product-icon">
                <WalletCards size={19} />
              </div>

              <div>
                <div className="settings-product-title">
                  <strong>
                    {product.name}
                  </strong>

                  <span
                    className={
                      product.is_active
                        ? "settings-product-status settings-product-status--active"
                        : "settings-product-status"
                    }
                  >
                    {product.is_active
                      ? "Активен"
                      : "Отключён"}
                  </span>
                </div>

                <p>
                  {product.description ||
                    "Описание не указано"}
                </p>
              </div>
            </div>

            <div className="settings-product-price">
              <span>
                Стоимость открытия
              </span>

              <strong>
                {formatProductMoney(
                  product.opening_price
                )}
              </strong>
            </div>

            <div className="settings-product-actions">
              <button
                type="button"
                onClick={() =>
                  openEditProductModal(
                    product
                  )
                }
              >
                <Pencil size={16} />
                Изменить
              </button>

              <button
                type="button"
                onClick={() =>
                  handleToggleProduct(
                    product
                  )
                }
              >
                <Power size={16} />

                {product.is_active
                  ? "Отключить"
                  : "Включить"}
              </button>

              <button
                className="settings-product-delete"
                type="button"
                onClick={() =>
                  handleDeleteProduct(
                    product
                  )
                }
              >
                <Trash2 size={16} />
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    )}

    <div className="settings-info-box">
      Зарплата рассчитывается только по
      заявкам со статусом "Успешно
      открыта": количество открытий ×
      стоимость выбранного продукта.
    </div>
  </div>
)}

          {activeSection === "roles" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon settings-panel-icon--purple">
                  <Users size={20} />
                </div>

                <div>
                  <h2>Роли и права доступа</h2>
                  <p>
                    Настройте разрешения для каждой категории сотрудников
                  </p>
                </div>
              </div>

              <div className="settings-roles-list">
                {roles.map((role) => (
                  <article className="settings-role-card" key={role.id}>
                    <div className="settings-role-heading">
                      <div>
                        <strong>{role.title}</strong>
                        <span>{role.description}</span>
                      </div>

                      <span className="settings-role-badge">
                        {Object.values(role.permissions).filter(Boolean)
                          .length}{" "}
                        прав
                      </span>
                    </div>

                    <div className="settings-permissions-grid">
                      {permissionsList.map((permission) => (
                        <div
                          className="settings-permission-item"
                          key={permission.id}
                        >
                          <span>{permission.title}</span>

                          <Toggle
                            label={`${role.title}: ${permission.title}`}
                            checked={
                              role.permissions[permission.id]
                            }
                            onChange={(value) =>
                              updatePermission(
                                role.id,
                                permission.id,
                                value
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeSection === "integrations" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon settings-panel-icon--orange">
                  <Bot size={20} />
                </div>

                <div>
                  <h2>Интеграции</h2>
                  <p>
                    Подключение внешних сервисов и API
                  </p>
                </div>
              </div>

              <div className="settings-integration-group">
                <div className="settings-integration-heading">
                  <Bot size={18} />

                  <div>
                    <strong>Telegram Bot</strong>
                    <span>
                      Отправка сообщений и уведомлений
                    </span>
                  </div>
                </div>

                <label className="settings-field">
                  <span>Bot Token</span>

                  <input
                    type="password"
                    placeholder="123456789:ABC..."
                    value={
                      settings.integrations.telegramBotToken
                    }
                    onChange={(event) =>
                      updateSetting(
                        "integrations",
                        "telegramBotToken",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="settings-integration-group">
                <div className="settings-integration-heading">
                  <Database size={18} />

                  <div>
                    <strong>Supabase</strong>
                    <span>
                      База данных, авторизация и хранение файлов
                    </span>
                  </div>
                </div>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Project URL</span>

                    <input
                      type="text"
                      placeholder="https://project.supabase.co"
                      value={settings.integrations.supabaseUrl}
                      onChange={(event) =>
                        updateSetting(
                          "integrations",
                          "supabaseUrl",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="settings-field">
                    <span>Anon Key</span>

                    <input
                      type="password"
                      placeholder="eyJhbGciOi..."
                      value={settings.integrations.supabaseKey}
                      onChange={(event) =>
                        updateSetting(
                          "integrations",
                          "supabaseKey",
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="settings-integration-group">
                <div className="settings-integration-heading">
                  <Mail size={18} />

                  <div>
                    <strong>SMTP и Webhook</strong>
                    <span>
                      Почтовые уведомления и внешние события
                    </span>
                  </div>
                </div>

                <div className="settings-form-grid">
                  <label className="settings-field settings-field--wide">
                    <span>Webhook URL</span>

                    <input
                      type="url"
                      placeholder="https://..."
                      value={settings.integrations.webhookUrl}
                      onChange={(event) =>
                        updateSetting(
                          "integrations",
                          "webhookUrl",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="settings-field">
                    <span>SMTP Host</span>

                    <input
                      type="text"
                      placeholder="smtp.example.com"
                      value={settings.integrations.smtpHost}
                      onChange={(event) =>
                        updateSetting(
                          "integrations",
                          "smtpHost",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="settings-field">
                    <span>SMTP Port</span>

                    <input
                      type="number"
                      value={settings.integrations.smtpPort}
                      onChange={(event) =>
                        updateSetting(
                          "integrations",
                          "smtpPort",
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === "mailings" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon">
                  <MessageSquare size={20} />
                </div>

                <div>
                  <h2>Настройки рассылок</h2>
                  <p>
                    Лимиты и интервалы отправки сообщений
                  </p>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Максимум сообщений в день</span>

                  <input
                    type="number"
                    min="1"
                    value={settings.mailings.dailyLimit}
                    onChange={(event) =>
                      updateSetting(
                        "mailings",
                        "dailyLimit",
                        Number(event.target.value)
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Размер одной партии</span>

                  <input
                    type="number"
                    min="1"
                    value={settings.mailings.batchSize}
                    onChange={(event) =>
                      updateSetting(
                        "mailings",
                        "batchSize",
                        Number(event.target.value)
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Интервал между партиями, сек.</span>

                  <input
                    type="number"
                    min="1"
                    value={settings.mailings.intervalSeconds}
                    onChange={(event) =>
                      updateSetting(
                        "mailings",
                        "intervalSeconds",
                        Number(event.target.value)
                      )
                    }
                  />
                </label>

                <label className="settings-field">
                  <span>Продолжительность паузы, мин.</span>

                  <input
                    type="number"
                    min="1"
                    value={settings.mailings.pauseMinutes}
                    onChange={(event) =>
                      updateSetting(
                        "mailings",
                        "pauseMinutes",
                        Number(event.target.value)
                      )
                    }
                  />
                </label>
              </div>

              <div className="settings-option-row">
                <div>
                  <strong>Автоматическая пауза</strong>

                  <span>
                    Приостанавливать рассылку при большом количестве ошибок
                  </span>
                </div>

                <Toggle
                  label="Автоматическая пауза"
                  checked={settings.mailings.autoPause}
                  onChange={(value) =>
                    updateSetting(
                      "mailings",
                      "autoPause",
                      value
                    )
                  }
                />
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon settings-panel-icon--orange">
                  <Bell size={20} />
                </div>

                <div>
                  <h2>Уведомления</h2>
                  <p>
                    Выберите каналы и события для оповещений
                  </p>
                </div>
              </div>

              <div className="settings-options-list">
                {[
                  {
                    field: "telegram",
                    title: "Telegram",
                    description:
                      "Получать уведомления через Telegram-бота",
                  },
                  {
                    field: "email",
                    title: "Email",
                    description:
                      "Отправлять уведомления на электронную почту",
                  },
                  {
                    field: "push",
                    title: "Push-уведомления",
                    description:
                      "Показывать уведомления в браузере",
                  },
                  {
                    field: "sound",
                    title: "Звуки",
                    description:
                      "Воспроизводить звук при новых событиях",
                  },
                  {
                    field: "newApplication",
                    title: "Новая заявка",
                    description:
                      "Сообщать о поступлении новой заявки",
                  },
                  {
                    field: "applicationApproved",
                    title: "Заявка подтверждена",
                    description:
                      "Сообщать об успешном подтверждении",
                  },
                  {
                    field: "mailingCompleted",
                    title: "Рассылка завершена",
                    description:
                      "Сообщать о завершении кампании",
                  },
                  {
                    field: "managerInactive",
                    title: "Менеджер неактивен",
                    description:
                      "Сообщать о длительном отсутствии активности",
                  },
                ].map((option) => (
                  <div
                    className="settings-option-row"
                    key={option.field}
                  >
                    <div>
                      <strong>{option.title}</strong>
                      <span>{option.description}</span>
                    </div>

                    <Toggle
                      label={option.title}
                      checked={
                        settings.notifications[option.field]
                      }
                      onChange={(value) =>
                        updateSetting(
                          "notifications",
                          option.field,
                          value
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "security" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon settings-panel-icon--red">
                  <ShieldCheck size={20} />
                </div>

                <div>
                  <h2>Безопасность</h2>
                  <p>
                    Защита аккаунтов и управление сессиями
                  </p>
                </div>
              </div>

              <div className="settings-options-list">
                <div className="settings-option-row">
                  <div>
                    <strong>Двухфакторная авторизация</strong>
                    <span>
                      Дополнительное подтверждение при входе
                    </span>
                  </div>

                  <Toggle
                    label="Двухфакторная авторизация"
                    checked={settings.security.twoFactor}
                    onChange={(value) =>
                      updateSetting(
                        "security",
                        "twoFactor",
                        value
                      )
                    }
                  />
                </div>

                <div className="settings-option-row">
                  <div>
                    <strong>Автоматический выход</strong>
                    <span>
                      Завершать сессию после периода неактивности
                    </span>
                  </div>

                  <Toggle
                    label="Автоматический выход"
                    checked={settings.security.autoLogout}
                    onChange={(value) =>
                      updateSetting(
                        "security",
                        "autoLogout",
                        value
                      )
                    }
                  />
                </div>

                <div className="settings-option-row">
                  <div>
                    <strong>Уведомления о входе</strong>
                    <span>
                      Сообщать о входе с нового устройства
                    </span>
                  </div>

                  <Toggle
                    label="Уведомления о входе"
                    checked={
                      settings.security.loginNotifications
                    }
                    onChange={(value) =>
                      updateSetting(
                        "security",
                        "loginNotifications",
                        value
                      )
                    }
                  />
                </div>

                <div className="settings-option-row">
                  <div>
                    <strong>Белый список IP</strong>
                    <span>
                      Разрешать доступ только с доверенных адресов
                    </span>
                  </div>

                  <Toggle
                    label="Белый список IP"
                    checked={settings.security.ipWhitelist}
                    onChange={(value) =>
                      updateSetting(
                        "security",
                        "ipWhitelist",
                        value
                      )
                    }
                  />
                </div>
              </div>

              <label className="settings-field settings-security-time">
                <span>Завершать сессию через, минут</span>

                <input
                  type="number"
                  min="15"
                  value={settings.security.sessionMinutes}
                  onChange={(event) =>
                    updateSetting(
                      "security",
                      "sessionMinutes",
                      Number(event.target.value)
                    )
                  }
                />
              </label>

              <button
                className="secondary-button button-with-icon"
                type="button"
              >
                <KeyRound size={17} />
                Сменить пароль
              </button>
            </div>
          )}

          {activeSection === "database" && (
            <div className="settings-panel">
              <div className="settings-panel-heading">
                <div className="settings-panel-icon settings-panel-icon--purple">
                  <Database size={20} />
                </div>

                <div>
                  <h2>Управление данными</h2>
                  <p>
                    Импорт, экспорт и резервное копирование
                  </p>
                </div>
              </div>

              <div className="settings-data-grid">
                <article>
                  <div className="settings-data-icon">
                    <Download size={21} />
                  </div>

                  <div>
                    <strong>Экспорт данных</strong>

                    <span>
                      Скачать заявки, менеджеров и статистику
                    </span>
                  </div>

                  <button type="button">
                    Экспортировать
                  </button>
                </article>

                <article>
                  <div className="settings-data-icon">
                    <Upload size={21} />
                  </div>

                  <div>
                    <strong>Импорт данных</strong>

                    <span>
                      Загрузить данные из Excel или CSV
                    </span>
                  </div>

                  <button type="button">
                    Импортировать
                  </button>
                </article>

                <article>
                  <div className="settings-data-icon">
                    <Database size={21} />
                  </div>

                  <div>
                    <strong>Резервная копия</strong>

                    <span>
                      Создать копию текущего состояния базы
                    </span>
                  </div>

                  <button type="button">
                    Создать копию
                  </button>
                </article>
              </div>
            </div>
          )}
        </section>
      </div>
      {productModalOpen && (
  <div
    className="settings-product-modal-overlay"
    onMouseDown={(event) => {
      if (
        event.target ===
        event.currentTarget
      ) {
        closeProductModal();
      }
    }}
  >
    <section
      className="settings-product-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="settings-product-modal-header">
        <div>
          <h2>
            {editingProduct
              ? "Редактировать продукт"
              : "Добавить продукт"}
          </h2>

          <p>
            Название и стоимость одного
            успешного открытия
          </p>
        </div>

        <button
          type="button"
          onClick={closeProductModal}
          disabled={productSaving}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
      </div>

      <form
        className="settings-product-form"
        onSubmit={handleSaveProduct}
      >
        <label className="settings-field">
          <span>
            Название продукта *
          </span>

          <input
            type="text"
            name="name"
            value={productForm.name}
            onChange={
              handleProductFormChange
            }
            placeholder="Например: Продукт А"
            autoFocus
            disabled={productSaving}
          />
        </label>

        <label className="settings-field">
          <span>
            Стоимость открытия, ₽ *
          </span>

          <input
            type="number"
            name="opening_price"
            min="0"
            step="0.01"
            value={
              productForm.opening_price
            }
            onChange={
              handleProductFormChange
            }
            placeholder="500"
            disabled={productSaving}
          />
        </label>

        <label className="settings-field">
          <span>Описание</span>

          <textarea
            name="description"
            rows="4"
            value={
              productForm.description
            }
            onChange={
              handleProductFormChange
            }
            placeholder="Необязательное описание продукта"
            disabled={productSaving}
          />
        </label>

        <label className="settings-product-active-field">
          <input
            type="checkbox"
            name="is_active"
            checked={
              productForm.is_active
            }
            onChange={
              handleProductFormChange
            }
            disabled={productSaving}
          />

          <span>
            Продукт активен и доступен
            менеджерам
          </span>
        </label>

        {productFormError && (
          <div className="settings-products-error">
            {productFormError}
          </div>
        )}

        <div className="settings-product-modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={closeProductModal}
            disabled={productSaving}
          >
            Отмена
          </button>

          <button
            className="primary-button button-with-icon"
            type="submit"
            disabled={productSaving}
          >
            <Save size={17} />

            {productSaving
              ? "Сохранение..."
              : editingProduct
                ? "Сохранить изменения"
                : "Добавить продукт"}
          </button>
        </div>
      </form>
    </section>
  </div>
)}
    </main>
  );
}
function formatProductMoney(value) {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }
  ).format(Number(value || 0));
}