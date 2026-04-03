const STORAGE_PREFIX = "local-quiz-bank";
const DB_NAME = "local-quiz-bank-db";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "default-questions-handle";

const state = {
  source: null,
  bank: {
    bankId: "",
    sourceLabel: "",
    items: [],
    chapters: [],
    chapterStats: [],
    errors: [],
  },
  wrongSet: new Set(),
  session: null,
};

const refs = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheRefs();
  bindEvents();
  updateBankStats();
  renderChapterList();
  renderIdleExam("题库加载完成后，选择章节或进入错题库即可开始练习。");
  setStatus("正在尝试自动加载题库...");
  if (await tryLoadHostedManifest()) {
    return;
  }
  setStatus("默认题库目录为 questions，首次授权后会自动记住。");
  await tryAutoLoadRememberedDirectory();
});

function cacheRefs() {
  refs.pickDirectoryBtn = document.getElementById("pickDirectoryBtn");
  refs.initPanel = document.getElementById("initPanel");
  refs.reloadBtn = document.getElementById("reloadBtn");
  refs.folderInput = document.getElementById("folderInput");
  refs.sourceLabel = document.getElementById("sourceLabel");
  refs.statusText = document.getElementById("statusText");
  refs.chapterContainer = document.getElementById("chapterContainer");
  refs.totalCount = document.getElementById("totalCount");
  refs.chapterCount = document.getElementById("chapterCount");
  refs.wrongCount = document.getElementById("wrongCount");
  refs.bankSummary = document.getElementById("bankSummary");
  refs.startChapterBtn = document.getElementById("startChapterBtn");
  refs.startWrongBtn = document.getElementById("startWrongBtn");
  refs.clearWrongBtn = document.getElementById("clearWrongBtn");
  refs.examEmpty = document.getElementById("examEmpty");
  refs.examContent = document.getElementById("examContent");
  refs.modeLabel = document.getElementById("modeLabel");
  refs.progressLabel = document.getElementById("progressLabel");
  refs.jumpBtn = document.getElementById("jumpBtn");
  refs.questionTypeBadge = document.getElementById("questionTypeBadge");
  refs.questionMeta = document.getElementById("questionMeta");
  refs.questionBody = document.getElementById("questionBody");
  refs.manualWrongBtn = document.getElementById("manualWrongBtn");
  refs.submitBtn = document.getElementById("submitBtn");
  refs.resultModal = document.getElementById("resultModal");
  refs.resultModalBody = document.getElementById("resultModalBody");
  refs.resultModalConfirmBtn = document.getElementById("resultModalConfirmBtn");
  refs.jumpModal = document.getElementById("jumpModal");
  refs.jumpHintText = document.getElementById("jumpHintText");
  refs.jumpInput = document.getElementById("jumpInput");
  refs.jumpCancelBtn = document.getElementById("jumpCancelBtn");
  refs.jumpConfirmBtn = document.getElementById("jumpConfirmBtn");
}

function bindEvents() {
  refs.pickDirectoryBtn.addEventListener("click", onPickDirectory);
  refs.reloadBtn.addEventListener("click", onReloadSource);
  refs.folderInput.addEventListener("change", onFolderInputChange);
  refs.startChapterBtn.addEventListener("click", () => startSession("chapter"));
  refs.startWrongBtn.addEventListener("click", () => startSession("wrong"));
  refs.clearWrongBtn.addEventListener("click", clearWrongBank);
  refs.manualWrongBtn.addEventListener("click", onManualAddWrong);
  refs.submitBtn.addEventListener("click", submitCurrentQuestion);
  refs.jumpBtn.addEventListener("click", openJumpModal);
  refs.resultModalConfirmBtn.addEventListener("click", onResultModalConfirm);
  refs.jumpCancelBtn.addEventListener("click", closeJumpModal);
  refs.jumpConfirmBtn.addEventListener("click", confirmJump);
}

async function onPickDirectory() {
  setStatus("请选择 questions 题库目录...");
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      state.source = { type: "directory", handle };
      await saveDirectoryHandle(handle);
      await loadBankFromDirectoryHandle(handle);
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("已取消选择目录。");
      } else if (error) {
        setStatus(`目录读取失败：${error.message}`);
      }
      return;
    }
  }
  refs.folderInput.click();
}

