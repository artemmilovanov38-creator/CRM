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
    .in("role", ["manager", "leader"])
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
    .in("role", ["manager", "leader"])
    .order("full_name", {
      ascending: true,
    });

  return {
    data: data || [],
    error,
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