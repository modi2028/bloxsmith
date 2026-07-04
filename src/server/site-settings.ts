import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";

/** Admin-controlled site switches (stored in app_settings). */
export type SiteSettings = {
  /** Banner shown to everyone; empty string = no announcement. */
  announcement: string;
  /** When true, non-admins can't use the app (dashboard + chat blocked). */
  maintenance: boolean;
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await db.query.appSettings.findMany({
    where: inArray(schema.appSettings.key, [
      "global_announcement",
      "maintenance_mode",
    ]),
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const announcement = value("global_announcement");
  return {
    announcement: typeof announcement === "string" ? announcement : "",
    maintenance: value("maintenance_mode") === true,
  };
}
