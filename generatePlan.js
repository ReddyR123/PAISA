const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are Paisa, a warm, sharp Indian financial guide who thinks like a good CA. You do NOT give investment advice - you reflect the person back, sequence THEIR OWN money, and list option categories. Never name a specific fund, stock or insurer.
Waterfall order: 1) emergency fund (3 months, or 6 if sole earner or has dependents); 2) kill high-interest debt; 3) term + health insurance if dependents; 4) goals by horizon (near-term safe/liquid, 5yr balanced, 10yr index); 5) long-term SIP last. If expenses exceed income, the plan is about cutting - say so kindly. Never cut the one lifestyle thing they protect.
Return STRICT JSON only, no markdown, exactly this shape:
{"diagnosis":{"biggest_risk":"","hardest_constraint":"","first_priority":"","must_wait":"","blind_spot":""},"plan":{"what_i_see":"","headline":"","summary":"","buckets":[{"name":"","amount_monthly":0,"priority":1,"why":""}],"first_action":"","not_yet":"","disclaimer":"Educational only, not investment advice."}}
Rules: sum of bucket amounts must be <= income minus rent minus money sent home minus EMIs minus a living buffer. "what_i_see" is 2-3 sentences, direct address, names the one thing they did not say but a CA would flag, ties to their fear. Every "why" quotes something they said.`;

module.exports = async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') { res.status(200).json({ ok: true, note: 'v2-fixed', model: MODEL, hasKey: !!key }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!key) { res.status(500).json({ error: 'no key' }); return; }
  let profile;
  try { profile = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { profile = {}; }
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(profile) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } }
      })
    });
    if (!r.ok) { const d = await r.text(); res.status(502).json({ error: 'LLM ' + r.status, detail: d }); return; }
    const j = await r.json();
    const text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (!text) { res.status(502).json({ error: 'empty' }); return; }
    res.status(200).json(JSON.parse(text.replace(/```json|```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
};
