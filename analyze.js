const FormData = require("form-data");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

  try {
    const body = JSON.parse(event.body);
    const { audioBase64, mimeType, ayahText, surahName, ayahNum } = body;

    if (!audioBase64 || !ayahText) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing audioBase64 or ayahText" }) };
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    if (!OPENAI_KEY || !ANTHROPIC_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "API keys not configured on server" }) };
    }

    // ── Step 1: Whisper via multipart/form-data ──────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const mime = mimeType || "audio/webm";
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";

    const form = new FormData();
    form.append("file", audioBuffer, { filename: `rec.${ext}`, contentType: mime });
    form.append("model", "whisper-1");
    form.append("language", "ar");
    form.append("prompt", `قرآن كريم سورة ${surahName}`);

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      throw new Error(`Whisper error: ${err}`);
    }

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text?.trim() || "";

    // ── Step 2: Claude tajweed analysis ──────────────────────────────────────
    const prompt = `أنت شيخ متخصص في علم التجويد وعلوم القرآن الكريم.

الآية الكريمة: "${ayahText}"
من سورة: ${surahName} — الآية رقم: ${ayahNum}

ما سجّله الميكروفون من تلاوة المتعلم: "${transcript}"

قارن بدقة بين الآية الصحيحة وما قرأه المتعلم، وحلّل أحكام التجويد.

أجب بـ JSON فقط بدون أي نص خارجه:
{
  "score": 0-100,
  "summary": "جملة واحدة",
  "word_errors": [{"wrong": "...", "correct": "...", "reason": "..."}],
  "tajweed_rules": [{"rule": "...", "location": "...", "status": "correct|error|missed", "explanation": "..."}],
  "makharij_notes": "...",
  "praise": "...",
  "next_focus": "..."
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    let text = claudeData.content.map((c) => c.text || "").join("");
    text = text.replace(/```json|```/g, "").trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if(jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in Claude response');
    text = text.slice(jsonStart, jsonEnd + 1);
    text = text.replace(/[\u0000-\u001F\u007F]/g, ' ');
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch(e) {
      analysis = {
        score: 70, summary: "تمت التلاوة", word_errors: [], tajweed_rules: [],
        praise: "أحسنت، استمر في التدريب",
        next_focus: "حاول التسجيل مرة أخرى للحصول على تحليل أدق"
      };
    }

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, transcript, analysis }),
    };

  } catch (err) {
    console.error("analyze error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
