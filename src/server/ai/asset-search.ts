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
  /** Community proof — older well-voted assets insert far more reliably. */
  upVotes: number;
  hasScripts: boolean;
  /** Contains ready-made Tool instances (weapons the player can equip). */
  toolCount: number;
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
        upVotes: 0,
        hasScripts: false,
        toolCount: 0,
      })),
    };
  }
  const details = (await detailsRes.json()) as {
    data?: {
      asset?: {
        id?: number;
        name?: string;
        description?: string;
        hasScripts?: boolean;
        modelTechnicalDetails?: {
          instanceCounts?: { tool?: number };
        };
      };
      creator?: { name?: string };
      voting?: { upVotes?: number };
    }[];
  };
  const results: SearchResult[] = (details.data ?? [])
    .filter((d) => typeof d.asset?.id === "number")
    .map((d) => ({
      assetId: d.asset!.id!,
      name: d.asset?.name ?? `Asset ${d.asset!.id!}`,
      creator: d.creator?.name ?? "unknown",
      description: (d.asset?.description ?? "").slice(0, 160),
      upVotes: d.voting?.upVotes ?? 0,
      hasScripts: d.asset?.hasScripts ?? false,
      toolCount: d.asset?.modelTechnicalDetails?.instanceCounts?.tool ?? 0,
    }))
    // Community-proven first: fresh zero-vote uploads are the ones Roblox
    // most often refuses to insert (and are usually lower quality anyway).
    .sort((a, b) => b.upVotes - a.upVotes);
  return { results };
}
