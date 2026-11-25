
const GOOGLE_CLIENT_ID = "256842256431-h4b0h12f6igg6kcjmp9udh2n1p3vicip.apps.googleusercontent.com";

const chatArea = document.getElementById("chat-area");
const chatForm = document.getElementById("chat-form");
const questionInput = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");

const plusBtn = document.getElementById("plus-btn");
const attachMenu = document.getElementById("attach-menu");
const cameraOptionBtn = document.getElementById("camera-option-btn");
const galleryOptionBtn = document.getElementById("gallery-option-btn");
const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const imagePreviewBar = document.getElementById("image-preview-bar");
const imagePreviewThumb = document.getElementById("image-preview-thumb");
const imagePreviewName = document.getElementById("image-preview-name");
const removeImageBtn = document.getElementById("remove-image-btn");

const webcamModal = document.getElementById("webcam-modal");
const webcamVideo = document.getElementById("webcam-video");
const webcamCanvas = document.getElementById("webcam-canvas");
const webcamStatus = document.getElementById("webcam-status");
const capturePhotoBtn = document.getElementById("capture-photo-btn");
const closeWebcamBtn = document.getElementById("close-webcam-btn");

const authModal = document.getElementById("auth-modal");
const gsiContainer = document.getElementById("gsi-button-container");
const authStatus = document.getElementById("auth-status");
const guestLoginBtn = document.getElementById("guest-login-btn");
const closeModalBtn = document.getElementById("close-modal-btn");

const userBadge = document.getElementById("user-badge");
const loginHeaderBtn = document.getElementById("login-header-btn");
const logoutBtn = document.getElementById("logout-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");

const STORAGE_KEY = "fhmha_ai_user";
let currentUser = loadSavedUser();
let pendingPayload = null;
let selectedImage = null; 
let webcamStream = null;
let isBusy = false;
let chatHistory = [];

function loadSavedUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  currentUser = user;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {}
  renderAuthUI();
}

function clearUser() {
  currentUser = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  renderAuthUI();
}

function renderAuthUI() {
  if (currentUser?.name) {
    userBadge.textContent = currentUser.name;
    userBadge.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loginHeaderBtn.classList.add("hidden");
  } else {
    userBadge.textContent = "";
    userBadge.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    loginHeaderBtn.classList.remove("hidden");
  }
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("رمز الدخول غير صالح");
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

function handleGoogleCredentialResponse(response) {
  try {
    if (!response?.credential) {
      throw new Error("لم يتم استلام بيانات الحساب من Google");
    }
    const payload = decodeJwtPayload(response.credential);
    saveUser({
      name: payload.name || payload.email || "مستخدم Google",
      email: payload.email || "",
      provider: "google"
    });
    completePendingPayload();
  } catch (err) {
    authStatus.textContent = `تعذر إتمام دخول Google (${err.message}). يمكنك استخدام المتابعة السريعة.`;
  }
}

function initGoogleSignIn() {
  const hasRealClientId =
    GOOGLE_CLIENT_ID &&
    !GOOGLE_CLIENT_ID.includes("ضع_باقي_المعرف_هنا") &&
    GOOGLE_CLIENT_ID.trim().endsWith(".apps.googleusercontent.com");

  if (!hasRealClientId) {
    gsiContainer.classList.add("hidden");
    authStatus.textContent = "لم يتم وضع GOOGLE_CLIENT_ID الكامل بعد؛ استخدم المتابعة السريعة أدناه.";
    return;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (window.google?.accounts?.id) {
      clearInterval(timer);
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID.trim(),
          callback: handleGoogleCredentialResponse,
          ux_mode: "popup"
        });
        window.google.accounts.id.renderButton(gsiContainer, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: 290
        });
        authStatus.textContent = "";
      } catch {
        authStatus.textContent = "تعذر تهيئة زر Google؛ يمكنك استخدام المتابعة السريعة.";
      }
    } else if (attempts >= 30) {
      clearInterval(timer);
      authStatus.textContent = "تعذر تحميل خدمة Google؛ يمكنك استخدام المتابعة السريعة.";
    }
  }, 200);
}

function openAuthModal(payload = null) {
  pendingPayload = payload;
  authModal.classList.remove("hidden");
}

function closeAuthModal() {
  authModal.classList.add("hidden");
  pendingPayload = null;
}

/* ضغط الصورة لتقليل الحجم وضمان سرعة الرفع وحلها بدقة */
function compressAndReadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ملف الصورة غير صالح"));
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        const base64Data = dataUrl.split(",")[1];
        resolve({
          data: base64Data,
          mimeType,
          dataUrl,
          name: file.name || "صورة مسألة"
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setSelectedImage(imgObj) {
  selectedImage = imgObj;
  imagePreviewThumb.src = imgObj.dataUrl;
  imagePreviewName.textContent = imgObj.name;
  imagePreviewBar.classList.remove("hidden");
}

function clearSelectedImage() {
  selectedImage = null;
  imagePreviewThumb.src = "";
  imagePreviewBar.classList.add("hidden");
  cameraInput.value = "";
  galleryInput.value = "";
}

async function handleFileChosen(file) {
  if (!file) return;
  try {
    const compressed = await compressAndReadImage(file);
    setSelectedImage(compressed);
    questionInput.focus();
  } catch (err) {
    alert(err.message || "حدث خطأ أثناء تجهيز الصورة");
  }
}

/* فتح قائمة زر + */
plusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = attachMenu.classList.toggle("hidden");
  plusBtn.setAttribute("aria-expanded", String(!isHidden));
});