async function onReloadSource() {
  if (state.source?.type === "manifest") {
    await tryLoadHostedManifest(true);
    return;
  }
  if (state.source?.type === "directory") {
    await loadBankFromDirectoryHandle(state.source.handle);
    return;
  }
  if (state.source?.type === "files") {
    await loadBankFromFiles(state.source.files, state.source.label);
    return;
  }
  await tryAutoLoadRememberedDirectory();
  if (!state.source) {
    setStatus("还没有可重新读取的题库，请先选择 questions 文件夹。");
  }
}

async function tryLoadHostedManifest(force = false) {
  try {
    const response = await fetch("./questions/manifest.json", { cache: force ? "no-store" : "default" });
    if (!response.ok) {
      return false;
    }

    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.files) || !manifest.files.length) {
      return false;
    }

    setStatus("正在从网站题库清单加载题目...");
    const files = await Promise.all(
      manifest.files.map(async (relativePath) => {
        const fileResponse = await fetch(`./questions/${relativePath}`, { cache: force ? "no-store" : "default" });
        if (!fileResponse.ok) {
          throw new Error(`${relativePath} 读取失败`);
        }
        return {
          name: relativePath.split("/").pop(),
          relativePath,
          text: await fileResponse.text(),
        };
      })
    );

    state.source = {
      type: "manifest",
      label: manifest.label || "questions",
    };

    await loadNormalizedFiles(files, manifest.label || "网站题库");
    return true;
  } catch (_error) {
    return false;
  }
}

async function onFolderInputChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    setStatus("未选择任何文件。");
    return;
  }

  const label = files[0].webkitRelativePath
    ? files[0].webkitRelativePath.split("/")[0]
    : "已选文件夹";

  state.source = {
    type: "files",
    files,
    label,
  };

  await loadBankFromFiles(files, label);
}

async function tryAutoLoadRememberedDirectory() {
  if (!window.showDirectoryPicker) {
    return;
  }

  const handle = await getSavedDirectoryHandle();
  if (!handle) {
    return;
  }

  try {
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      state.source = { type: "directory", handle };
      await loadBankFromDirectoryHandle(handle);
      return;
    }

    setStatus("已记住 questions 目录，点击“重新读取”或“选择题库目录”后授权即可自动加载。");
  } catch (_error) {
    setStatus("上次记住的题库目录已失效，请重新选择 questions 文件夹。");
  }
}

async function loadBankFromDirectoryHandle(handle) {
  const jsonEntries = await collectDirectoryJsonFiles(handle);
  const files = await Promise.all(
    jsonEntries.map(async (entry) => ({
      name: entry.handle.name,
      relativePath: entry.relativePath,
      text: await readFileHandleText(entry.handle),
    }))
  );

  await loadNormalizedFiles(files, `目录：${handle.name}`);
}

async function loadBankFromFiles(files, label) {
  const jsonFiles = files.filter(
    (file) => file.name.toLowerCase().endsWith(".json") && file.name.toLowerCase() !== "manifest.json"
  );
  const normalizedFiles = await Promise.all(
    jsonFiles.map(async (file) => ({
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      text: await file.text(),
    }))
  );

  await loadNormalizedFiles(normalizedFiles, `目录：${label}`);
}

async function loadNormalizedFiles(files, sourceLabel) {
  if (!files.length) {
    state.bank = buildEmptyBank(sourceLabel, ["没有读取到任何 .json 文件。"]);
    applyBankState();
    return;
  }

  setStatus("正在解析题库文件...");
  const sortedFiles = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
  const allItems = [];
  const errors = [];

  sortedFiles.forEach((file) => {
    try {
      const parsed = JSON.parse(file.text);
      const fileItems = normalizeQuestionFile(parsed, file.relativePath);
      allItems.push(...fileItems);
    } catch (error) {
      errors.push(`${file.relativePath}：${error.message}`);
    }
  });

  const orderedItems = allItems.map((item, index) => ({ ...item, order: index + 1 }));
  const chapterMap = new Map();

  orderedItems.forEach((item) => {
    if (!chapterMap.has(item.chapter)) {
      chapterMap.set(item.chapter, { chapter: item.chapter, count: 0 });
    }
    chapterMap.get(item.chapter).count += 1;
  });

  const bankId = createBankId(sourceLabel);
  state.bank = {
    bankId,
    sourceLabel,
    items: orderedItems,
    chapters: Array.from(chapterMap.keys()),
    chapterStats: Array.from(chapterMap.values()),
    errors,
  };
  state.wrongSet = loadWrongSet(bankId, orderedItems);
  state.session = null;
  applyBankState();
}

