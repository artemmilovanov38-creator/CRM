import { supabase } from "../lib/supabase";

const NOTIFICATION_FIELDS = `
  id,
  recipient_id,
  actor_id,
  application_id,
  type,
  title,
  message,
  is_read,
  created_at,
  actor:profiles!notifications_actor_id_fkey (
    id,
    full_name,
    email,
    avatar
  )
`;

export const notificationService = {
  async getNotifications(userId) {
    if (!userId) {
      return {
        data: [],
        error: new Error(
          "Не передан ID пользователя"
        ),
      };
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_FIELDS)
      .eq("recipient_id", userId)
      .order("created_at", {
        ascending: false,
      })
      .limit(30);

    return {
      data: data || [],
      error,
    };
  },

  async createNotification({
    recipientId,
    actorId = null,
    applicationId = null,
    type = "system",
    title,
    message = "",
  }) {
    if (!recipientId) {
      return {
        data: null,
        error: new Error(
          "Не указан получатель уведомления"
        ),
      };
    }

    if (!title?.trim()) {
      return {
        data: null,
        error: new Error(
          "Не указан заголовок уведомления"
        ),
      };
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        recipient_id: recipientId,
        actor_id: actorId,
        application_id: applicationId,
        type,
        title: title.trim(),
        message: message?.trim() || null,
      })
      .select(NOTIFICATION_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async markAsRead(notificationId) {
    if (!notificationId) {
      return {
        success: false,
        error: new Error(
          "Не передан ID уведомления"
        ),
      };
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("id", notificationId);

    return {
      success: !error,
      error,
    };
  },

  async markAllAsRead(userId) {
    if (!userId) {
      return {
        success: false,
        error: new Error(
          "Не передан ID пользователя"
        ),
      };
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    return {
      success: !error,
      error,
    };
  },

  async deleteNotification(notificationId) {
    if (!notificationId) {
      return {
        success: false,
        error: new Error(
          "Не передан ID уведомления"
        ),
      };
    }

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    return {
      success: !error,
      error,
    };
  },

  subscribe(userId, callback) {
    if (!userId) {
      return null;
    }

    return supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        callback
      )
      .subscribe();
  },

  async unsubscribe(channel) {
    if (!channel) {
      return;
    }

    await supabase.removeChannel(channel);
  },
};