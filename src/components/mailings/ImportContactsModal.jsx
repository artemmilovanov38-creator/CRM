import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, X, FileSpreadsheet } from "lucide-react";

import mailingContactService from "../../services/mailingContactService";

const allowedExtensions = ["xlsx", "xls", "csv"];

const getFileExtension = (fileName = "") => {
  return fileName
    .split(".")
    .pop()
    ?.toLowerCase();
};

const ImportContactsModal = ({
  mailingId,
  mailingName,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] =
    useState(null);

  const [parsedContacts, setParsedContacts] =
    useState([]);

  const [isReading, setIsReading] =
    useState(false);

  const [isImporting, setIsImporting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const resetMessages = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

 const readFile = async (file) => {
  resetMessages();
  setIsReading(true);
  setSelectedFile(null);
  setParsedContacts([]);

  try {
    const extension = getFileExtension(file.name);

    if (!allowedExtensions.includes(extension)) {
      throw new Error(
        "Поддерживаются только файлы XLSX, XLS и CSV."
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    let workbook;

    if (extension === "csv") {
      let csvText;

      try {
        csvText = new TextDecoder("utf-8", {
          fatal: true,
        }).decode(arrayBuffer);
      } catch {
        csvText = new TextDecoder(
          "windows-1251"
        ).decode(arrayBuffer);
      }

      workbook = XLSX.read(csvText, {
        type: "string",
      });
    } else {
      workbook = XLSX.read(arrayBuffer, {
        type: "array",
      });
    }

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error(
        "В файле не найдено ни одного листа."
      );
    }

    const worksheet =
      workbook.Sheets[firstSheetName];

    const rows = XLSX.utils.sheet_to_json(
      worksheet,
      {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      }
    );

    const cleanRows = rows
      .map((row) =>
        row.map((cell) =>
          String(cell ?? "").trim()
        )
      )
      .filter((row) =>
        row.some((cell) => cell !== "")
      );

    if (!cleanRows.length) {
      throw new Error(
        "Файл пустой или в нём нет строк с контактами."
      );
    }

    const normalizeHeader = (value) =>
      String(value || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/ё/g, "е");

    const headerAliases = {
      full_name: [
        "фио",
        "имя",
        "фамилия имя",
        "полное имя",
        "full name",
        "fullname",
        "name",
      ],

      phone: [
        "телефон",
        "номер телефона",
        "номер",
        "phone",
        "phone number",
        "mobile",
      ],

      email: [
        "email",
        "e-mail",
        "почта",
        "электронная почта",
      ],
    };

    const firstRowHeaders = cleanRows[0].map(
      normalizeHeader
    );

    const findColumnIndex = (aliases) =>
      firstRowHeaders.findIndex((header) =>
        aliases.includes(header)
      );

    const detectedIndexes = {
      full_name: findColumnIndex(
        headerAliases.full_name
      ),

      phone: findColumnIndex(
        headerAliases.phone
      ),

      email: findColumnIndex(
        headerAliases.email
      ),
    };

    const hasRecognizedHeaders =
      detectedIndexes.full_name !== -1 ||
      detectedIndexes.phone !== -1 ||
      detectedIndexes.email !== -1;

    const dataRows = hasRecognizedHeaders
      ? cleanRows.slice(1)
      : cleanRows;

    const columnIndexes = hasRecognizedHeaders
      ? detectedIndexes
      : {
          full_name: 0,
          phone: 1,
          email: 2,
        };

    const contacts = dataRows
      .map((row) => ({
        full_name:
          columnIndexes.full_name >= 0
            ? row[columnIndexes.full_name] || ""
            : "",

        phone:
          columnIndexes.phone >= 0
            ? row[columnIndexes.phone] || ""
            : "",

        email:
          columnIndexes.email >= 0
            ? row[columnIndexes.email] || ""
            : "",
      }))
      .filter(
        (contact) =>
          contact.full_name ||
          contact.phone ||
          contact.email
      );

    if (!contacts.length) {
      throw new Error(
        "В файле не найдено подходящих контактов."
      );
    }

    setSelectedFile(file);
    setParsedContacts(contacts);
  } catch (error) {
    console.error(
      "Ошибка чтения файла:",
      error
    );

    setSelectedFile(null);
    setParsedContacts([]);

    setErrorMessage(
      error?.message ||
        "Не удалось прочитать файл."
    );
  } finally {
    setIsReading(false);
  }
};

  const handleFileChange = async (event) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    await readFile(file);
  };

  const handleImport = async () => {
    resetMessages();

    if (!mailingId) {
      setErrorMessage(
        "Не удалось определить выбранную партию."
      );
      return;
    }

    if (!parsedContacts.length) {
      setErrorMessage(
        "Сначала выбери файл с контактами."
      );
      return;
    }

    setIsImporting(true);

    try {
      const { data, error } =
        await mailingContactService.importContacts(
          mailingId,
          parsedContacts
        );

      if (error) {
        throw error;
      }

      const importedCount =
        data?.length || 0;

      setSuccessMessage(
        `Импорт завершён. Добавлено контактов: ${importedCount}.`
      );

      if (onImported) {
        await onImported({
          mailingId,
          importedCount,
          contacts: data || [],
        });
      }
    } catch (error) {
      console.error(
        "Ошибка импорта контактов:",
        error
      );

      const message =
        error?.message ||
        "Не удалось импортировать контакты.";

      if (
        message.includes(
          "mailing_contacts_unique_phone_per_mailing_idx"
        ) ||
        message.includes("duplicate")
      ) {
        setErrorMessage(
          "В файле найдены повторяющиеся номера телефонов."
        );
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="mailing-import-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="mailing-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-contacts-title"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="mailing-import-header">
          <div>
            <h2 id="import-contacts-title">
              Импорт контактов
            </h2>

            <p>
              Партия:{" "}
              <strong>
                {mailingName ||
                  "Без названия"}
              </strong>
            </p>
          </div>

          <button
            type="button"
            className="mailing-import-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mailing-import-body">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="mailing-import-dropzone"
            onClick={handleChooseFile}
            disabled={
              isReading || isImporting
            }
          >
            <Upload size={30} />

            <span className="mailing-import-dropzone-title">
              {isReading
                ? "Читаем файл..."
                : "Выбрать Excel или CSV"}
            </span>

            <span className="mailing-import-dropzone-text">
              Поддерживаются форматы
              .xlsx, .xls и .csv
            </span>
          </button>

          {selectedFile && (
            <div className="mailing-import-file">
              <FileSpreadsheet
                size={22}
              />

              <div>
                <strong>
                  {selectedFile.name}
                </strong>

                <span>
                  Найдено строк:{" "}
                  {parsedContacts.length}
                </span>
              </div>
            </div>
          )}

          <div className="mailing-import-hint">
            <strong>
              Поддерживаемые названия колонок:
            </strong>

            <span>
              ФИО, Имя, Телефон, Номер
              телефона, Email, Почта.
            </span>
          </div>

          {errorMessage && (
            <div className="mailing-import-message mailing-import-message--error">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mailing-import-message mailing-import-message--success">
              {successMessage}
            </div>
          )}
        </div>

        <div className="mailing-import-footer">
          <button
            type="button"
            className="mailing-import-cancel"
            onClick={onClose}
            disabled={isImporting}
          >
            Закрыть
          </button>

          <button
            type="button"
            className="mailing-import-submit"
            onClick={handleImport}
            disabled={
              isImporting ||
              isReading ||
              parsedContacts.length === 0
            }
          >
            {isImporting
              ? "Импортируем..."
              : `Импортировать ${
                  parsedContacts.length || ""
                }`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportContactsModal;