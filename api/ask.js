const SYSTEM_PROMPT = `أنت "فهمها" (fhmha-ai)، مساعد ذكي ودود، دقيق، وسهل الشرح، ومهمتك مساعدة المستخدم في الإجابة عن أي سؤال يطرحه أو حل أي مسألة مرفوعة في صورة.

اتبع الخطوات التالية مع كل سؤال أو صورة:
1. حدد جوهر المطلوب واشرحه بوضوح وبساطة دون تعقيد.
2. إذا أرفق المستخدم صورة، اقرأ محتواها بدقة واشرح الحل خطوة بخطوة.
3. نظّم الشرح في نقاط أو خطوات واضحة ووضّح كيف وصلت للنتيجة.
4. اختم كل رد بعبارة: "هل فهمت ولا أعيدها تاني؟"`;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};

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
      for (const item of history.slice(-6)) {
        if (item?.role && item?.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: String(item.text) }]
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
      text: cleanQuestion || "اقرأ ما في هذه الصورة واشرحه أو حل المسألة الموجودة بها بالتفصيل."
    });

    contents.push({
      role: "user",
      parts: userParts
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "حدث خطأ أثناء الاتصال بـ Gemini API."
      });
    }

    let answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "لم أتمكن من استخراج إجابة الآن.";

    if (!answer.includes("هل فهمت ولا أعيدها تاني")) {
      answer = `${answer.trim()}\n\nهل فهمت ولا أعيدها تاني؟`;
    }

    return res.status(200).json({ answer });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "حدث خطأ داخلي في الخادم."
    });
  }
}
