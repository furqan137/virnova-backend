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

  const emotionalTriggers = ["anger", "curiosity", "identity", "ego", "belonging", "fear of missing out"];
  const hookTypes = ["Contrarian POV", "Debate bait", "Identity callout", "Cultural friction", "Hot take"];
  const tensionPoints = ["Expectation vs reality", "Tradition vs modernity", "Identity split", "Family pressure", "Social status"];
  const formats = ["POV talking head", "Text-overlay rant reel", "Story confession", "Dark humor cut reel"];
  const styles = contentStyles.length ? contentStyles : ["POV", "ragebait", "text-overlay reels"];
  const filters = subNicheFilters.length ? subNicheFilters : ["controversial opinions", "cultural duality"];

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

    const nicheScoreRaw = 7 + ((seed + i * 23) % 4);
    const nicheRelevanceScore = Math.max(7, Math.min(10, nicheScoreRaw));
    const viralityStatus = buildViralityStatus(engagementVelocityScore);
    const freshness = buildFreshness(hoursSincePosted);
    const geoTag = geography === "Middle East" || geography === "Arab world" ? "diaspora" : "local";

    const title = `${niche} ${filter} ${style} angle ${i + 1}`;
    const hook = `POV: ${filter} is why ${niche} content stalls`;
    const summary = `Creator-style ${style} reel combining ${filter} tension with ${emotion} trigger for ${geoTag} audiences.`;
    const adaptation = `Use your brand POV: "Growing up between cultures changed how I read ${niche}." Keep ${format.toLowerCase()} and open with a hot take.`;

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
      text_overlay_breakdown: `Line1: "${hook}". Line2: "Nobody says this out loud". Line3: "Comment your take".`,
      caption_analysis: "Short opinionated CTA caption that invites public disagreement to increase comments.",
      hashtag_analysis: `Mix ${niche} + viral tags, prioritizing conflict and identity keywords for ${geography}.`,
      adaptation_for_user: adaptation,
      timestamp: new Date(Date.now() - hoursSincePosted * 3600000).toISOString(),
      freshness
    });
  }

  return ideas
    .filter((item) => item.niche_relevance_score >= 7)
    .sort((a, b) =>
      b.niche_relevance_score - a.niche_relevance_score ||
      b.engagement_velocity_score - a.engagement_velocity_score
    );
}