function buildEmptyBank(sourceLabel, errors) {
  return {
    bankId: "",
    sourceLabel,
    items: [],
    chapters: [],
    chapterStats: [],
    errors,
  };
}

function applyBankState() {
  refs.sourceLabel.textContent = state.bank.sourceLabel || "未加载题库";
  refs.initPanel.classList.toggle("hidden", state.bank.errors.length === 0);
  updateBankStats();
  renderChapterList();
  renderIdleExam(
    state.bank.items.length
      ? "题库已加载，请选择章节开始练习，或者进入错题库复习。"
      : "当前没有可用题目，请检查 questions 文件夹中的 JSON。"
  );

  if (state.bank.errors.length) {
    setStatus(`已加载 ${state.bank.items.length} 道题，但有 ${state.bank.errors.length} 个文件解析失败。`);
  } else if (state.bank.items.length) {
    setStatus(`题库加载完成，共 ${state.bank.items.length} 道题。`);
  } else {
    setStatus("未读取到有效题目。");
  }
}

function updateBankStats() {
  refs.totalCount.textContent = String(state.bank.items.length);
  refs.chapterCount.textContent = String(state.bank.chapters.length);
  refs.wrongCount.textContent = String(state.wrongSet.size);
  refs.bankSummary.textContent = `${state.bank.items.length} 道题`;
}

function renderChapterList() {
  const container = refs.chapterContainer;
  container.innerHTML = "";

  if (!state.bank.chapterStats.length) {
    container.className = "chapter-list empty-state";
    container.textContent = "读取题库后，这里会显示章节选择。";
    return;
  }

  container.className = "chapter-list";
  state.bank.chapterStats.forEach((entry, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "chapter-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry.chapter;
    checkbox.checked = true;
    checkbox.id = `chapter-${index}`;

    const main = document.createElement("div");
    main.className = "chapter-item__main";

    const title = document.createElement("strong");
    title.textContent = entry.chapter;

    const count = document.createElement("span");
    count.className = "chapter-item__count";
    count.textContent = `${entry.count} 道题`;

    main.append(title, count);
    wrapper.append(checkbox, main);
    container.appendChild(wrapper);
  });
}

function renderIdleExam(message) {
  refs.examEmpty.textContent = message;
  refs.examEmpty.classList.remove("hidden");
  refs.examContent.classList.add("hidden");
  refs.jumpBtn.classList.add("hidden");
  closeResultModal();
  closeJumpModal();
  refs.questionBody.innerHTML = "";
  refs.questionMeta.innerHTML = "";
}

function startSession(mode) {
  if (!state.bank.items.length) {
    setStatus("请先读取题库。");
    return;
  }

  const queue = buildSessionQueue(mode);

  if (!queue.length) {
    setStatus(mode === "wrong" ? "当前错题库为空。" : "请至少勾选一个有题目的章节。");
    return;
  }

  state.session = {
    mode,
    queue,
    index: 0,
    correctCount: 0,
    submitted: false,
    result: null,
    sharedStemResults: {},
  };

  renderCurrentQuestion();
}

function buildSessionQueue(mode) {
  const items =
    mode === "wrong"
      ? state.bank.items.filter((item) => state.wrongSet.has(item.uid))
      : state.bank.items.filter((item) => getSelectedChapters().has(item.chapter));

  return items.flatMap((item) => {
    if (item.kind === "group" && item.groupType === "sharedStem") {
      return item.questions.map((question) => ({
        itemUid: item.uid,
        questionUid: question.uid,
      }));
    }

    return [
      {
        itemUid: item.uid,
        questionUid: null,
      },
    ];
  });
}

