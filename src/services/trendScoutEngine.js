function pick(list, i) {
  return list[i % list.length];
}

function hashSeed(text) {
  return String(text || "")
    .split("")
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100000, 7);
}

function buildViralityStatus(score) {
  if (score >= 18000) return "EXPLODING";
  if (score >= 9000) return "HIGH";
  if (score >= 3500) return "MEDIUM";
  return "LOW";
}

function buildFreshness(hours) {
  if (hours <= 8) return "NEW";
  if (hours <= 24) return "TRENDING";
  return "AGING";
}

function pickFrom(list, i) {
  return list[i % list.length];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function buildTrendScoutPrompt({ niche, subNicheFilters = [], contentStyles = [], geography = "US", minItems = 10, maxItems = 20 }) {
  const filters = subNicheFilters.length ? subNicheFilters.join(", ") : "cultural duality, controversial opinions";
  const styles = contentStyles.length ? contentStyles.join(", ") : "POV, ragebait, text-overlay reels";
  const itemCount = Math.max(minItems, Math.min(maxItems, 14));

  return `
Generate ${itemCount} Trend Scout ideas as STRICT JSON array.

Constraints:
- NO scraping. This is simulated trend discovery + pattern analysis.
- Must feel like CURRENTLY viral Instagram Reels content.
- Niche must be extremely specific: ${niche}
- Sub-niche filters: ${filters}
- Content styles: ${styles}
- Geography context: ${geography}

Output schema (no empty fields allowed):
[
  {
    "title": "",
    "hook": "",
    "content_type": "POV",
    "niche_relevance_score": 7,
    "engagement_velocity_score": 0,
    "virality_status": "LOW",
    "estimated_views": 0,
    "hours_since_posted": 1,
    "comment_rate": 0.02,
    "share_rate": 0.02,
    "summary": "",
    "why_it_works": {
      "hook_type": "",
      "emotion_trigger": "",
      "tension_point": "",
      "format": ""
    },
    "text_overlay_breakdown": "",
    "caption_analysis": "",
    "hashtag_analysis": "",
    "adaptation_for_user": "",
    "timestamp": "",
    "freshness": "NEW"
  }
]

Rules:
- Only return items with niche_relevance_score >= 8.
- Hooks must be scroll-stopping POV/opinion hooks (short, punchy).
- Reject anything generic. Every item MUST include cultural tension OR relationship conflict OR controversial POV.
- Simulate virality metrics realistically:
  - estimated_views: 50,000 to 3,000,000
  - hours_since_posted: 1 to 48
  - comment_rate: 0.01 to 0.12
  - share_rate: 0.01 to 0.10
  - engagement_velocity_score: a rounded number that matches the above (higher for fresher posts)
  - virality_status one of: LOW, MEDIUM, HIGH, EXPLODING
  - freshness one of: NEW, TRENDING, AGING (based on hours_since_posted)
- Avoid generic advice/education. This is trend ideas for creators.
- Return ONLY pure JSON (no markdown, no extra text).
`.trim();
}

export function createTrendScoutFeed({
  niche,
  subNicheFilters = [],
  contentStyles = [],
  geography = "US",
  minItems = 10,
  maxItems = 20
}) {
  const seed = hashSeed(`${niche}|${subNicheFilters.join(",")}|${contentStyles.join(",")}|${geography}`);
  const itemCount = Math.max(minItems, Math.min(maxItems, 10 + (seed % 11)));

  const emotionalTriggers = ["anger", "ego", "identity", "jealousy", "curiosity"];
  const hookTypes = ["Contrarian POV", "Debate bait", "Identity callout", "Cultural friction", "Hot take"];
  const tensionPoints = [
    "Arab vs Western mindset",
    "Money/provider vs 50/50",
    "Religion vs modern dating",
    "Family pressure vs personal freedom",
    "Status/attention vs loyalty"
  ];
  const formats = ["POV talking head", "Text-overlay rant reel", "Story confession", "Dark humor cut reel"];
  const styles = contentStyles.length ? contentStyles : ["POV", "ragebait", "text-overlay reels"];
  const filters = subNicheFilters.length ? subNicheFilters : ["controversial opinions", "cultural duality"];

  const hookTemplates = [
    "POV: he said 50/50, so I laughed",
    "POV: he wants tradition, but lives modern",
    "POV: you date outside your culture and regret it",
    "POV: he loves your vibe until you set standards",
    "POV: he wants feminine… until it costs money",
    "POV: your family hates him, but you can’t leave",
    "POV: he said “haram” but still texts at 2am"
  ];

  const titleTemplates = [
    "Moroccan girl POV: standards vs 50/50",
    "Arab vs Western dating expectations (POV)",
    "Religion vs modern lifestyle tension (reel idea)",
    "Interracial dating reality check (POV)",
    "High value lifestyle perception (hot take)",
    "Family pressure vs love (confession POV)"
  ];

  const ideas = [];
  for (let i = 0; i < itemCount; i += 1) {
    const style = pick(styles, i + seed);
    const filter = pick(filters, i + seed * 2);
    const hookType = pick(hookTypes, i + seed * 3);
    const emotion = pick(emotionalTriggers, i + seed * 4);
    const tension = pick(tensionPoints, i + seed * 5);
    const format = pick(formats, i + seed * 6);

    const estimatedViews = 60000 + ((seed + i * 137) % 850000);
    const hoursSincePosted = 1 + ((seed + i * 11) % 36);
    const commentRate = 0.02 + (((seed + i * 17) % 90) / 1000);
    const shareRate = 0.015 + (((seed + i * 19) % 80) / 1000);
    const engagementVelocityScore =
      estimatedViews / hoursSincePosted + commentRate * 120000 + shareRate * 150000;

    const nicheScoreRaw = 8 + ((seed + i * 23) % 3);
    const nicheRelevanceScore = clamp(nicheScoreRaw, 8, 10);
    const viralityStatus = buildViralityStatus(engagementVelocityScore);
    const freshness = buildFreshness(hoursSincePosted);
    const geoTag = geography === "Middle East" || geography === "Arab world" ? "diaspora" : "local";

    const title = pickFrom(titleTemplates, i + seed);
    const hook = pickFrom(hookTemplates, i + seed * 7);
    const summary = `POV ${style} reel built on ${tension} with an ${emotion} trigger for ${geoTag} audiences.`;
    const adaptation = `Rewrite in your voice: "${hook}". Keep it ${format.toLowerCase()} and lean into ${tension.toLowerCase()} with a bold, real-life delivery.`;

    ideas.push({
      title,
      hook,
      content_type: style.includes("ragebait")
        ? "Ragebait"
        : style.toLowerCase().includes("humor")
        ? "Humor"
        : style.toLowerCase().includes("story")
        ? "Story"
        : "POV",
      niche_relevance_score: nicheRelevanceScore,
      engagement_velocity_score: Math.round(engagementVelocityScore),
      virality_status: viralityStatus,
      estimated_views: estimatedViews,
      hours_since_posted: hoursSincePosted,
      comment_rate: Number(commentRate.toFixed(3)),
      share_rate: Number(shareRate.toFixed(3)),
      summary,
      why_it_works: {
        hook_type: hookType,
        emotion_trigger: emotion,
        tension_point: tension,
        format
      },
      text_overlay_breakdown: `Line1: "${hook}". Line2: "Be honest… who’s wrong?". Line3: "Comment your take".`,
      caption_analysis: "Short, slightly provocative caption that invites disagreement (ego/identity trigger) for comments.",
      hashtag_analysis: `Mix niche + identity + viral tags; include Arab/Moroccan identity plus dating/power-dynamic tags for ${geography}.`,
      adaptation_for_user: adaptation,
      timestamp: new Date(Date.now() - hoursSincePosted * 3600000).toISOString(),
      freshness
    });
  }

  return ideas
    .filter((item) => item.niche_relevance_score >= 8)
    .sort((a, b) =>
      b.niche_relevance_score - a.niche_relevance_score ||
      b.engagement_velocity_score - a.engagement_velocity_score
    );
}
