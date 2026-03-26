export const CLIENT_NICHE_PROFILE = {
  name: "Arab/Moroccan/Western cultural tension + controversial relationships",
  requiredSignals: [
    "cultural tension",
    "identity / immigration",
    "relationship power dynamics (money/control/loyalty)",
    "religion vs modern lifestyle",
    "controversial POV"
  ],
  emotionalTriggers: ["anger", "ego", "identity", "jealousy", "curiosity"],
  tensionTopics: [
    "culture clash",
    "gender roles",
    "money / provider mindset",
    "loyalty / attention / status",
    "religion vs modern dating"
  ],
  contentStyles: ["POV", "ragebait", "dark humor", "text-overlay reels"],
  tone: ["confident", "slightly provocative", "emotionally triggering", "real-life", "slight attitude/dominance energy"]
};

export const CLIENT_NICHE_HIDDEN_CONTEXT = `
Hidden client niche context (always apply):
This content is for a creator focused on cultural identity (Arab/Moroccan/Western duality), immigration/identity tension,
controversial relationship power dynamics (money, control, loyalty), gender roles, interracial relationships,
religion vs modern lifestyle tension, and provocative POV opinions.

Hard rules:
- Reject generic viral/educational content.
- Must include at least ONE: cultural tension OR relationship conflict OR controversial POV.
- Must include an emotional trigger (ego/anger/identity/jealousy/curiosity) and a tension point.
- Short, punchy, human voice. No long paragraphs. No AI-sounding filler.
`.trim();

export function hasClientNicheSignals(text) {
  const t = String(text || "").toLowerCase();
  const cultural = /\b(arab|moroccan|morocco|culture|western|diaspora|immigrant|immigration|identity)\b/.test(t);
  const relationship = /\b(50\/50|provider|pays|bills|expensive|standards|princess|loyal|cheat|attention|status|control|dominant|submissive)\b/.test(
    t
  );
  const religion = /\b(religion|halal|haram|hijab|tradition|traditional|modern)\b/.test(t);
  const controversy = /\b(hot take|controvers|unpopular|people are wrong|i laughed|stop saying|truth is)\b/.test(t);
  return cultural || relationship || religion || controversy;
}