function renderCurrentQuestion() {
  const entry = getCurrentEntry();
  const item = getCurrentItem();
  if (!item) {
    renderSessionSummary();
    return;
  }
  const sharedQuestion = getCurrentSharedQuestion();

  refs.examEmpty.classList.add("hidden");
  refs.examContent.classList.remove("hidden");
  closeResultModal();

  refs.modeLabel.textContent = state.session.mode === "wrong" ? "错题库练习" : "章节练习";
  refs.progressLabel.textContent = `第 ${state.session.index + 1} / ${state.session.queue.length} 题`;
  refs.jumpBtn.classList.toggle("hidden", state.session.mode !== "chapter");
  refs.questionTypeBadge.textContent = getQuestionTypeLabel(item);

  refs.questionMeta.innerHTML = "";
  appendMetaItem(`章节：${item.chapter}`);
  appendMetaItem(`题号：${item.displayNo}`);
  appendMetaItem(`来源：${item.sourcePath}`);
  if (state.session.mode === "wrong") {
    appendMetaItem("当前模式答对后会自动释放错题");
  }

  refs.questionBody.innerHTML = "";
  if (item.kind === "group" && item.groupType === "sharedStem" && entry?.questionUid && sharedQuestion) {
    refs.questionBody.appendChild(renderSharedStemItem(item, sharedQuestion));
  } else {
    refs.questionBody.appendChild(
      item.kind === "group"
        ? renderGroupItem(item)
        : renderSingleItem(item, { parentId: item.uid, subId: item.uid })
    );
  }

  refs.manualWrongBtn.classList.remove("hidden");
  refs.submitBtn.classList.remove("hidden");
  refs.submitBtn.disabled = false;
  refs.manualWrongBtn.disabled = state.wrongSet.has(item.uid);
  refs.manualWrongBtn.textContent = state.wrongSet.has(item.uid) ? "已在错题库" : "加入错题库";
}

function appendMetaItem(text) {
  const div = document.createElement("div");
  div.className = "question-meta__item";
  div.textContent = text;
  refs.questionMeta.appendChild(div);
}

function renderSingleItem(item, context) {
  const card = document.createElement("article");
  card.className = "question-card";

  const title = document.createElement("h3");
  title.className = "question-card__title";
  title.textContent = item.prompt;
  card.appendChild(title);

  const optionList = document.createElement("div");
  optionList.className = "option-list";
  const nextContext = {
    parentId: context?.parentId || item.uid,
    subId: context?.subId || item.uid,
  };
  item.options.forEach((option) => optionList.appendChild(renderOption(item, option, nextContext)));
  card.appendChild(optionList);
  return card;
}

function renderGroupItem(item) {
  const card = document.createElement("article");
  card.className = "group-card";

  if (item.stem) {
    const title = document.createElement("h3");
    title.className = "group-card__title";
    title.textContent = item.stem;
    card.appendChild(title);
  }

  const list = document.createElement("div");
  list.className = "sub-question-list";

  item.questions.forEach((question, index) => {
    const sub = document.createElement("section");
    sub.className = "sub-question";

    const subTitle = document.createElement("h4");
    subTitle.className = "sub-question__title";
    subTitle.textContent = `第 ${index + 1} 问：${question.prompt}`;
    sub.appendChild(subTitle);

    const optionList = document.createElement("div");
    optionList.className = "option-list";
    question.options.forEach((option) => {
      optionList.appendChild(renderOption(question, option, { parentId: item.uid, subId: question.uid }));
    });

    sub.appendChild(optionList);
    list.appendChild(sub);
  });

  card.appendChild(list);
  return card;
}

function renderSharedStemItem(item, question) {
  const card = document.createElement("article");
  card.className = "group-card";

  if (item.stem) {
    const title = document.createElement("h3");
    title.className = "group-card__title";
    title.textContent = item.stem;
    card.appendChild(title);
  }

  const sub = document.createElement("section");
  sub.className = "sub-question";

  const subTitle = document.createElement("h4");
  subTitle.className = "sub-question__title";
  subTitle.textContent = question.prompt;
  sub.appendChild(subTitle);

  const optionList = document.createElement("div");
  optionList.className = "option-list";
  question.options.forEach((option) => {
    optionList.appendChild(renderOption(question, option, { parentId: item.uid, subId: question.uid }));
  });

  sub.appendChild(optionList);
  card.appendChild(sub);
  return card;
}

function renderOption(question, option, context) {
  const wrapper = document.createElement("div");
  wrapper.className = "option-card";
  wrapper.dataset.optionKey = option.key;
  wrapper.dataset.questionId = question.uid || question.id;

  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = question.questionType === "multiple" ? "checkbox" : "radio";
  input.name = `${context.parentId}__${context.subId || question.id}`;
  input.value = option.key;

  const key = document.createElement("span");
  key.className = "option-card__key";
  key.textContent = `${option.key}.`;

  const text = document.createElement("span");
  text.textContent = option.text;

  label.append(input, key, text);
  wrapper.appendChild(label);
  return wrapper;
}

function onManualAddWrong() {
  const item = getCurrentItem();
  if (!item) {
    return;
  }

  addWrong(item.uid);
  setStatus("已手动加入错题库，已跳转下一题。");
  moveNext();
}

