import { supabase } from "../lib/supabase";

const PROFILE_FIELDS = `
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
`;

export const profileService = {
  async getProfileById(userId) {
    if (!userId) {
      return {
        data: null,
        error: new Error("Не передан ID пользователя"),
      };
      
    }
    

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("id", userId)
      .maybeSingle();

    return {
      data,
      error,
    };
  },
  async getManagerById(managerId) {
  if (!managerId) {
    return {
      data: null,
      error: new Error("Не передан ID менеджера"),
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", managerId)
    .in("role", ["manager", "head"])
    .maybeSingle();

  return {
    data,
    error,
  };
},
  

  async getProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },
  async getManagers() {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
   .in("role", ["manager", "head"])
    .order("full_name", {
      ascending: true,
    });

  return {
    data: data || [],
    error,
  };
},

async createUser(values) {

  
  const fullName = String(
    values?.full_name || ""
  ).trim();

  const email = String(
    values?.email || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    values?.password || ""
  );

  const role = String(
    values?.role || "manager"
  );

  if (!fullName) {
    return {
      data: null,
      error: new Error(
        "Укажите имя сотрудника"
      ),
    };
  }

  if (!email) {
    return {
      data: null,
      error: new Error(
        "Укажите email сотрудника"
      ),
    };
  }

  if (password.length < 8) {
    return {
      data: null,
      error: new Error(
        "Пароль должен содержать минимум 8 символов"
      ),
    };
  }
const {
  data: sessionData,
  error: sessionError,
} = await supabase.auth.getSession();

if (sessionError) {
  return {
    data: null,
    error: new Error(
      "Не удалось получить текущую сессию"
    ),
  };
}

const accessToken =
  sessionData?.session?.access_token;

if (!accessToken) {
  return {
    data: null,
    error: new Error(
      "Сессия отсутствует. Выйдите из аккаунта и войдите снова."
    ),
  };
}

const { data, error } =
  await supabase.functions.invoke(
    "create-user",
    {
      body: {
        fullName,
        email,
        password,
        role,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    return {
      data: null,
      error,
    };
  }

  if (!data?.success) {
    return {
      data: null,
      error: new Error(
        data?.message ||
          "Не удалось создать пользователя"
      ),
    };
  }

  const createdProfile = data.user;

  if (!createdProfile?.id) {
    return {
      data: null,
      error: new Error(
        "Сервер не вернул созданного пользователя"
      ),
    };
  }

  return {
  data: createdProfile,
  error: null,
};
},


async deleteUser(userId) {
  if (!userId) {
    return {
      data: null,
      error: new Error(
        "Не передан ID пользователя"
      ),
    };
  }

  const { data, error } =
    await supabase.functions.invoke(
      "delete-user",
      {
        body: {
          userId,
        },
      }
    );

  if (error) {
    return {
      data: null,
      error,
    };
  }

  if (!data?.success) {
    return {
      data: null,
      error: new Error(
        data?.message ||
          "Не удалось удалить пользователя"
      ),
    };
  }

  return {
    data: {
      userId: data.userId,
      warning: data.warning || null,
    },
    error: null,
  };
},
  async updateProfile(userId, values) {
    if (!userId) {
      return {
        data: null,
        error: new Error("Не передан ID пользователя"),
      };
    }

   const allowedFields = [
  "full_name",
  "role",
  "status",
  "avatar",
  "phone",
  "telegram",
  "hire_date",
  "note",
];

    const sanitizedValues = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    if (Object.keys(sanitizedValues).length === 0) {
      return {
        data: null,
        error: new Error("Нет данных для обновления"),
      };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(sanitizedValues)
      .eq("id", userId)
      .select(PROFILE_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },
};