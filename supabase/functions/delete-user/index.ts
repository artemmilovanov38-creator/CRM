import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
            "Сервер удаления пользователей не настроен",
        },
        500
      );
    }

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
        "Ошибка проверки пользователя:",
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
            "Удалять пользователей может только активный администратор",
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

    const userId = String(
      body.userId || ""
    ).trim();

    if (!userId) {
      return createResponse(
        {
          success: false,
          message:
            "Не передан ID пользователя",
        },
        400
      );
    }

    if (userId === currentUser.id) {
      return createResponse(
        {
          success: false,
          message:
            "Нельзя удалить собственный аккаунт",
        },
        400
      );
    }

    const {
      data: targetProfile,
      error: targetProfileError,
    } = await adminClient
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfileError) {
      console.error(
        "Ошибка получения удаляемого профиля:",
        targetProfileError
      );

      return createResponse(
        {
          success: false,
          message:
            "Не удалось проверить пользователя",
        },
        500
      );
    }

    if (!targetProfile) {
      return createResponse(
        {
          success: false,
          message: "Пользователь не найден",
        },
        404
      );
    }

    /*
     * Нельзя удалить последнего администратора.
     */
    if (targetProfile.role === "admin") {
      const {
        count: adminsCount,
        error: adminsCountError,
      } = await adminClient
        .from("profiles")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("role", "admin");

      if (adminsCountError) {
        console.error(
          "Ошибка подсчёта администраторов:",
          adminsCountError
        );

        return createResponse(
          {
            success: false,
            message:
              "Не удалось проверить количество администраторов",
          },
          500
        );
      }

      if ((adminsCount || 0) <= 1) {
        return createResponse(
          {
            success: false,
            message:
              "Нельзя удалить последнего администратора",
          },
          400
        );
      }
    }

    /*
     * Удаляем пользователя из Supabase Auth.
     * При ON DELETE CASCADE профиль удалится автоматически.
     */
    const {
      error: deleteAuthError,
    } =
      await adminClient.auth.admin.deleteUser(
        userId
      );

    if (deleteAuthError) {
      console.error(
        "Ошибка удаления Auth-пользователя:",
        deleteAuthError
      );

      return createResponse(
        {
          success: false,
          message:
            "Не удалось удалить аккаунт пользователя",
        },
        500
      );
    }

    /*
     * Дополнительное удаление профиля.
     * Ничего не сломается, если профиль уже удалился каскадно.
     */
    const {
      error: deleteProfileError,
    } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (deleteProfileError) {
      console.error(
        "Auth-пользователь удалён, но возникла ошибка удаления профиля:",
        deleteProfileError
      );

      return createResponse(
        {
          success: true,
          warning:
            "Аккаунт удалён, но профиль потребует дополнительной очистки",
          userId,
        },
        200
      );
    }

    return createResponse(
      {
        success: true,
        userId,
      },
      200
    );
  } catch (error) {
    console.error(
      "Необработанная ошибка delete-user:",
      error
    );

    return createResponse(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Не удалось удалить пользователя",
      },
      500
    );
  }
});

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