import { supabase } from "../lib/supabase";

const MESSAGE_FIELDS = `
  id,
  application_id,
  author_id,
  message,
  created_at,
  updated_at,
  author:profiles!application_messages_author_id_fkey (
    id,
    full_name,
    email,
    avatar
  )
`;

export const applicationMessageService = {
  async getMessages(applicationId) {
    if (!applicationId) {
      return {
        data: [],
        error: new Error(
          "Не передан ID заявки"
        ),
      };
    }

    const { data, error } = await supabase
      .from("application_messages")
      .select(MESSAGE_FIELDS)
      .eq("application_id", applicationId)
      .order("created_at", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  async createMessage({
    applicationId,
    authorId,
    message,
  }) {
    const normalizedMessage =
      message?.trim();

    if (!applicationId) {
      return {
        data: null,
        error: new Error(
          "Не передан ID заявки"
        ),
      };
    }

    if (!authorId) {
      return {
        data: null,
        error: new Error(
          "Не определён автор сообщения"
        ),
      };
    }

    if (!normalizedMessage) {
      return {
        data: null,
        error: new Error(
          "Сообщение не может быть пустым"
        ),
      };
    }

    const { data, error } = await supabase
      .from("application_messages")
      .insert({
        application_id: applicationId,
        author_id: authorId,
        message: normalizedMessage,
      })
      .select(MESSAGE_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async deleteMessage(messageId) {
    if (!messageId) {
      return {
        success: false,
        error: new Error(
          "Не передан ID сообщения"
        ),
      };
    }

    const { error } = await supabase
      .from("application_messages")
      .delete()
      .eq("id", messageId);

    return {
      success: !error,
      error,
    };
  },

  subscribe(applicationId, callback) {
    return supabase
      .channel(
        `application-messages-${applicationId}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "application_messages",
          filter: `application_id=eq.${applicationId}`,
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