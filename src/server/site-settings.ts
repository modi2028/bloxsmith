import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";

/** Admin-controlled site switches (stored in app_settings). */
export type SiteSettings = {
  /**
   * Global announcement, or null when none. Each publish mints a new id —
   * clients remember the last id they showed, so an announcement pops up
   * once per user per publish.
   */
  announcement: { id: string; text: string } | null;
  /** When true, non-admins can't use the app (landing + dashboard + chat). */
  maintenance: boolean;
  /** Super-admin switches pausing individual features for non-admins. */
  chatPaused: boolean;
  imagePaused: boolean;
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await db.query.appSettings.findMany({
    where: inArray(schema.appSettings.key, [
      "global_announcement",
      "maintenance_mode",
      "chat_paused",
      "image_paused",
    ]),
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;

  const raw = value("global_announcement");
  let announcement: SiteSettings["announcement"] = null;
  if (typeof raw === "string" && raw.trim()) {
    // Legacy shape (plain string) from before announcements had ids.
    announcement = { id: "legacy", text: raw };
  } else if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as { text?: unknown }).text === "string" &&
    (raw as { text: string }).text.trim()
  ) {
    const obj = raw as { id?: unknown; text: string };
    announcement = {
      id: typeof obj.id === "string" ? obj.id : "legacy",
      text: obj.text,
    };
  }

  return {
    announcement,
    maintenance: value("maintenance_mode") === true,
    chatPaused: value("chat_paused") === true,
    imagePaused: value("image_paused") === true,
  };
}
