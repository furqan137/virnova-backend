const API_URL = process.env.EXTERNAL_AI_API_URL;
const API_KEY = process.env.EXTERNAL_AI_API_KEY;

function makeMockContent({ niche = "general", topic = "trending topic", audience = "creators" }) {
  return {
    hook: `Stop scrolling: this ${niche} mistake is costing ${audience} real growth.`,
    script: `Most people in ${niche} focus on output before pattern analysis. Start with 3 trending posts, identify 2 repeated emotional triggers, then publish one optimized version on ${topic}.`,
    caption: `Use this ${niche} framework to turn views into engagement. Save this for your next post.`,
    hashtags: ["#viral", `#${niche.replace(/\s+/g, "")}`, "#contentstrategy"],
    loopEnding: "In part 2, I will show the exact posting structure that doubles retention."
  };
}

export async function generateWithExternalAI(payload) {
  if (!API_URL || !API_KEY) {
    return makeMockContent(payload);
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`External API request failed with status ${response.status}`);
  }

  return response.json();
}

export function generateTrendInsights(payload) {
  const linksCount = payload.links?.length || 0;
  return {
    topHooks: ["Do this before you post", "Nobody tells you this", "3 mistakes to avoid"],
    keywords: [payload.niche || "niche", "viral", "growth"],
    averageLengthSeconds: linksCount > 0 ? 27 : 22,
    emotionalTriggers: ["curiosity", "urgency", "transformation"]
  };
}

export function generateIdeas(payload) {
  const niche = payload.niche || "content";
  return {
    ideas: [
      {
        title: `${niche} Myth vs Reality`,
        hook: "Everything you were told about this is wrong.",
        explanation: `Break one common ${niche} myth, then show a practical replacement strategy.`
      },
      {
        title: `30-Second ${niche} Framework`,
        hook: "If you have 30 seconds, do this first.",
        explanation: "Teach one high-impact tactic in a short repeatable sequence."
      },
      {
        title: `${niche} Before vs After`,
        hook: "Here is the difference one change made.",
        explanation: "Use a before/after structure with a measurable result."
      }
    ]
  };
}