function submitCurrentQuestion() {
  const entry = getCurrentEntry();
  const item = getCurrentItem();
  if (!item || state.session.submitted) {
    return;
  }

  const result =
    item.kind === "group" && item.groupType === "sharedStem"
      ? evaluateSharedStemStep(item, getCurrentSharedQuestion())
      : item.kind === "group"
        ? evaluateGroup(item)
        : evaluateSingle(item);
  state.session.submitted = true;
  state.session.result = result;

  if (item.kind === "group" && item.groupType === "sharedStem") {
    updateSharedStemWrongState(entry, result.correct);
    if (state.session.mode === "wrong" && isLastSharedStemStepForGroup(entry.itemUid)) {
      finalizeSharedStemWrongState(entry.itemUid);
    }
  } else if (result.correct) {
    state.session.correctCount += 1;
    if (state.session.mode === "wrong") {
      removeWrong(item.uid);
    }
  } else {
    addWrong(item.uid);
  }

  if (result.correct) {
    moveNext();
    return;
  }

  paintResult(item, result);
  refs.submitBtn.classList.add("hidden");
  refs.manualWrongBtn.disabled = true;
}

function evaluateSingle(item) {
  const submitted = readSelectedAnswers(item.uid);
  const correct = sameAnswers(submitted, item.answerSet);
  return {
    correct,
    submitted,
    answerSet: item.answerSet,
    detail: [
      {
        prompt: item.prompt,
        correct,
        submitted,
        answerSet: item.answerSet,
        analysis: item.analysis,
      },
    ],
  };
}

function evaluateGroup(item) {
  const detail = item.questions.map((question) => {
    const submitted = readSelectedAnswers(item.uid, question.uid);
    return {
      prompt: question.prompt,
      correct: sameAnswers(submitted, question.answerSet),
      submitted,
      answerSet: question.answerSet,
      analysis: question.analysis,
      questionId: question.uid,
    };
  });

  return {
    correct: detail.every((entry) => entry.correct),
    detail,
  };
}

function evaluateSharedStemStep(item, question) {
  const submitted = readSelectedAnswers(item.uid, question.uid);
  const correct = sameAnswers(submitted, question.answerSet);
  return {
    correct,
    submitted,
    answerSet: question.answerSet,
    detail: [
      {
        prompt: question.prompt,
        correct,
        submitted,
        answerSet: question.answerSet,
        analysis: question.analysis,
        questionId: question.uid,
      },
    ],
  };
}

function paintResult(item, result) {
  if (item.kind === "group") {
    result.detail.forEach((entry) => {
      const section = refs.questionBody.querySelector(`[data-question-id="${entry.questionId}"]`)?.closest(".sub-question");
      if (!section) {
        return;
      }
      section.querySelectorAll(".option-card").forEach((node) => {
        const key = node.dataset.optionKey;
        if (entry.answerSet.has(key)) {
          node.classList.add("option-card--correct");
        } else if (entry.submitted.has(key)) {
          node.classList.add("option-card--wrong");
        }
        const input = node.querySelector("input");
        if (input) {
          input.disabled = true;
        }
      });
    });
  } else {
    refs.questionBody.querySelectorAll(".option-card").forEach((node) => {
      const key = node.dataset.optionKey;
      if (result.answerSet.has(key)) {
        node.classList.add("option-card--correct");
      } else if (result.submitted.has(key)) {
        node.classList.add("option-card--wrong");
      }
      const input = node.querySelector("input");
      if (input) {
        input.disabled = true;
      }
    });
  }

  refs.resultModalBody.className = `modal__body ${result.correct ? "modal__body--correct" : "modal__body--wrong"}`;
  refs.resultModalBody.innerHTML = "";

  result.detail.forEach((entry, index) => {
    const p = document.createElement("p");
    const prefix = item.kind === "group" ? `第 ${index + 1} 问` : "正确答案";
    p.textContent = `${prefix}：${Array.from(entry.answerSet).join("、")} | 你的答案：${Array.from(entry.submitted).join("、") || "未作答"}`;
    refs.resultModalBody.appendChild(p);
  });

  if (!result.correct) {
    result.detail.forEach((entry, index) => {
      if (entry.correct || !entry.analysis) {
        return;
      }
      const p = document.createElement("p");
      p.textContent = `${item.kind === "group" ? `第 ${index + 1} 问解析` : "解析"}：${entry.analysis}`;
      refs.resultModalBody.appendChild(p);
    });
  }

  if (result.correct && state.session.mode === "wrong") {
    const p = document.createElement("p");
    p.textContent = "这道错题已从错题库释放。";
    refs.resultModalBody.appendChild(p);
  }

  refs.resultModalConfirmBtn.textContent = hasNextQuestion() ? "确认并进入下一题" : "确认并查看结果";
  refs.resultModal.classList.remove("hidden");
}

