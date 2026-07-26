import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = [
  "admin",
  "head",
  "manager",
];

const allowedStatuses = [
  "active",
  "inactive",
  "blocked",
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return createResponse(
      {
        success: true,
      },
      200
    );
  }

  if (request.method !== "POST") {
    return createResponse(
      {
        success: false,
        message: "Метод не поддерживается",
      },
      405
    );
  }

  try {
    const authHeader =
      request.headers.get("Authorization");

    if (!authHeader) {
      return createResponse(
        {
          success: false,
          message: "Пользователь не авторизован",
        },
        401
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !serviceRoleKey
    ) {
      console.error(
        "Отсутствуют переменные окружения Supabase"
      );

      return createResponse(
        {
          success: false,
          message:
            "Сервер создания пользователей не настроен",
        },
        500
      );
    }

    /*
     * Клиент авторизованного пользователя.
     * Используется только для проверки JWT.
     */
    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await userClient.auth.getUser();

    if (currentUserError || !currentUser) {
      console.error(
        "Ошибка проверки текущего пользователя:",
        currentUserError
      );

      return createResponse(
        {
          success: false,
          message:
            "Не удалось проверить пользователя",
        },
        401
      );
    }

    /*
     * Административный клиент.
     * Service Role никогда не передаётся браузеру.
     */
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    /*
     * Проверяем роль через административный клиент.
     * Так проверка функции не зависит от RLS profiles.
     */
    const {
      data: currentProfile,
      error: currentProfileError,
    } = await adminClient
      .from("profiles")
      .select("id, role, status")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (
      currentProfileError ||
      !currentProfile
    ) {
      console.error(
        "Ошибка получения профиля администратора:",
        currentProfileError
      );

      return createResponse(
        {
          success: false,
          message:
            "Профиль администратора не найден",
        },
        403
      );
    }

    if (
      currentProfile.role !== "admin" ||
      currentProfile.status !== "active"
    ) {
      return createResponse(
        {
          success: false,
          message:
            "Создавать пользователей может только активный администратор",
        },
        403
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return createResponse(
        {
          success: false,
          message: "Переданы некорректные данные",
        },
        400
      );
    }

    const fullName = normalizeText(
      body.fullName
    );

    const email = normalizeText(
      body.email
    ).toLowerCase();

    const password = String(
      body.password || ""
    );

    const phone =
      normalizeNullableText(body.phone);

    const telegram =
      normalizeTelegram(body.telegram);

    const hireDate =
      normalizeNullableText(body.hireDate);

    const note =
      normalizeNullableText(body.note);

    const role = String(
      body.role || "manager"
    );

    const status = String(
      body.status || "active"
    );

    if (!fullName) {
      return createResponse(
        {
          success: false,
          message: "Укажите имя сотрудника",
        },
        400
      );
    }

    if (fullName.length > 200) {
      return createResponse(
        {
          success: false,
          message:
            "Имя сотрудника слишком длинное",
        },
        400
      );
    }

    if (!email) {
      return createResponse(
        {
          success: false,
          message: "Укажите email сотрудника",
        },
        400
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return createResponse(
        {
          success: false,
          message: "Указан некорректный email",
        },
        400
      );
    }

    if (password.length < 8) {
      return createResponse(
        {
          success: false,
          message:
            "Пароль должен содержать минимум 8 символов",
        },
        400
      );
    }

    if (password.length > 128) {
      return createResponse(
        {
          success: false,
          message:
            "Пароль не должен превышать 128 символов",
        },
        400
      );
    }

    if (!allowedRoles.includes(role)) {
      return createResponse(
        {
          success: false,
          message: "Недопустимая роль",
        },
        400
      );
    }

    if (!allowedStatuses.includes(status)) {
      return createResponse(
        {
          success: false,
          message: "Недопустимый статус",
        },
        400
      );
    }

    if (
      note &&
      note.length > 2000
    ) {
      return createResponse(
        {
          success: false,
          message:
            "Комментарий не должен превышать 2000 символов",
        },
        400
      );
    }

    if (
      hireDate &&
      !isValidDate(hireDate)
    ) {
      return createResponse(
        {
          success: false,
          message:
            "Указана некорректная дата приёма",
        },
        400
      );
    }

    const {
      data: authData,
      error: createAuthError,
    } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createAuthError) {
      console.error(
        "Ошибка создания Auth-пользователя:",
        createAuthError
      );

      return createResponse(
        {
          success: false,
          message: getCreateUserErrorMessage(
            createAuthError.message
          ),
        },
        400
      );
    }

    const createdUser = authData.user;

    if (!createdUser) {
      throw new Error(
        "Supabase не вернул созданного пользователя"
      );
    }

    const {
      data: createdProfile,
      error: profileError,
    } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: createdUser.id,
          full_name: fullName,
          email,
          role,
          status,
          phone,
          telegram,
          hire_date: hireDate,
          note,
        },
        {
          onConflict: "id",
        }
      )
      .select(
        `
          id,
          full_name,
          email,
          role,
          status,
          avatar,
          phone,
          telegram,
          hire_date,
          note,
          created_at,
          updated_at
        `
      )
      .single();

    if (profileError) {
      console.error(
        "Ошибка создания профиля:",
        profileError
      );

      const {
        error: deleteAuthError,
      } =
        await adminClient.auth.admin.deleteUser(
          createdUser.id
        );

      if (deleteAuthError) {
        console.error(
          "Не удалось удалить Auth-пользователя после ошибки профиля:",
          deleteAuthError
        );
      }

      return createResponse(
        {
          success: false,
          message:
            "Не удалось создать профиль сотрудника",
        },
        500
      );
    }

    return createResponse(
      {
        success: true,
        user: createdProfile,
      },
      201
    );
  } catch (error) {
    console.error(
      "Необработанная ошибка create-user:",
      error
    );

    return createResponse(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Не удалось создать пользователя",
      },
      500
    );
  }
});

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeNullableText(
  value: unknown
) {
  const normalizedValue =
    normalizeText(value);

  return normalizedValue || null;
}

function normalizeTelegram(
  value: unknown
) {
  const normalizedValue =
    normalizeText(value).replace(/^@/, "");

  return normalizedValue || null;
}

function isValidDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) ===
      value
  );
}

function createResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type":
        "application/json; charset=utf-8",
    },
  });
}

function getCreateUserErrorMessage(
  message: string
) {
  const normalizedMessage =
    message.toLowerCase();

  if (
    normalizedMessage.includes(
      "already been registered"
    ) ||
    normalizedMessage.includes(
      "already registered"
    ) ||
    normalizedMessage.includes(
      "user already exists"
    )
  ) {
    return "Пользователь с таким email уже существует";
  }

  if (
    normalizedMessage.includes(
      "invalid email"
    )
  ) {
    return "Указан некорректный email";
  }

  if (
    normalizedMessage.includes("password")
  ) {
    return "Пароль не соответствует требованиям";
  }

  return "Не удалось создать пользователя";
}