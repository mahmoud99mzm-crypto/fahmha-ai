const SYSTEM_PROMPT = `أنت "فهمها" (fhmha-ai)، مساعد تعليمي سريع، ودود، ودقيق.

قواعد الرد:
1. ادخل في الشرح مباشرة دون مقدمات طويلة.
2. إذا وُجدت صورة، اقرأها بدقة واشرح الحل في خطوات مختصرة وواضحة.
3. اجعل الشرح مركّزًا ومباشرًا لتجنب الإطالة والانتظار.
4. اختم كل رد بعبارة: "هل فهمت ولا أعيدها تاني؟"`;

const MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash"
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return res.status(500).json({
        error: "مفتاح GEMINI_API_KEY غير مضبوط في Environment Variables على Vercel."
      });
    }

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-4)) {
        if (item?.role && item?.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: String(item.text).slice(0, 1200) }]
          });
        }
      }
    }

    const userParts = [];
    if (hasImage) {
      userParts.push({
        inline_data: {
          mime_type: String(image.mimeType),
          data: String(image.data)
        }
      });
    }

    userParts.push({
      text: cleanQuestion || "اشرح ما في الصورة أو حل المسألة بخطوات مختصرة وواضحة."
    });

    contents.push({
      role: "user",
      parts: userParts
    });

    let lastError = null;
    let lastStatus = 500;

    for (const model of MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

      // محاولتان سريعتان لكل موديل عند الضغط المؤقت
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }]
              },
              generationConfig: {
                maxOutputTokens: 1100,
                temperature: 0.4
              },
              contents
            })
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

        const isTemporaryOverload =
          response.status === 503 ||
          response.status === 429 ||
          /high demand|overloaded|try again|unavailable/i.test(lastError);

        if (!isTemporaryOverload) {
          return res.status(lastStatus).json({ error: lastError });
        }

        if (attempt === 0) {
          await sleep(450);
        }
      }
    }

    return res.status(lastStatus).json({
      error: "الخادم مضغوط حاليًا، جرّب إرسال السؤال مرة أخرى بعد ثوانٍ."
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return res.status(504).json({
        error: "استغرق الرد وقتًا أطول من المعتاد، جرّب إرسال السؤال مرة أخرى."
      });
    }

    return res.status(500).json({
      error: err?.message || "حدث خطأ داخلي في الخادم."
    });
  }
}