function moveNext() {
  if (!state.session) {
    return;
  }

  closeResultModal();
  state.session.index += 1;
  state.session.submitted = false;
  state.session.result = null;
  renderCurrentQuestion();
}

function hasNextQuestion() {
  return Boolean(state.session) && state.session.index < state.session.queue.length - 1;
}

function onResultModalConfirm() {
  closeResultModal();
  moveNext();
}

function closeResultModal() {
  refs.resultModal.classList.add("hidden");
  refs.resultModalBody.innerHTML = "";
}

function openJumpModal() {
  if (!state.session || state.session.mode !== "chapter") {
    return;
  }
  refs.jumpHintText.textContent = `请输入 1 到 ${state.session.queue.length} 之间的题号顺序。`;
  refs.jumpInput.min = "1";
  refs.jumpInput.max = String(state.session.queue.length);
  refs.jumpInput.value = String(state.session.index + 1);
  refs.jumpModal.classList.remove("hidden");
  refs.jumpInput.focus();
  refs.jumpInput.select();
}

function closeJumpModal() {
  refs.jumpModal.classList.add("hidden");
}

function confirmJump() {
  if (!state.session || state.session.mode !== "chapter") {
    closeJumpModal();
    return;
  }

  const target = Number.parseInt(refs.jumpInput.value, 10);
  if (!Number.isInteger(target) || target < 1 || target > state.session.queue.length) {
    setStatus(`请输入 1 到 ${state.session.queue.length} 之间的题号。`);
    return;
  }

  closeJumpModal();
  closeResultModal();
  state.session.index = target - 1;
  state.session.submitted = false;
  state.session.result = null;
  renderCurrentQuestion();
}

function renderSessionSummary() {
  const total = state.session.queue.length;
  const correct = state.session.correctCount;
  const wrong = total - correct;

  refs.examEmpty.classList.add("hidden");
  refs.examContent.classList.remove("hidden");
  refs.questionMeta.innerHTML = "";
  refs.questionBody.innerHTML = `
    <div class="empty-state empty-state--large">
      本轮练习完成。<br>
      共 ${total} 题，答对 ${correct} 题，答错 ${wrong} 题。<br>
      当前错题库还有 ${state.wrongSet.size} 题。
    </div>
  `;
  refs.modeLabel.textContent = state.session.mode === "wrong" ? "错题库练习" : "章节练习";
  refs.progressLabel.textContent = "练习结束";
  refs.questionTypeBadge.textContent = "完成";
  closeResultModal();
  refs.submitBtn.classList.add("hidden");
  refs.manualWrongBtn.classList.add("hidden");
  state.session = null;
}

function updateSharedStemWrongState(entry, correct) {
  const current = state.session.sharedStemResults[entry.itemUid] || {
    correctCount: 0,
    total: state.session.queue.filter((queueEntry) => queueEntry.itemUid === entry.itemUid).length,
    anyWrong: false,
  };

  if (correct) {
    current.correctCount += 1;
    state.session.correctCount += 1;
  }
  current.anyWrong = current.anyWrong || !correct;
  state.session.sharedStemResults[entry.itemUid] = current;

  if (!correct) {
    addWrong(entry.itemUid);
  }
}

function isLastSharedStemStepForGroup(itemUid) {
  if (!state.session) {
    return false;
  }
  const remaining = state.session.queue.slice(state.session.index + 1).some((entry) => entry.itemUid === itemUid);
  return !remaining;
}

function finalizeSharedStemWrongState(itemUid) {
  const result = state.session.sharedStemResults[itemUid];
  if (!result) {
    return;
  }

  if (!result.anyWrong && result.correctCount === result.total) {
    removeWrong(itemUid);
  } else if (result.anyWrong) {
    addWrong(itemUid);
  }
}

function clearWrongBank() {
  if (!state.bank.bankId) {
    setStatus("当前没有可清空的错题库。");
    return;
  }
  state.wrongSet = new Set();
  persistWrongSet();
  updateBankStats();
  setStatus("当前题库错题已清空。");
}

function getCurrentEntry() {
  if (!state.session) {
    return null;
  }
  return state.session.queue[state.session.index] || null;
}