document.addEventListener("click", (e) => {
  if (!attachMenu.contains(e.target) && e.target !== plusBtn) {
    attachMenu.classList.add("hidden");
    plusBtn.setAttribute("aria-expanded", "false");
  }
});

/* اختيار صورة من الجهاز */
galleryOptionBtn.addEventListener("click", () => {
  attachMenu.classList.add("hidden");
  galleryInput.click();
});

galleryInput.addEventListener("change", (e) => {
  handleFileChosen(e.target.files?.[0]);
});

/* تصوير بالكاميرا (موبايل أو كاميرا ويب للكمبيوتر) */
cameraOptionBtn.addEventListener("click", async () => {
  attachMenu.classList.add("hidden");
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    cameraInput.click();
    return;
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      webcamStatus.textContent = "";
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      webcamVideo.srcObject = webcamStream;
      webcamModal.classList.remove("hidden");
    } catch {
      cameraInput.click();
    }
  } else {
    cameraInput.click();
  }
});

cameraInput.addEventListener("change", (e) => {
  handleFileChosen(e.target.files?.[0]);
});

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
  webcamVideo.srcObject = null;
  webcamModal.classList.add("hidden");
}

capturePhotoBtn.addEventListener("click", () => {
  if (!webcamVideo.videoWidth) return;
  webcamCanvas.width = webcamVideo.videoWidth;
  webcamCanvas.height = webcamVideo.videoHeight;
  const ctx = webcamCanvas.getContext("2d");
  ctx.drawImage(webcamVideo, 0, 0);

  const mimeType = "image/jpeg";
  const dataUrl = webcamCanvas.toDataURL(mimeType, 0.85);
  const base64Data = dataUrl.split(",")[1];
  setSelectedImage({
    data: base64Data,
    mimeType,
    dataUrl,
    name: "لقطة كاميرا"
  });
  stopWebcam();
  questionInput.focus();
});

closeWebcamBtn.addEventListener("click", stopWebcam);
removeImageBtn.addEventListener("click", clearSelectedImage);

function appendMessage(text, role, imageDataUrl = null) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (imageDataUrl) {
    const imgEl = document.createElement("img");
    imgEl.src = imageDataUrl;
    imgEl.alt = "صورة مرفوعة";
    imgEl.className = "chat-sent-image";
    bubble.appendChild(imgEl);
  }

  if (text) {
    const textEl = document.createElement("div");
    textEl.textContent = text;
    bubble.appendChild(textEl);
  }

  row.appendChild(bubble);
  chatArea.appendChild(row);
  chatArea.scrollTop = chatArea.scrollHeight;
  return row;
}

function waitOneSecond() {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

async function fetchAnswerFromServer(question, imageObj) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      image: imageObj ? { data: imageObj.data, mimeType: imageObj.mimeType } : null,
      history: chatHistory
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `خطأ في الاتصال بالخادم (${res.status})`);
  }
  if (!data.answer) {
    throw new Error("لم يرجع الخادم نص الإجابة");
  }
  return data.answer;
}

async function runQuestion({ question, imageObj }) {
  if (isBusy) return;
  isBusy = true;
  sendBtn.disabled = true;

  const displayText = question || "حل هذه الصورة من فضلك";
  appendMessage(displayText, "user", imageObj?.dataUrl || null);
  const thinkingRow = appendMessage("جاري التفكير وتحليل المطلوب...", "bot");

  try {
    const [answer] = await Promise.all([
      fetchAnswerFromServer(question, imageObj),
      waitOneSecond()
    ]);
    thinkingRow.remove();
    appendMessage(answer, "bot");
    chatHistory.push({ role: "user", text: displayText });
    chatHistory.push({ role: "model", text: answer });
  } catch (err) {
    await waitOneSecond();
    thinkingRow.remove();
    appendMessage(
      `حدثت مشكلة أثناء جلب الإجابة: ${err.message}\n\nهل فهمت ولا أعيدها تاني؟`,
      "bot"
    );
  } finally {
    isBusy = false;
    sendBtn.disabled = false;
    questionInput.focus();
  }
}

function completePendingPayload() {
  const payload = pendingPayload;
  closeAuthModal();
  if (payload) {
    runQuestion(payload);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (isBusy) return;

  const question = questionInput.value.trim();
  const imageObj = selectedImage;

  if (!question && !imageObj) return;

  questionInput.value = "";
  questionInput.style.height = "auto";
  clearSelectedImage();

  const payload = { question, imageObj };

  if (!currentUser) {
    openAuthModal(payload);
    return;
  }

  runQuestion(payload);
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 140)}px`;
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const q = btn.getAttribute("data-q");
    if (!q) return;
    const payload = { question: q, imageObj: null };
    if (!currentUser) {
      openAuthModal(payload);
      return;
    }
    runQuestion(payload);
  });
});

loginHeaderBtn.addEventListener("click", () => openAuthModal(null));

guestLoginBtn.addEventListener("click", () => {
  saveUser({
    name: "طالب ذكاء اصطناعي",
    email: "",
    provider: "guest"
  });
  completePendingPayload();
});

closeModalBtn.addEventListener("click", closeAuthModal);

logoutBtn.addEventListener("click", () => {
  clearUser();
});

clearChatBtn.addEventListener("click", () => {
  chatHistory = [];
  clearSelectedImage();
  chatArea.innerHTML = `
    <div class="welcome-card">
      <h2>محادثة جديدة في «فهمها» 👋</h2>
      <p>اكتب سؤالك أو اضغط على <strong>+</strong> لتصوير مسألة أو رفع صورة وحلها.</p>
    </div>
  `;
});

renderAuthUI();
initGoogleSignIn();
