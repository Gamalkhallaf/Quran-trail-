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

    // ── Step 1: Whisper transcription ────────────────────────────────────────
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "recitation.webm", contentType: mimeType || "audio/webm" });
    form.append("model", "whisper-1");
    form.append("language", "ar");
    form.append("prompt", `تلاوة قرآنية من سورة ${surahName}، الآية: ${ayahText}`);

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, ...form.getHeaders() },
      body: form,
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

ما سجّله الميكروفون من تلاوة المتعلم (عبر Whisper): "${transcript}"

قارن بدقة بين الآية الصحيحة وما قرأه المتعلم، وحلّل أحكام التجويد.

أجب بـ JSON فقط بدون أي نص خارجه، بالهيكل الآتي:
{
  "transcript": "النص المسموع كما هو",
  "score": رقم من 0 إلى 100,
  "summary": "جملة واحدة تلخّص مستوى التلاوة",
  "word_errors": [
    {
      "wrong": "الكلمة كما نُطقت",
      "correct": "الكلمة الصحيحة",
      "reason": "سبب الخطأ بالتفصيل"
    }
  ],
  "tajweed_rules": [
    {
      "rule": "اسم الحكم (إدغام / إخفاء / إظهار / قلقلة / مدّ / غنّة / تفخيم / ترقيق...)",
      "location": "الكلمة أو الموضع في الآية",
      "status": "correct أو error أو missed",
      "explanation": "شرح الحكم وكيفية أدائه الصحيح"
    }
  ],
  "makharij_notes": "ملاحظات على مخارج الحروف إن وُجدت أخطاء",
  "praise": "كلمة تشجيع مناسبة للمتعلم",
  "next_focus": "أهم حكم أو نقطة يركز عليها في التدريب القادم"
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
    const analysis = JSON.parse(text);

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