function readSelectedAnswers(parentId, subId) {
  const name = `${parentId}__${subId || parentId}`;
  const selected = Array.from(document.querySelectorAll(`input[name="${cssEscape(name)}"]:checked`)).map((node) =>
    node.value.toUpperCase()
  );
  return new Set(selected);
}

function getCurrentItem() {
  const entry = getCurrentEntry();
  if (!entry) {
    return null;
  }
  return state.bank.items.find((item) => item.uid === entry.itemUid) || null;
}

function getCurrentSharedQuestion() {
  const entry = getCurrentEntry();
  const item = getCurrentItem();
  if (!entry || !item || !entry.questionUid || !Array.isArray(item.questions)) {
    return null;
  }
  return item.questions.find((question) => question.uid === entry.questionUid) || null;
}

function getSelectedChapters() {
  const checked = Array.from(refs.chapterContainer.querySelectorAll('input[type="checkbox"]:checked'));
  return new Set(checked.map((node) => node.value));
}

function addWrong(id) {
  state.wrongSet.add(id);
  persistWrongSet();
  updateBankStats();
}

function removeWrong(id) {
  if (state.wrongSet.delete(id)) {
    persistWrongSet();
    updateBankStats();
  }
}

function persistWrongSet() {
  if (!state.bank.bankId) {
    return;
  }
  localStorage.setItem(`${STORAGE_PREFIX}:wrong:${state.bank.bankId}`, JSON.stringify(Array.from(state.wrongSet)));
}

function loadWrongSet(bankId, items) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:wrong:${bankId}`);
    const ids = JSON.parse(raw || "[]");
    const validIds = new Set(items.map((item) => item.uid));
    const normalized = new Set();

    ids.forEach((id) => {
      if (validIds.has(id)) {
        normalized.add(id);
        return;
      }

      const matchedItems = items.filter((item) => item.id === id);
      if (matchedItems.length === 1) {
        normalized.add(matchedItems[0].uid);
      }
    });

    return normalized;
  } catch (_error) {
    return new Set();
  }
}

function normalizeQuestionFile(parsed, relativePath) {
  const fileChapter = stripExtension(relativePath.split("/").pop() || relativePath);
  const entries = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, index) => {
      entries.push({ raw: item, chapter: fileChapter, seed: `${relativePath}#${index + 1}` });
    });
  } else if (Array.isArray(parsed.questions || parsed.items)) {
    const inheritedChapter = pickText(parsed.chapter, parsed.name, fileChapter);
    const questions = parsed.questions || parsed.items;
    questions.forEach((item, index) => {
      entries.push({ raw: item, chapter: inheritedChapter, seed: `${relativePath}#${index + 1}` });
    });
  } else if (Array.isArray(parsed.chapters)) {
    parsed.chapters.forEach((chapterObj, chapterIndex) => {
      const chapterName = pickText(chapterObj.chapter, chapterObj.name, `章节${chapterIndex + 1}`);
      const questions = chapterObj.questions || chapterObj.items || [];
      questions.forEach((item, index) => {
        entries.push({
          raw: item,
          chapter: pickText(item.chapter, chapterName),
          seed: `${relativePath}#${chapterIndex + 1}-${index + 1}`,
        });
      });
    });
  } else {
    throw new Error("根节点必须是数组，或包含 questions/items/chapters。");
  }

  return entries.map((entry) => normalizeTopLevelItem(entry.raw, entry.chapter, entry.seed, relativePath));
}

function normalizeTopLevelItem(raw, chapter, seed, relativePath) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`题目 ${seed} 不是对象。`);
  }

  const id = String(raw.id || seed);
  const uid = `${relativePath}::${id}`;
  const displayNo = pickText(raw.no, raw.index, seed.split("#").pop());
  const common = {
    id,
    uid,
    chapter: pickText(raw.chapter, chapter),
    displayNo,
    sourcePath: relativePath,
  };

  if (Array.isArray(raw.questions)) {
    const questions = raw.questions.map((question, index) =>
      normalizeSubQuestion(question, `${id}-${index + 1}`, relativePath)
    );
    return {
      ...common,
      kind: "group",
      groupType: normalizeGroupType(raw.type, questions),
      stem: pickText(raw.stem, raw.prompt, raw.title, ""),
      questions,
    };
  }

  return {
    ...common,
    kind: "single",
    prompt: pickText(raw.prompt, raw.question, raw.title),
    options: normalizeOptions(raw.options),
    answerSet: normalizeAnswerSet(raw.answer, raw.answers, raw.correctAnswer, raw.correct),
    questionType: normalizeQuestionType(raw.type, raw.answer, raw.answers),
    analysis: pickText(raw.analysis, raw.explanation, raw.note, ""),
  };
}

