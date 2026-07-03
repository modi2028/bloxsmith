/**
 * Central brand config — rename the product by editing this one file.
 */
export const BRAND = {
  name: "Bloxsmith",
  tagline: "Your AI pair-builder for Roblox Studio",
  description:
    "Describe a game mechanic in chat and watch it get built live inside your open Roblox Studio session.",
  // Change these to your real contact + domain before publishing.
  contactEmail: "support@bloxsmith.online",
  websiteUrl: "https://bloxsmith.online",
  // Roblox Creator Store page for the published Studio plugin.
  pluginUrl: "https://create.roblox.com/store/asset/83532318504563/Bloxsmith",
  // Direct download of the plugin as a local plugin file (served from public/).
  // This is the takedown-proof install path — local plugins aren't moderated.
  pluginFileUrl: "/Bloxsmith.lua",
  pluginFileName: "Bloxsmith.lua",
} as const;
