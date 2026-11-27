const SYSTEM_PROMPT = `أنت "فهمها" (fhmha-ai)، مساعد دراسي سريع ومباشر.

قواعد الرد:
1. ادخل في الشرح مباشرة دون مقدمات أو إطالة.
2. اشرح في نقاط قصيرة وواضحة مع مثال عملي مختصر عند الحاجة.
3. إذا وُجدت صورة، اقرأها بدقة واكتب الحل في خطوات سريعة ومباشرة.
4. اختم الرد بـ: "هل فهمت ولا أعيدها تاني؟"`;

const PRIMARY_MODEL = "gemini-3.8-flash";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, image, history } = req.body || {};
    const cleanQuestion = question ? String(question).trim() : "";
    const hasImage = Boolean(image?.data && image?.mimeType);

    if (!cleanQuestion && !hasImage) {
      return res.status(400).json({ error: "يرجى كتابة سؤال أو اختيار صورة أولاً." });
    }

    const apiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
    ].filter(Boolean);

    if (apiKeys.length === 0) {
      return res.status(500).json({
        error: "مفتاح GEMINI_API_KEY غير مضبوط في Environment Variables على Vercel.",
      });
    }

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-2)) {
        if (item?.role && item?.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: String(item.text).slice(0, 600) }],
          });
        }
      }
    }

    const userParts = [];
    if (hasImage) {
      userParts.push({
        inline_data: {
          mime_type: String(image.mimeType),
          data: String(image.data),
        },
      });
    }

    userParts.push({
      text: cleanQuestion || "اشرح ما في الصورة أو حل المسألة بخطوات سريعة ومختصرة.",
    });

    contents.push({
      role: "user",
      parts: userParts,
    });

    let lastStatus = 503;
    let lastError = "حدث خطأ أثناء الاتصال بـ Gemini API.";
    let sawOverload = false;

    for (let k = 0; k < apiKeys.length; k++) {
      const apiKey = apiKeys[k].trim();
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);

        let response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }],
              },
              generationConfig: {
                maxOutputTokens: 700,
                temperature: 0.3,
              },
              contents,
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          let answer =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "لم أتمكن من استخراج إجابة الآن.";

          if (!answer.includes("هل فهمت ولا أعيدها تاني")) {
            answer = `${answer.trim()}\n\nهل فهمت ولا أعيدها تاني؟`;
          }

          return res.status(200).json({ answer });
        }

        lastStatus = response.status;
        lastError = data?.error?.message || "حدث خطأ أثناء الاتصال بـ Gemini API.";

        const isOverload =
          response.status === 503 ||
          response.status === 429 ||
          /high demand|overloaded|try again|unavailable/i.test(lastError);

        if (!isOverload) {
          return res.status(lastStatus).json({ error: lastError });
        }

        sawOverload = true;
        if (attempt === 0) {
          await sleep(300);
        }
      }
    }

    if (sawOverload) {
      return res.status(503).json({
        error: "الموديل عليه ضغط حاليًا، اضغط إرسال مرة ثانية بعد لحظات.",
      });
    }

    return res.status(lastStatus).json({ error: lastError });
  } catch (err) {
    console.error("Handler error:", err);

    if (err?.name === "AbortError") {
      return res.status(504).json({
        error: "الرد أخذ وقتًا أطول من المتوقع، جرّب إرسال السؤال مرة أخرى.",
      });
    }

    return res.status(500).json({
      error: err?.message || "حدث خطأ داخلي في الخادم.",
      details: String(err),
    });
  }
}
  