function normalizeSubQuestion(raw, fallbackId, relativePath) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`子题 ${fallbackId} 不是对象。`);
  }
  const id = String(raw.id || fallbackId);
  return {
    id,
    uid: `${relativePath}::${id}`,
    prompt: pickText(raw.prompt, raw.question, raw.title),
    options: normalizeOptions(raw.options),
    answerSet: normalizeAnswerSet(raw.answer, raw.answers, raw.correctAnswer, raw.correct),
    analysis: pickText(raw.analysis, raw.explanation, raw.note, ""),
    questionType: normalizeQuestionType(raw.type, raw.answer, raw.answers),
  };
}

function normalizeQuestionType(typeValue, answer, answers) {
  const normalizedType = String(typeValue || "").trim().toLowerCase();
  if (normalizedType === "single" || normalizedType === "单选") {
    return "single";
  }
  if (normalizedType === "multiple" || normalizedType === "multi" || normalizedType === "多选") {
    return "multiple";
  }
  return normalizeAnswerSet(answer, answers).size > 1 ? "multiple" : "single";
}

function normalizeGroupType(typeValue, questions) {
  const normalized = String(typeValue || "").trim().toLowerCase();
  if (["case", "casestudy", "案例题", "案例"].includes(normalized)) {
    return "case";
  }
  if (["sharedstem", "shared-stem", "commonstem", "共用题干题", "共用题干"].includes(normalized)) {
    return "sharedStem";
  }
  return questions.some((question) => question.questionType === "multiple") ? "case" : "sharedStem";
}

function normalizeOptions(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("options 必须是非空数组。");
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      const match = item.match(/^([A-Z])[\.\s、:：-]+(.+)$/i);
      return {
        key: (match ? match[1] : String.fromCharCode(65 + index)).toUpperCase(),
        text: (match ? match[2] : item).trim(),
      };
    }

    if (item && typeof item === "object") {
      const key = String(item.key || item.value || item.id || String.fromCharCode(65 + index)).toUpperCase();
      const text = pickText(item.text, item.label, item.content);
      return { key, text };
    }

    throw new Error("options 中存在无法识别的选项。");
  });
}

function normalizeAnswerSet(...values) {
  const raw = values.find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined) {
    throw new Error("缺少 answer/answers 字段。");
  }

  const answerList = [];
  if (Array.isArray(raw)) {
    raw.forEach((item) => answerList.push(...extractLetters(item)));
  } else {
    answerList.push(...extractLetters(raw));
  }

  if (!answerList.length) {
    throw new Error("答案格式无法识别，请使用 A 或 [\"A\", \"C\"] 这类格式。");
  }

  return new Set(answerList);
}

function extractLetters(value) {
  const normalized = String(value).toUpperCase();
  return Array.from(new Set(normalized.match(/[A-Z]/g) || []));
}

function getQuestionTypeLabel(item) {
  if (item.kind === "group") {
    return item.groupType === "case" ? "案例题" : "共用题干题";
  }
  return item.questionType === "multiple" ? "多选题" : "单选题";
}

function sameAnswers(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function createBankId(sourceLabel) {
  const raw = `${sourceLabel}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(index);
    hash |= 0;
  }
  return `bank_${Math.abs(hash).toString(36)}`;
}

async function collectDirectoryJsonFiles(handle, basePath = "") {
  const list = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = basePath ? `${basePath}/${name}` : name;
    if (entry.kind === "directory") {
      const nested = await collectDirectoryJsonFiles(entry, relativePath);
      list.push(...nested);
    } else if (name.toLowerCase().endsWith(".json") && name.toLowerCase() !== "manifest.json") {
      list.push({ handle: entry, relativePath });
    }
  }
  return list.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
}

async function readFileHandleText(handle) {
  const file = await handle.getFile();
  return file.text();
}

function stripExtension(name) {
  return String(name).replace(/\.[^.]+$/, "");
}

function pickText(...values) {
  const found = values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return found === undefined ? "" : String(found).trim();
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function setStatus(message) {
  refs.statusText.textContent = message;
}

async function saveDirectoryHandle(handle) {
  if (!window.indexedDB) {
    return;
  }
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
  });
}

async function getSavedDirectoryHandle() {
  if (!window.indexedDB) {
    return null;
  }
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
