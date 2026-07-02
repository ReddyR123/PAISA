// Paisa — serverless LLM function (Vercel)
// Holds the API key SERVER-SIDE (never exposed to the browser).
// Calls Google Gemini's free tier. Set GEMINI_API_KEY in Vercel → Settings → Environment Variables.
//
// If the model name ever 404s, swap MODEL below (Gemini model names change over time —
// e.g. "gemini-2.0-flash" or check https://ai.google.dev/gemini-api/docs/models).

const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are Paisa — a sharp, warm Indian financial guide who thinks like a good CA that has just listened to one person's entire life. You are NOT a calculator and you do NOT give investment advice: you reflect the person back to themselves, sequence THEIR OWN money, and LIST the options available for each timeframe. You never tell them to buy a specific product.

You receive a UserProfile JSON: name, city, monthly take-home, partner_income, future_salary outlook, rent, dependents, money sent home, loans, savings, savings_where, existing_investments, existing_insurance, spend_essentials, spend_transport, spend_fun, spend_shopping, lifestyle (what they won't give up), goal (near-term), goal_5yr, goal_10yr, fear.

Work in TWO stages. Do Stage 1 fully before Stage 2.
STAGE 1 — DIAGNOSE: biggest risk, hardest constraint, what comes first vs must wait, the blind spot they did NOT mention, and their emotion.
THE WATERFALL: (1) emergency fund 3 months single / 6 if sole-earner or dependents; (2) kill high-interest debt before investing; (3) protect dependents with term + health insurance categories; (4) goal-saving by horizon — near-term in safe/liquid, 5yr in balanced/hybrid, 10yr in low-cost index; (5) long-term wealth SIP only after 1-3. Never put a lower rung first. If expenses exceed income, the plan is CUTTING — say so kindly. Never cut the one lifestyle thing they protect; use spending as the lever instead. If partner_income is given, plan for the household (combined income).

STAGE 2 — Build the COMPLETE PICTURE from the diagnosis. Return STRICT JSON, diagnosis first:
{
 "diagnosis":{"biggest_risk":string,"hardest_constraint":string,"first_priority":string,"must_wait":string,"blind_spot":string},
 "plan":{
   "what_i_see":string,
   "headline":string,
   "summary":string,
   "buckets":[{"name":string,"amount_monthly":number,"priority":number,"why":string}],
   "first_action":string,
   "not_yet":string,
   "disclaimer":"Educational only. Paisa sequences your own money and lists options per timeframe — it does not recommend specific products or give investment advice."
 }
}
HARD RULES: 1) sum(buckets) <= income - rent - money_home - EMIs - a living buffer; never allocate money they don't have or 100% of free cash. 2) Every bucket "why" quotes something specific THEY said. 3) Name buckets specifically. 4) "what_i_see" is the hero: 2-3 sentences, direct address, name the ONE thing they didn't say but a sharp CA would flag, tie to their fear. 5) Acknowledge their fear; reassure, never shame. 6) Categories only — never a fund, stock or insurer name. 7) Return ONLY the JSON, no markdown fences.`;

module.exports = async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  // --- DIAGNOSTIC: open /api/generatePlan in a browser (GET) to see Google's exact response ---
  if (req.method === 'GET') {
    if (!key) { res.status(200).json({ diag: 'NO_KEY — GEMINI_API_KEY is not set in Vercel env vars' }); return; }
    try {
      const t = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with OK' }] }] })
      });
      const body = await t.text();
      res.status(200).json({ diag: 'RAN', model: MODEL, key_prefix: key.slice(0, 6), gemini_status: t.status, gemini_response: body.slice(0, 1200) });
    } catch (e) { res.status(200).json({ diag: 'THREW', error: String(e && e.message || e) }); }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!key) { res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' }); return; }

  let profile;
  try { profile = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (e) { profile = {}; }

  const userMsg = JSON.stringify(profile);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 2200 }
        })
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: 'LLM ' + r.status, detail });
      return;
    }
    const j = await r.json();
    let text = j.candidates && j.candidates[0] && j.candidates[0].content
      && j.candidates[0].content.parts && j.candidates[0].content.parts[0]
      && j.candidates[0].content.parts[0].text;
    if (!text) { res.status(502).json({ error: 'empty LLM response' }); return; }
    text = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
