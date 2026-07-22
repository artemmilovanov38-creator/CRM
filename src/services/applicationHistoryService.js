import { supabase } from "../lib/supabase";

const HISTORY_FIELDS = `
  id,
  application_id,
  actor_id,
  action_type,
  field_name,
  old_value,
  new_value,
  created_at,
  actor:profiles!application_history_actor_id_fkey (
    id,
    full_name,
    email,
    avatar
  )
`;

export const applicationHistoryService = {
  async getHistory(applicationId) {
    if (!applicationId) {
      return {
        data: [],
        error: new Error(
          "Не передан ID заявки"
        ),
      };
    }

    const { data, error } = await supabase
      .from("application_history")
      .select(HISTORY_FIELDS)
      .eq("application_id", applicationId)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  subscribe(applicationId, callback) {
    return supabase
      .channel(
        `application-history-${applicationId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "application_history",
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