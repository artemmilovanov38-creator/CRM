import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";
import { profileService } from "../services/profileService";

const AuthContext = createContext(null);

function createFallbackUser(authUser) {
  if (!authUser) {
    return null;
  }

  return {
    id: authUser.id,
    email: authUser.email || "",
    name:
      authUser.user_metadata?.full_name ||
      authUser.email?.split("@")[0] ||
      "Пользователь",
    role: "manager",
    status: "active",
    avatar: null,
  };
}

function formatUser(authUser, profile) {
  if (!authUser) {
    return null;
  }

  if (!profile) {
    return createFallbackUser(authUser);
  }

  return {
    id: authUser.id,
    email: profile.email || authUser.email || "",
    name:
      profile.full_name ||
      authUser.email?.split("@")[0] ||
      "Пользователь",
    role: profile.role || "manager",
    status: profile.status || "active",
    avatar: profile.avatar || null,
    createdAt: profile.created_at || null,
    updatedAt: profile.updated_at || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] =
    useState(true);

  const loadUserProfile = useCallback(
    async (authUser) => {
      if (!authUser) {
        setUser(null);
        return null;
      }

      const { data: profile, error } =
        await profileService.getProfileById(
          authUser.id
        );

      if (error) {
        console.error(
          "Ошибка загрузки профиля:",
          error
        );

        const fallbackUser =
          createFallbackUser(authUser);

        setUser(fallbackUser);

        return fallbackUser;
      }

      const formattedUser = formatUser(
        authUser,
        profile
      );

      if (formattedUser.status === "blocked") {
        await supabase.auth.signOut();
        setUser(null);

        return null;
      }

      setUser(formattedUser);

      return formattedUser;
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        if (session?.user) {
          await loadUserProfile(session.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error(
          "Ошибка инициализации авторизации:",
          error
        );

        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        window.setTimeout(async () => {
          if (!isMounted) {
            return;
          }

          if (session?.user) {
            await loadUserProfile(session.user);
          } else {
            setUser(null);
          }

          setIsAuthLoading(false);
        }, 0);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  async function login(email, password) {
    try {
      const normalizedEmail =
        email.trim().toLowerCase();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        return {
          success: false,
          message: getLoginErrorMessage(error),
        };
      }

      const profileUser = await loadUserProfile(
        data.user
      );

      if (!profileUser) {
        return {
          success: false,
          message:
            "Пользователь заблокирован или профиль недоступен",
        };
      }

      return {
        success: true,
        user: profileUser,
      };
    } catch (error) {
      console.error(
        "Ошибка авторизации:",
        error
      );

      return {
        success: false,
        message:
          "Не удалось выполнить вход. Попробуйте ещё раз.",
      };
    }
  }

  async function logout() {
    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setUser(null);

      return {
        success: true,
      };
    } catch (error) {
      console.error("Ошибка выхода:", error);

      return {
        success: false,
        message:
          "Не удалось выйти из аккаунта",
      };
    }
  }

  async function refreshProfile() {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error || !authUser) {
      return {
        success: false,
        message:
          "Не удалось получить пользователя",
      };
    }

    const updatedUser =
      await loadUserProfile(authUser);

    return {
      success: Boolean(updatedUser),
      user: updatedUser,
    };
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthLoading,
      login,
      logout,
      refreshProfile,
    }),
    [user, isAuthLoading, loadUserProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth должен использоваться внутри AuthProvider"
    );
  }

  return context;
}

function getLoginErrorMessage(error) {
  const message =
    error?.message?.toLowerCase() || "";

  if (
    message.includes(
      "invalid login credentials"
    ) ||
    message.includes("invalid credentials")
  ) {
    return "Неверный email или пароль";
  }

  if (
    message.includes("email not confirmed")
  ) {
    return "Email пользователя не подтверждён";
  }

  if (
    message.includes("too many requests")
  ) {
    return "Слишком много попыток входа. Попробуйте позже";
  }

  return "Не удалось выполнить вход";
}