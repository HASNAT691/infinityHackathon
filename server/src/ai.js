// Transcript -> structured JSON via OpenRouter. The model only returns content + directory refs;
// our code validates everything and generates database IDs.
const MEETING_DATE = '2026-10-07';

const SYSTEM_PROMPT = `You are a precise project-planning extraction engine for NovaWorks Technologies.
Convert a meeting transcript into projects and tasks as JSON.

Rules:
1. Use ONLY people from the DIRECTORY. Refer to them by their "id". Never invent people.
   People mentioned who are not in the DIRECTORY (e.g. client contacts) must never be assigned.
   Match a speaker to a DIRECTORY person by first name or full name only. A match on a surname
   alone (e.g. "Noor" vs "Sara Noor") is NOT a match: treat that person as unresolved.
   Issues must be plain strings.
2. managerId must be a user with role MANAGER. assigneeId must be a user with role AGENT.
3. Follow FINAL decisions. When something is corrected later in the meeting (new date, new
   estimate, new owner), use the latest agreed value. A final recap, if present, is authoritative.
4. Exclude features the meeting rejected or deferred (they must not become tasks).
5. Do not merge separate tasks, even if they have the same owner. Do not split a task the
   meeting asked to keep as one. Do not create management-hour tasks.
6. Dates are ISO YYYY-MM-DD. Meeting date is ${MEETING_DATE}; resolve dates without a year to that year.
7. estimatedHours = effort hours stated in the meeting (not calendar days).
8. Task titles: use the names agreed in the meeting. Descriptions: 1-2 sentences of agreed scope.
9. If a required value (manager, assignee, deadline, hours) cannot be determined, set it to null
   and add an entry to "issues" explaining what is missing. Do not guess.

Return ONLY JSON (no markdown) in exactly this shape:
{
  "projects": [
    { "name": "", "clientName": "", "description": "", "managerId": "", "deadline": "YYYY-MM-DD",
      "tasks": [ { "title": "", "description": "", "assigneeId": "", "deadline": "YYYY-MM-DD", "estimatedHours": 0 } ] }
  ],
  "issues": []
}`;

// Free models queue under load; give up on a slow model and move to the next one.
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS) || 60000;

async function callModel(model, transcript, directory) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `DIRECTORY:\n${JSON.stringify(directory, null, 1)}\n\nTRANSCRIPT:\n${transcript}` },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `AI provider returned HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content || '';
  return parseJSON(text);
}

function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('AI did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Tries the primary model, then each fallback in order (comma-separated list in the env).
export async function extractPlan(transcript, directory) {
  const models = [process.env.OPENROUTER_MODEL, ...(process.env.OPENROUTER_FALLBACK_MODEL || '').split(',')]
    .map(m => m?.trim()).filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const started = Date.now();
      const draft = await callModel(model, transcript, directory);
      return { draft, model, ms: Date.now() - started };
    } catch (e) {
      lastErr = e;
      console.warn(`[ai] ${model} failed: ${e.message}`);
    }
  }
  throw new Error(`AI extraction failed: ${lastErr?.message || 'no model configured'}`);
}
