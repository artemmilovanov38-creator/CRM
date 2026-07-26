import { supabase } from "../lib/supabase";

const PRODUCT_FIELDS = `
  id,
  name,
  description,
  is_active,
  created_by,
  created_at,
  updated_at
`;

export const productService = {
  /**
   * Получить все доступные продукты.
   *
   * Менеджер увидит только активные продукты из-за настроек Supabase.
   * Администратор увидит активные и отключенные продукты.
   */
  async getProducts() {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .order("name", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Получить только активные продукты.
   */
  async getActiveProducts() {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("is_active", true)
      .order("name", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Получить один продукт по ID.
   */
  async getProductById(productId) {
    if (!productId) {
      return {
        data: null,
        error: new Error("Не передан ID продукта"),
      };
    }

    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("id", productId)
      .maybeSingle();

    return {
      data,
      error,
    };
  },

  /**
   * Создать новый продукт.
   */
  async createProduct(values) {
    const name = values?.name?.trim();

    if (!name) {
      return {
        data: null,
        error: new Error("Введите название продукта"),
      };
    }

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return {
        data: null,
        error: authError,
      };
    }

    const payload = {
      name,
      description:
        values?.description?.trim() || null,
      is_active:
        values?.is_active !== undefined
          ? Boolean(values.is_active)
          : true,
      created_by:
        authData?.user?.id || null,
    };

    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select(PRODUCT_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  /**
   * Изменить продукт.
   */
  async updateProduct(productId, values) {
    if (!productId) {
      return {
        data: null,
        error: new Error("Не передан ID продукта"),
      };
    }

    const allowedFields = [
      "name",
      "description",
      "is_active",
    ];

    const payload = Object.fromEntries(
      Object.entries(values || {}).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    if ("name" in payload) {
      payload.name = payload.name?.trim();

      if (!payload.name) {
        return {
          data: null,
          error: new Error(
            "Название продукта не может быть пустым"
          ),
        };
      }
    }

    if ("description" in payload) {
      payload.description =
        payload.description?.trim() || null;
    }

    if ("is_active" in payload) {
      payload.is_active = Boolean(
        payload.is_active
      );
    }

    if (Object.keys(payload).length === 0) {
      return {
        data: null,
        error: new Error(
          "Нет данных для изменения продукта"
        ),
      };
    }

    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", productId)
      .select(PRODUCT_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  /**
   * Включить или отключить продукт.
   *
   * Продукт лучше не удалять, потому что он может использоваться
   * в старых заявках и открытиях.
   */
  async setProductActive(productId, isActive) {
    return this.updateProduct(productId, {
      is_active: isActive,
    });
  },

  /**
   * Полностью удалить продукт.
   *
   * Использовать только если продукт был создан ошибочно
   * и еще нигде не используется.
   */
  async deleteProduct(productId) {
    if (!productId) {
      return {
        success: false,
        error: new Error("Не передан ID продукта"),
      };
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    return {
      success: !error,
      error,
    };
  },
};