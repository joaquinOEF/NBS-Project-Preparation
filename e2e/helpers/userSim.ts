// LLM-simulated user — plays a community-org member completing the Phase-1
// org-profile chat, so the "full" e2e test can drive the REAL agent without a
// human. A small, cheap Claude (haiku by default) reads the agent's latest
// question (+ any chip options) and replies naturally from a fixed persona.
//
// Needs a key in the test env: ANTHROPIC_API_KEY (the user sim's own model call,
// separate from the deployment's agent). Model override: USER_SIM_MODEL.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.USER_SIM_MODEL || 'claude-haiku-4-5-20251001';

// The persona. Concrete, consistent facts so the agent can build a real profile.
const PERSONA = `You are role-playing a member of a small community organization doing an onboarding chat to create its profile. Stay in character. Your organization's facts:

- Name: "Horta Comunitária Cascata"
- Neighborhood / city: Cascata, Porto Alegre, Brazil
- Mission: grow agroecological food and reduce flooding in the neighborhood
- Legal form: community association, non-profit (associação comunitária sem fins lucrativos)
- Team: about 12 people — 8 volunteers and 4 with small grants
- Founded: 8 years ago (2018)
- What you've done: raised garden beds, rainwater capture, community work-days (mutirões)
- Land: a plot lent by the city (comodato)
- Goal in this program: expand the garden and build a water-retention area

Rules:
- Reply as the human would: short, natural, ONE answer at a time. Don't dump every fact at once — answer only what was asked.
- Match the assistant's language (it will usually be Portuguese; reply in Portuguese then).
- If you are shown multiple-choice options, reply with the EXACT text of the option that best fits your org — nothing else.
- If asked something not in your facts, improvise something plausible and consistent.
- Never break character, never mention that you are an AI or a test.`;

type Turn = { role: 'user' | 'assistant'; content: string };

export class UserSim {
  private history: Turn[] = [];
  private apiKey: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('UserSim needs ANTHROPIC_API_KEY in the test env.');
    this.apiKey = key;
  }

  /** Seed the very first user message (the human opens the chat). */
  opener(): string {
    const msg = 'Olá! Queremos criar o perfil da nossa organização.';
    this.history.push({ role: 'assistant', content: msg }); // 'assistant' = the human, from the sim's POV
    return msg;
  }

  /**
   * Given the agent's latest message and any visible chip labels, produce the
   * human's next reply. From the sim model's POV the AGENT is the "user" and the
   * human persona is the "assistant".
   */
  async reply(agentMessage: string, chipLabels: string[]): Promise<string> {
    const optionsBlock = chipLabels.length
      ? `\n\n[The screen shows these choices — reply with the exact text of ONE of them:]\n${chipLabels.map(l => `- ${l}`).join('\n')}`
      : '';
    this.history.push({ role: 'user', content: (agentMessage || '(no text — continue)') + optionsBlock });

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: PERSONA,
        messages: this.history.map(t => ({ role: t.role, content: t.content })),
      }),
    });
    if (!res.ok) throw new Error(`UserSim model call failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = (data.content?.[0]?.text ?? '').trim();
    this.history.push({ role: 'assistant', content: text });
    return text;
  }
}

/** Match the sim's reply to a visible chip label (case/space-insensitive). */
export function matchChip(reply: string, chipLabels: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const r = norm(reply);
  // exact, then containment either way (the model sometimes adds punctuation).
  return (
    chipLabels.find(l => norm(l) === r) ||
    chipLabels.find(l => r.includes(norm(l))) ||
    chipLabels.find(l => norm(l).includes(r)) ||
    null
  );
}
