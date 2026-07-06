import "server-only";

/**
 * Free-model search against the Roblox Creator Store (toolbox service — the
 * same backend Studio's Toolbox uses). Runs server-side; results feed the
 * insert_asset tool, which the plugin executes with InsertService.
 */
const TOOLBOX_BASE = "https://apis.roblox.com/toolbox-service/v1";
const MODELS_CATEGORY = 10; // free Models

type SearchResult = {
  assetId: number;
  name: string;
  creator: string;
  description: string;
};

export async function searchRobloxAssets(params: {
  query: string;
  limit?: number;
}): Promise<{ results: SearchResult[]; note?: string }> {
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 10);
  const searchRes = await fetch(
    `${TOOLBOX_BASE}/marketplace/${MODELS_CATEGORY}?limit=${limit}&keyword=${encodeURIComponent(
      params.query,
    )}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!searchRes.ok) {
    throw new Error(`Creator Store search failed (${searchRes.status})`);
  }
  const found = (await searchRes.json()) as { data?: { id?: number }[] };
  const ids = (found.data ?? [])
    .map((d) => d.id)
    .filter((id): id is number => typeof id === "number")
    .slice(0, limit);
  if (ids.length === 0) {
    return {
      results: [],
      note: "No free models matched — try a simpler keyword (e.g. 'oak tree').",
    };
  }

  const detailsRes = await fetch(
    `${TOOLBOX_BASE}/items/details?assetIds=${ids.join(",")}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!detailsRes.ok) {
    // Search worked — return bare ids rather than failing the tool.
    return {
      results: ids.map((assetId) => ({
        assetId,
        name: `Asset ${assetId}`,
        creator: "unknown",
        description: "",
      })),
    };
  }
  const details = (await detailsRes.json()) as {
    data?: {
      asset?: { id?: number; name?: string; description?: string };
      creator?: { name?: string };
    }[];
  };
  const results: SearchResult[] = (details.data ?? [])
    .filter((d) => typeof d.asset?.id === "number")
    .map((d) => ({
      assetId: d.asset!.id!,
      name: d.asset?.name ?? `Asset ${d.asset!.id!}`,
      creator: d.creator?.name ?? "unknown",
      description: (d.asset?.description ?? "").slice(0, 160),
    }));
  return { results };
}
