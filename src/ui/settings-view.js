import { ROOT_ATTRIBUTE, modelOptionValues } from "../renderer-core.js";
import { actionButton, element, field, makeId, svgIcon } from "./dom.js";
import { showModalDialog } from "./modal.js";

export const MODE_OPTIONS = [
  ["direct", "直接替换"],
  ["preview", "预览后应用"],
  ["clarify", "多轮澄清"],
];

export const PROTOCOL_OPTIONS = [
  ["openaiResponses", "OpenAI Responses"],
  ["openaiChatCompletions", "OpenAI Chat Completions"],
  ["anthropicMessages", "Anthropic Messages"],
];

export const HISTORY_OPTIONS = [0, 5, 10, 20, 50];

function createSettingsId(view, suffix) {
  return `ctpo-${view.id}-${suffix}`;
}

export function setViewBusy(view, busy) {
  view.busy = busy;
  if (!view.container) return;
  for (const control of view.container.querySelectorAll?.("button, input, select, textarea") ?? []) {
    control.disabled = busy;
  }
}

export function renderHistoryList(doc, {
  history,
  historyLimit,
  selectedHistoryIds,
  searchQuery = "",
  listContainer,
  onTogglePin,
  onDeleteHistory,
  onBatchPin,
  onBatchDelete,
  onPreviewHistory,
  onNotice,
}) {
  listContainer.replaceChildren();

  // Auto-sort history: Pinned first (newest to oldest), then unpinned (newest to oldest)
  history.sort((a, b) => {
    const aPin = Boolean(a?.isPinned);
    const bPin = Boolean(b?.isPinned);
    if (aPin !== bPin) return aPin ? -1 : 1;
    return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
  });

  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? history.filter((e) => e.original.toLowerCase().includes(query) || e.result.toLowerCase().includes(query))
    : history;

  if (!filtered.length) {
    listContainer.append(element(doc, "li", { className: "ctpo-hint" }, [
      query ? "没有匹配的优化历史。" : (historyLimit === 0 ? "历史保留设置为 0。" : "暂无优化历史。"),
    ]));
    return;
  }

  // Batch Action Bar
  const batchBar = element(doc, "div", { className: "ctpo-history-batch-bar" });
  const selectAllCheck = element(doc, "input", {
    type: "checkbox",
    className: "ctpo-history-checkbox",
    "aria-label": "全选历史记录",
    checked: filtered.length > 0 && filtered.every((e) => selectedHistoryIds.has(e.id)),
  });
  selectAllCheck.addEventListener("change", () => {
    if (selectAllCheck.checked) {
      for (const e of filtered) selectedHistoryIds.add(e.id);
    } else {
      for (const e of filtered) selectedHistoryIds.delete(e.id);
    }
    renderHistoryList(doc, {
      history,
      historyLimit,
      selectedHistoryIds,
      searchQuery,
      listContainer,
      onTogglePin,
      onDeleteHistory,
      onBatchPin,
      onBatchDelete,
      onPreviewHistory,
      onNotice,
    });
  });

  const selectedCount = [...selectedHistoryIds].filter((id) => filtered.some((e) => e.id === id)).length;
  const batchLeft = element(doc, "div", { className: "ctpo-history-batch-left" }, [
    selectAllCheck,
    element(doc, "span", {}, [selectedCount > 0 ? `已选 ${selectedCount} 项` : "全选"]),
  ]);

  const batchActions = element(doc, "div", { className: "ctpo-history-batch-actions" });

  if (selectedCount > 0) {
    const batchPinBtn = actionButton(doc, "批量收藏", "batch-pin-history", { icon: "star", title: "将选中的记录批量收藏并置顶" });
    batchPinBtn.addEventListener("click", async () => {
      await onBatchPin?.(new Set(selectedHistoryIds));
      selectedHistoryIds.clear();
      renderHistoryList(doc, {
        history,
        historyLimit,
        selectedHistoryIds,
        searchQuery,
        listContainer,
        onTogglePin,
        onDeleteHistory,
        onBatchPin,
        onBatchDelete,
        onPreviewHistory,
        onNotice,
      });
    });

    const batchDeleteBtn = actionButton(doc, "批量删除", "batch-delete-history", { icon: "trash", kind: "danger", title: "删除所有选中的记录" });
    batchDeleteBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "批量删除历史记录",
        message: `确认删除选中的 ${selectedCount} 条优化历史记录吗？该操作不可撤销。`,
        confirmText: "确认删除",
        isDanger: true,
        onConfirm: async () => {
          await onBatchDelete?.(new Set(selectedHistoryIds));
          selectedHistoryIds.clear();
          renderHistoryList(doc, {
            history,
            historyLimit,
            selectedHistoryIds,
            searchQuery,
            listContainer,
            onTogglePin,
            onDeleteHistory,
            onBatchPin,
            onBatchDelete,
            onPreviewHistory,
            onNotice,
          });
        },
      });
    });

    batchActions.append(batchPinBtn, batchDeleteBtn);
  }

  batchBar.append(batchLeft, batchActions);
  listContainer.append(batchBar);

  const ul = element(doc, "ul", { className: "ctpo-history-list" });

  for (const entry of filtered) {
    const isPinned = Boolean(entry.isPinned);
    const isChecked = selectedHistoryIds.has(entry.id);

    const check = element(doc, "input", {
      type: "checkbox",
      className: "ctpo-history-checkbox",
      checked: isChecked,
    });
    check.addEventListener("change", () => {
      if (check.checked) selectedHistoryIds.add(entry.id);
      else selectedHistoryIds.delete(entry.id);
      renderHistoryList(doc, {
        history,
        historyLimit,
        selectedHistoryIds,
        searchQuery,
        listContainer,
        onTogglePin,
        onDeleteHistory,
        onBatchPin,
        onBatchDelete,
        onPreviewHistory,
        onNotice,
      });
    });

    const hoverCard = element(doc, "div", { className: "ctpo-history-hover-card" }, [
      element(doc, "div", { className: "ctpo-history-hover-title" }, ["📝 原始提示词："]),
      element(doc, "div", { className: "ctpo-history-hover-text" }, [entry.original]),
      element(doc, "div", { className: "ctpo-history-hover-title", style: "margin-top: 6px;" }, ["✨ 优化结果预览："]),
      element(doc, "div", { className: "ctpo-history-hover-text" }, [entry.result.length > 260 ? `${entry.result.slice(0, 260)}...` : entry.result]),
    ]);

    const preview = element(doc, "div", { className: "ctpo-history-copy", title: "" }, [
      element(doc, "div", { className: "ctpo-history-preview" }, [
        isPinned ? element(doc, "span", { className: "ctpo-pinned-badge" }, ["⭐ 已收藏"]) : null,
        entry.original,
      ]),
      element(doc, "div", { className: "ctpo-history-date" }, [new Date(entry.createdAt).toLocaleString()]),
      hoverCard,
    ]);

    const pinBtn = actionButton(doc, isPinned ? "已收藏" : "收藏", "toggle-pin-history", {
      icon: isPinned ? "starFilled" : "star",
      title: isPinned ? "取消收藏" : "收藏并默认置顶（不受数量清理限制）",
    });
    pinBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await onTogglePin?.(entry);
        renderHistoryList(doc, {
          history,
          historyLimit,
          selectedHistoryIds,
          searchQuery,
          listContainer,
          onTogglePin,
          onDeleteHistory,
          onBatchPin,
          onBatchDelete,
          onPreviewHistory,
          onNotice,
        });
      } catch (error) {
        onNotice?.(error.message, "error");
      }
    });

    const previewBtn = actionButton(doc, "预览", "history-preview", { icon: "eye" });
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onPreviewHistory?.(entry);
    });

    const delBtn = actionButton(doc, "删除", "history-delete", { icon: "trash", kind: "danger" });
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showModalDialog(doc, {
        title: "删除历史记录",
        message: "确认删除此条优化历史记录吗？该操作不可撤销。",
        confirmText: "确认删除",
        isDanger: true,
        onConfirm: async () => {
          try {
            await onDeleteHistory?.(entry.id);
            selectedHistoryIds.delete(entry.id);
            renderHistoryList(doc, {
              history,
              historyLimit,
              selectedHistoryIds,
              searchQuery,
              listContainer,
              onTogglePin,
              onDeleteHistory,
              onBatchPin,
              onBatchDelete,
              onPreviewHistory,
              onNotice,
            });
          } catch (error) {
            onNotice?.(error.message, "error");
          }
        },
      });
    });

    const actions = element(doc, "div", { className: "ctpo-actions ctpo-history-item-actions" }, [
      pinBtn,
      previewBtn,
      delBtn,
    ]);

    const itemEl = element(doc, "li", {
      className: "ctpo-history-item",
      "data-pinned": isPinned ? "true" : "false",
    }, [
      check,
      preview,
      actions,
    ]);

    preview.addEventListener("click", (e) => {
      if (e.target === check) return;
      itemEl.setAttribute("data-expanded", itemEl.getAttribute("data-expanded") === "true" ? "false" : "true");
    });

    ul.append(itemEl);
  }
  listContainer.append(ul);
}

export function buildSettingsView(container, {
  doc,
  state,
  defaults,
  embedded = false,
  callNode,
  setNotice,
  scheduleScan,
  refreshSettingsViews,
  refreshDebugOutputViews,
  showPreview,
}) {
  const view = {
    id: makeId("settings"),
    container,
    status: null,
    saveFeedback: null,
    inlineNotice: { text: "", kind: "" },
    modelOptions: [],
    keyDraft: "",
    keyVisible: false,
    busy: false,
    debugOutput: null,
    historySearch: "",
    selectedHistoryIds: new Set(),
    searchTimer: null,
    render: null,
  };

  const setInlineNotice = (text, kind = "") => {
    view.inlineNotice = { text, kind };
    if (view.saveFeedback) {
      view.saveFeedback.textContent = text;
      view.saveFeedback.dataset.kind = kind;
    }
    if (state.notice?.text) setNotice("");
  };

  container.setAttribute(ROOT_ATTRIBUTE, "");

  view.render = () => {
    if (state.disposed) return;
    const settings = state.settings;
    container.replaceChildren();
    const wrapper = element(doc, "main", { className: "ctpo-settings" });
    const header = element(doc, "header", { className: "ctpo-pane-header" }, [
      element(doc, "h1", { className: "ctpo-title" }, ["提示词优化"]),
      element(doc, "p", { className: "ctpo-description" }, ["只处理当前 Composer 中的提示词，并通过你指定的 API 生成可直接使用的优化结果。不会读取会话历史、文件、附件或项目上下文。"]),
    ]);
    if (!embedded) wrapper.append(header);

    // Card 1: 基本设置
    const generalCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-general` });
    generalCard.append(element(doc, "h2", { id: `${view.id}-general` }, ["基本设置"]));
    
    const switchLabel = element(doc, "label", { className: "ctpo-switch-row" });
    const switchCopy = element(doc, "span", {}, [
      element(doc, "span", { className: "ctpo-label" }, ["启用优化按钮"]),
      element(doc, "span", { className: "ctpo-hint" }, ["包启用后，控制 Composer 附近的入口。首次启用默认开启。"]),
    ]);
    const enabled = element(doc, "input", { type: "checkbox", className: "ctpo-switch", role: "switch", "aria-label": "启用优化按钮", checked: settings.enabled });
    enabled.addEventListener("change", () => {
      state.settings.enabled = enabled.checked;
      scheduleScan();
    });
    switchLabel.append(switchCopy, enabled);

    const streamLabel = element(doc, "label", { className: "ctpo-switch-row", style: "margin-top: 8px;" });
    const streamCopy = element(doc, "span", {}, [
      element(doc, "span", { className: "ctpo-label" }, ["启用流式响应 (Streaming)"]),
      element(doc, "span", { className: "ctpo-hint" }, ["打字机实时展示大模型输出；若目标模型或反代不支持流式传输，可关闭此项。"]),
    ]);
    const streamSwitch = element(doc, "input", { type: "checkbox", className: "ctpo-switch", role: "switch", "aria-label": "启用流式响应", checked: settings.streaming !== false });
    streamSwitch.addEventListener("change", () => {
      state.settings.streaming = streamSwitch.checked;
    });
    streamLabel.append(streamCopy, streamSwitch);
    generalCard.append(switchLabel, streamLabel);

    // Card 2: Provider 档案管理
    const profiles = Array.isArray(settings.profiles) && settings.profiles.length ? settings.profiles : [
      { id: "default-profile", name: "默认配置", protocol: settings.protocol, baseUrl: settings.baseUrl, model: settings.model },
    ];
    const activeProfileId = settings.activeProfileId || profiles[0].id;
    const currentProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

    const profileCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-profiles` });
    profileCard.append(element(doc, "h2", { id: `${view.id}-profiles` }, ["Provider 档案 (多配置快速切换)"]));
    
    const profileLine = element(doc, "div", { className: "ctpo-inline", style: "gap: 8px; margin-bottom: 4px;" });
    const profileSelect = element(doc, "select", { "aria-label": "选择配置档案", style: "flex: 1; min-width: 140px;" });
    for (const p of profiles) {
      profileSelect.append(element(doc, "option", { value: p.id, textContent: p.name || p.id }));
    }
    profileSelect.value = activeProfileId;
    profileSelect.addEventListener("change", async () => {
      setViewBusy(view, true);
      try {
        const res = await callNode("select-profile", { profileId: profileSelect.value });
        state.settings = { ...state.settings, ...res.settings };
        view.keyDraft = "";
        setInlineNotice(`已切换到【${profiles.find((p) => p.id === profileSelect.value)?.name}】`, "success");
        view.render();
      } catch (e) {
        setInlineNotice(e.message, "error");
      } finally {
        setViewBusy(view, false);
      }
    });

    const addProfileBtn = actionButton(doc, "+ 新增档案", "add-profile", { icon: "spark", title: "添加新模型 Provider 档案" });
    addProfileBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "新增 Provider 档案",
        message: "请输入新配置档案的名称（例如：DeepSeek、Claude、本地 Ollama 等）：",
        showInput: true,
        inputPlaceholder: "例如：DeepSeek 官方 API",
        initialValue: "新模型配置",
        confirmText: "创建档案",
        onConfirm: async (name) => {
          if (!name) return;
          const newProf = {
            id: `profile-${Date.now()}`,
            name,
            protocol: "openaiResponses",
            baseUrl: "",
            apiKey: "",
            model: "",
            streaming: true,
          };
          setViewBusy(view, true);
          try {
            const res = await callNode("save-profile", { profile: newProf });
            await callNode("select-profile", { profileId: newProf.id });
            state.settings = { ...state.settings, ...res.settings, activeProfileId: newProf.id };
            view.keyDraft = "";
            setInlineNotice(`已创建并切换到【${name}】`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    const renameProfileBtn = actionButton(doc, "重命名", "rename-profile", { icon: "edit", title: "重命名当前选中的档案" });
    renameProfileBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "重命名配置档案",
        message: `修改档案【${currentProfile.name}】的名称：`,
        showInput: true,
        initialValue: currentProfile.name,
        confirmText: "保存名称",
        onConfirm: async (newName) => {
          if (!newName || newName === currentProfile.name) return;
          setViewBusy(view, true);
          try {
            const updatedProfile = { ...currentProfile, name: newName };
            const res = await callNode("save-profile", { profile: updatedProfile });
            state.settings = { ...state.settings, ...res.settings };
            setInlineNotice(`已重命名为【${newName}】`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    const delProfileBtn = actionButton(doc, "删除档案", "delete-profile", { icon: "trash", kind: "danger", title: "删除当前选中的档案" });
    delProfileBtn.addEventListener("click", () => {
      if (profiles.length <= 1) {
        setInlineNotice("至少保留一个配置档案，无法删除。", "error");
        return;
      }
      showModalDialog(doc, {
        title: "删除配置档案",
        message: `确认删除当前配置档案【${currentProfile.name}】吗？该操作不可撤销。`,
        confirmText: "确认删除",
        isDanger: true,
        onConfirm: async () => {
          setViewBusy(view, true);
          try {
            const res = await callNode("delete-profile", { profileId: currentProfile.id });
            state.settings = { ...state.settings, ...res.settings };
            view.keyDraft = "";
            setInlineNotice(`档案【${currentProfile.name}】已删除。`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    profileLine.append(profileSelect, addProfileBtn, renameProfileBtn, delProfileBtn);
    profileCard.append(profileLine);

    // Card 3: 当前档案 API 设置
    const providerCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-provider` });
    providerCard.append(element(doc, "h2", { id: `${view.id}-provider` }, [`当前档案 API 设置（${currentProfile.name || "当前配置"}）`]));
    const grid = element(doc, "div", { className: "ctpo-grid" });

    const modeSelect = element(doc, "select", { id: createSettingsId(view, "mode"), "aria-describedby": createSettingsId(view, "mode-hint") });
    for (const [value, label] of MODE_OPTIONS) modeSelect.append(element(doc, "option", { value, textContent: label }));
    modeSelect.value = settings.mode;
    modeSelect.addEventListener("change", () => { state.settings.mode = modeSelect.value; });
    grid.append(field(doc, "运行模式", modeSelect, "每次请求都只使用当前 Composer 内容。", createSettingsId(view, "mode-hint")));

    const protocolSelect = element(doc, "select", { id: createSettingsId(view, "protocol") });
    for (const [value, label] of PROTOCOL_OPTIONS) protocolSelect.append(element(doc, "option", { value, textContent: label }));
    protocolSelect.value = settings.protocol;
    protocolSelect.addEventListener("change", () => { state.settings.protocol = protocolSelect.value; });
    grid.append(field(doc, "API 协议", protocolSelect, "支持 OpenAI Responses、Chat Completions 和 Anthropic Messages。"));

    const baseUrl = element(doc, "input", { id: createSettingsId(view, "base-url"), type: "url", autocomplete: "url", placeholder: "https://api.example.com/v1" });
    baseUrl.value = settings.baseUrl;
    baseUrl.addEventListener("input", () => { state.settings.baseUrl = baseUrl.value; });
    const baseUrlField = field(doc, "API 地址", baseUrl, "远程服务必须使用 HTTPS；localhost、127.0.0.1 和 ::1 可使用 HTTP。");
    baseUrlField.classList.add("ctpo-field-full");
    grid.append(baseUrlField);

    const keyInput = element(doc, "input", { id: createSettingsId(view, "api-key"), type: view.keyVisible ? "text" : "password", autocomplete: "new-password", placeholder: settings.apiKeyConfigured ? "已配置，留空表示保持不变" : "输入 API Key" });
    keyInput.value = view.keyDraft;
    keyInput.addEventListener("input", () => { view.keyDraft = keyInput.value; });
    const keyToggle = actionButton(doc, view.keyVisible ? "隐藏" : "显示", "toggle-key", { icon: "eye", title: "显示或隐藏 API Key" });
    keyToggle.addEventListener("click", () => { view.keyVisible = !view.keyVisible; view.render(); });
    const keyLine = element(doc, "div", { className: "ctpo-inline" }, [keyInput, keyToggle]);
    const keyField = field(doc, "API Key", keyLine, "界面默认遮蔽；显示/隐藏只作用于当前输入草稿，已保存 Key 不回显。此包不宣称操作系统级加密。");
    keyField.classList.add("ctpo-field-full");
    grid.append(keyField);

    const modelInput = element(doc, "input", { id: createSettingsId(view, "model"), type: "text", autocomplete: "off", placeholder: "例如 gpt-5.6", "aria-label": "手动填写模型名称" });
    modelInput.value = settings.model;
    const modelSelect = element(doc, "select", {
      className: "ctpo-model-select",
      "aria-label": "选择已获取模型",
      disabled: view.modelOptions.length === 0,
    });
    modelSelect.append(element(doc, "option", {
      value: "",
      textContent: view.modelOptions.length ? "选择已获取模型" : "请先获取模型",
    }));
    for (const model of view.modelOptions) modelSelect.append(element(doc, "option", { value: model, textContent: model }));
    modelSelect.value = view.modelOptions.includes(settings.model) ? settings.model : "";
    modelInput.addEventListener("input", () => {
      state.settings.model = modelInput.value;
      modelSelect.value = view.modelOptions.includes(modelInput.value) ? modelInput.value : "";
    });
    modelSelect.addEventListener("change", () => {
      if (!modelSelect.value) return;
      state.settings.model = modelSelect.value;
      modelInput.value = modelSelect.value;
    });
    const modelsButton = actionButton(doc, "获取模型", "list-models", { icon: "refresh", title: "请求 Provider 的模型列表" });
    modelsButton.addEventListener("click", async () => {
      setViewBusy(view, true);
      setInlineNotice("正在获取模型列表……");
      try {
        const response = await callNode("list-models", { settings: { ...state.settings, apiKey: view.keyDraft } });
        view.modelOptions = modelOptionValues(response.models);
        setInlineNotice(`已获取 ${view.modelOptions.length} 个模型。`, "success");
        view.render();
      } catch (error) {
        setInlineNotice(`${error.message} 仍可手动填写模型名称。`, "error");
      } finally {
        setViewBusy(view, false);
      }
    });
    const modelLine = element(doc, "div", { className: "ctpo-inline ctpo-model-line" }, [modelInput, modelSelect, modelsButton]);
    const modelField = field(doc, "模型名称", modelLine, "获取模型后可从下拉框选择，也可手动填写模型名称。");
    modelField.classList.add("ctpo-field-full");
    grid.append(modelField);
    providerCard.append(grid);

    // API Settings 操作按钮
    const apiActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 14px; border-top: 1px solid var(--ctpo-border); padding-top: 12px;" });
    const save = actionButton(doc, "保存配置", "save-settings", { icon: "check", kind: "primary" });
    save.addEventListener("click", async () => {
      setViewBusy(view, true);
      setInlineNotice("正在保存配置……");
      try {
        const response = await callNode("save-settings", { settings: { ...state.settings, apiKey: view.keyDraft } });
        state.settings = { ...defaults, ...response.settings, apiKey: "" };
        view.keyDraft = "";
        setInlineNotice("配置已保存。", "success");
        view.render();
        scheduleScan();
      } catch (error) {
        setInlineNotice(error.message, "error");
      } finally {
        setViewBusy(view, false);
      }
    });
    const clearKey = actionButton(doc, "清除 Key", "clear-api-key", { icon: "trash", kind: "danger" });
    clearKey.addEventListener("click", async () => {
      setViewBusy(view, true);
      setInlineNotice("正在清除 API Key……");
      try {
        const response = await callNode("clear-api-key");
        state.settings = { ...state.settings, ...response.settings };
        view.keyDraft = "";
        setInlineNotice("API Key 已清除。", "success");
        view.render();
      } catch (error) {
        setInlineNotice(error.message, "error");
      } finally {
        setViewBusy(view, false);
      }
    });
    const test = actionButton(doc, "测试连接", "test-connection", { icon: "spark" });
    test.addEventListener("click", async () => {
      setViewBusy(view, true);
      setInlineNotice("正在测试连接……");
      try {
        const response = await callNode("test-connection", { settings: { ...state.settings, apiKey: view.keyDraft } });
        setInlineNotice(`${response.message}（${response.responseType === "text" ? "模型文本响应" : "JSON 响应"}）`, "success");
      } catch (error) {
        setInlineNotice(error.message, "error");
      } finally {
        setViewBusy(view, false);
      }
    });
    const saveFeedback = element(doc, "span", { className: "ctpo-save-feedback", role: "status", "aria-live": "polite" });
    saveFeedback.textContent = view.inlineNotice.text;
    saveFeedback.dataset.kind = view.inlineNotice.kind;
    view.saveFeedback = saveFeedback;
    apiActions.append(save, clearKey, test, saveFeedback);
    providerCard.append(apiActions);

    // Card 4: 场景优化预设 & 指令
    const presetCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-presets` });
    presetCard.append(element(doc, "h2", { id: `${view.id}-presets` }, ["场景优化预设 & 指令"]));

    const presetsList = Array.isArray(settings.presets) && settings.presets.length
      ? settings.presets
      : [
        { id: "general", name: "通用优化", instruction: defaults.instruction },
        { id: "code", name: "编程开发" },
        { id: "concise", name: "精准精简" },
        { id: "cot", name: "深度推理 (CoT)" },
        { id: "translate", name: "中英转译" },
      ];
    const activePresetId = settings.activePresetId || "general";
    const currentPreset = presetsList.find((p) => p.id === activePresetId) || presetsList[0];

    const presetSelectLine = element(doc, "div", { className: "ctpo-inline", style: "gap: 8px; margin-bottom: 8px;" });
    const presetSelect = element(doc, "select", { "aria-label": "选择场景预设", style: "flex: 1; min-width: 140px;" });
    for (const p of presetsList) {
      presetSelect.append(element(doc, "option", { value: p.id, textContent: p.name }));
    }
    presetSelect.value = activePresetId;
    presetSelect.addEventListener("change", async () => {
      try {
        const res = await callNode("select-preset", { presetId: presetSelect.value });
        state.settings = { ...state.settings, ...res.settings };
        setInlineNotice(`已应用【${presetsList.find((p) => p.id === presetSelect.value)?.name}】预设指令`, "success");
        view.render();
      } catch (e) {
        setInlineNotice(e.message, "error");
      }
    });

    const addPresetBtn = actionButton(doc, "+ 新增预设", "add-preset", { icon: "spark", title: "添加自定义场景预设" });
    addPresetBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "新增场景预设",
        message: "请输入新预设的名称（例如：SQL 调优、UI 设计、文案润色 等）：",
        showInput: true,
        inputPlaceholder: "例如：代码重构",
        initialValue: "自定义预设",
        confirmText: "创建预设",
        onConfirm: async (name) => {
          if (!name) return;
          const newPreset = {
            id: `preset-${Date.now()}`,
            name,
            instruction: state.settings.instruction || defaults.instruction,
          };
          setViewBusy(view, true);
          try {
            const res = await callNode("save-preset", { preset: newPreset });
            await callNode("select-preset", { presetId: newPreset.id });
            state.settings = { ...state.settings, ...res.settings, activePresetId: newPreset.id, instruction: newPreset.instruction };
            setInlineNotice(`已创建并切换到【${name}】预设`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    const renamePresetBtn = actionButton(doc, "重命名", "rename-preset", { icon: "edit", title: "重命名当前选中的场景预设" });
    renamePresetBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "重命名场景预设",
        message: `修改预设【${currentPreset.name}】的名称：`,
        showInput: true,
        initialValue: currentPreset.name,
        confirmText: "保存名称",
        onConfirm: async (newName) => {
          if (!newName || newName === currentPreset.name) return;
          setViewBusy(view, true);
          try {
            const updated = { ...currentPreset, name: newName };
            const res = await callNode("save-preset", { preset: updated });
            state.settings = { ...state.settings, ...res.settings };
            setInlineNotice(`预设已重命名为【${newName}】`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    const delPresetBtn = actionButton(doc, "删除预设", "delete-preset", { icon: "trash", kind: "danger", title: "删除当前选中的场景预设" });
    delPresetBtn.addEventListener("click", () => {
      if (presetsList.length <= 1) {
        setInlineNotice("至少保留一个场景预设，无法删除。", "error");
        return;
      }
      showModalDialog(doc, {
        title: "删除场景预设",
        message: `确认删除场景预设【${currentPreset.name}】吗？该操作不可撤销。`,
        confirmText: "确认删除",
        isDanger: true,
        onConfirm: async () => {
          setViewBusy(view, true);
          try {
            const res = await callNode("delete-preset", { presetId: currentPreset.id });
            state.settings = { ...state.settings, ...res.settings };
            setInlineNotice(`预设【${currentPreset.name}】已删除。`, "success");
            view.render();
          } catch (e) {
            setInlineNotice(e.message, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });

    presetSelectLine.append(presetSelect, addPresetBtn, renamePresetBtn, delPresetBtn);
    presetCard.append(field(doc, "选择场景预设", presetSelectLine, "可切换或新建编程、精简、思维链推导、转译等自定义优化预设。"));

    const instruction = element(doc, "textarea", { id: createSettingsId(view, "instruction"), "aria-label": "默认优化指令" }, [settings.instruction]);
    instruction.addEventListener("input", () => { state.settings.instruction = instruction.value; });
    
    const resetInstruction = actionButton(doc, "恢复默认", "reset-instruction", { icon: "refresh" });
    resetInstruction.addEventListener("click", () => {
      state.settings.instruction = defaults.instruction;
      instruction.value = defaults.instruction;
      setInlineNotice("已恢复默认优化指令。");
    });

    const savePresetBtn = actionButton(doc, "保存预设与指令", "save-preset-instruction", { icon: "check", kind: "primary" });
    savePresetBtn.addEventListener("click", async () => {
      setViewBusy(view, true);
      try {
        const activePreset = presetsList.find((p) => p.id === (settings.activePresetId || "general"));
        if (activePreset) {
          activePreset.instruction = instruction.value;
          await callNode("save-preset", { preset: activePreset });
        }
        const response = await callNode("save-settings", { settings: { ...state.settings, instruction: instruction.value } });
        state.settings = { ...defaults, ...response.settings };
        setInlineNotice(`预设【${currentPreset.name}】与优化指令已保存。`, "success");
        view.render();
      } catch (error) {
        setInlineNotice(error.message, "error");
      } finally {
        setViewBusy(view, false);
      }
    });

    presetCard.append(field(doc, `当前预设指令（${currentPreset.name}）`, instruction, "只影响最终生成；多轮澄清始终使用固定 JSON 协议指令。"));
    const presetActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 10px; justify-content: flex-end;" }, [resetInstruction, savePresetBtn]);
    presetCard.append(presetActions);

    // Card 5: 优化历史与收藏
    const historyCard = element(doc, "section", {
      className: "ctpo-card",
      "aria-labelledby": `${view.id}-history`,
      "data-ctpo-settings-section": "history",
    });
    historyCard.append(element(doc, "h2", { id: `${view.id}-history` }, ["优化历史与收藏"]));
    
    const historyLimit = element(doc, "select", { id: createSettingsId(view, "history-limit") });
    for (const value of HISTORY_OPTIONS) historyLimit.append(element(doc, "option", { value, textContent: value === 0 ? "0（不保留）" : String(value) }));
    historyLimit.value = String(settings.historyLimit);
    historyLimit.addEventListener("change", async () => {
      state.settings.historyLimit = Number(historyLimit.value);
      try {
        await callNode("save-settings", { settings: { ...state.settings, historyLimit: Number(historyLimit.value) } });
        setInlineNotice("历史保留数量已更新。", "success");
      } catch (e) {
        setInlineNotice(e.message, "error");
      }
    });
    historyCard.append(field(doc, "历史保留数量", historyLimit, "置顶收藏的历史不受数量限制。"));

    const historySearch = element(doc, "input", {
      type: "search",
      className: "ctpo-history-search",
      placeholder: "搜索历史提示词或优化结果...",
    });
    historySearch.value = view.historySearch;
    const historyList = element(doc, "ul", { className: "ctpo-history-list" });
    
    // 150ms debounced search to avoid DOM thrashing
    historySearch.addEventListener("input", () => {
      view.historySearch = historySearch.value;
      if (view.searchTimer) clearTimeout(view.searchTimer);
      view.searchTimer = setTimeout(() => {
        renderHistoryList(doc, {
          history: state.history,
          historyLimit: state.settings.historyLimit,
          selectedHistoryIds: view.selectedHistoryIds,
          searchQuery: view.historySearch,
          listContainer: historyList,
          onTogglePin: async (entry) => {
            const res = await callNode("toggle-pin-history", { id: entry.id });
            if (Array.isArray(res.entries)) state.history = res.entries;
            else entry.isPinned = res.isPinned;
          },
          onDeleteHistory: async (id) => {
            await callNode("delete-history", { id });
            state.history = state.history.filter((item) => item.id !== id);
          },
          onBatchPin: async (ids) => {
            for (const id of ids) {
              await callNode("toggle-pin-history", { id, pin: true });
              const item = state.history.find((e) => e.id === id);
              if (item) item.isPinned = true;
            }
          },
          onBatchDelete: async (ids) => {
            for (const id of ids) {
              await callNode("delete-history", { id });
              state.history = state.history.filter((item) => item.id !== id);
            }
          },
          onPreviewHistory: (entry) => {
            showPreview({
              original: entry.original,
              result: entry.result,
              clarifications: entry.clarifications,
              mode: entry.mode,
              context: null,
              fromHistory: true,
            });
          },
          onNotice: (msg, kind) => setInlineNotice(msg, kind),
        });
      }, 150);
    });

    historyCard.append(historySearch);
    renderHistoryList(doc, {
      history: state.history,
      historyLimit: state.settings.historyLimit,
      selectedHistoryIds: view.selectedHistoryIds,
      searchQuery: view.historySearch,
      listContainer: historyList,
      onTogglePin: async (entry) => {
        const res = await callNode("toggle-pin-history", { id: entry.id });
        if (Array.isArray(res.entries)) state.history = res.entries;
        else entry.isPinned = res.isPinned;
      },
      onDeleteHistory: async (id) => {
        await callNode("delete-history", { id });
        state.history = state.history.filter((item) => item.id !== id);
      },
      onBatchPin: async (ids) => {
        for (const id of ids) {
          await callNode("toggle-pin-history", { id, pin: true });
          const item = state.history.find((e) => e.id === id);
          if (item) item.isPinned = true;
        }
      },
      onBatchDelete: async (ids) => {
        for (const id of ids) {
          await callNode("delete-history", { id });
          state.history = state.history.filter((item) => item.id !== id);
        }
      },
      onPreviewHistory: (entry) => {
        showPreview({
          original: entry.original,
          result: entry.result,
          clarifications: entry.clarifications,
          mode: entry.mode,
          context: null,
          fromHistory: true,
        });
      },
      onNotice: (msg, kind) => setInlineNotice(msg, kind),
    });
    historyCard.append(historyList);

    const clearAllHistoryBtn = actionButton(doc, "清空所有历史", "clear-all-history", { icon: "trash", kind: "danger", title: "清空所有未置顶及已保存的历史记录" });
    clearAllHistoryBtn.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "清空优化历史",
        message: "确认清空所有提示词优化历史记录吗？",
        confirmText: "确认清空",
        isDanger: true,
        onConfirm: async () => {
          try {
            await callNode("clear-history");
            state.history = [];
            view.render();
            setInlineNotice("历史记录已清空。", "success");
          } catch (e) {
            setInlineNotice(e.message, "error");
          }
        },
      });
    });
    const historyBottomActions = element(doc, "div", { className: "ctpo-actions", style: "margin-top: 10px;" }, [clearAllHistoryBtn]);
    historyCard.append(historyBottomActions);

    // Card 6: 临时定位诊断
    const debugCard = element(doc, "section", {
      className: "ctpo-card",
      "aria-labelledby": `${view.id}-debug-geometry`,
      "data-ctpo-settings-section": "debug-geometry",
    });
    debugCard.append(
      element(doc, "h2", { id: `${view.id}-debug-geometry` }, ["临时定位诊断"]),
      element(doc, "p", { className: "ctpo-hint" }, ["仅在开发或排查按钮定位异常时使用；默认关闭且不记录任何输入内容或 API Key。"]),
    );

    const debugDetails = element(doc, "details", { className: "ctpo-debug-details" });
    const debugSummary = element(doc, "summary", { className: "ctpo-debug-summary" }, [
      element(doc, "span", {}, ["🛠️ 展开 / 折叠定位诊断测试工具"]),
      element(doc, "span", { className: "ctpo-badge", style: "font-size: 11px; opacity: 0.8;" }, [state.debugGeometry ? "诊断已开启" : "默认隐藏"]),
    ]);

    const debugContent = element(doc, "div", { className: "ctpo-debug-content" });

    const debugGuide = element(doc, "div", { className: "ctpo-debug-guide" }, [
      element(doc, "strong", {}, ["📖 定位诊断测试操作步骤："]),
      element(doc, "ol", {}, [
        element(doc, "li", {}, ["开启下方的「启用临时定位诊断」开关；"]),
        element(doc, "li", {}, ["返回主界面，在 Composer 输入框中粘贴或输入任意一段提示词；"]),
        element(doc, "li", {}, ["观察 Composer 附近是否正常出现「✦ 优化 ⌵」按钮；"]),
        element(doc, "li", {}, ["回到此设置卡片，点击「选择诊断文本（Ctrl+C 复制）」导出诊断 JSON 并反馈给开发者；"]),
        element(doc, "li", {}, ["测试完成后，可随时关闭开关或点击「清空诊断」释放临时会话数据。"]),
      ]),
    ]);

    const debugSwitchLabel = element(doc, "label", { className: "ctpo-switch-row" });
    const debugSwitchCopy = element(doc, "span", {}, [
      element(doc, "span", { className: "ctpo-label" }, ["启用临时定位诊断"]),
      element(doc, "span", { className: "ctpo-hint" }, ["打开后请在输入框键入一次，再复制下方诊断 JSON。关闭或停用后记录不写入磁盘。"]),
    ]);
    const debugSwitch = element(doc, "input", {
      type: "checkbox",
      className: "ctpo-switch",
      role: "switch",
      "aria-label": "启用临时定位诊断",
      checked: state.debugGeometry,
    });
    debugSwitch.addEventListener("change", () => {
      state.debugGeometry = Boolean(debugSwitch.checked);
      refreshDebugOutputViews();
      if (state.debugGeometry) {
        setNotice("临时定位诊断已开启，仅记录几何和控件标识，不记录输入内容。", "success");
        scheduleScan();
      } else {
        setNotice("临时定位诊断已关闭；现有诊断记录仍保留在本次会话中。");
      }
      view.render();
    });
    debugSwitchLabel.append(debugSwitchCopy, debugSwitch);

    const debugOutput = element(doc, "textarea", {
      className: "ctpo-debug-output",
      "aria-label": "定位诊断输出",
      readOnly: true,
      spellcheck: "false",
      wrap: "off",
    });
    debugOutput.value = JSON.stringify(state.debugGeometryReports, null, 2);
    view.debugOutput = debugOutput;

    const debugActions = element(doc, "div", { className: "ctpo-actions" });
    const selectDebug = actionButton(doc, "选择诊断文本（Ctrl+C 复制）", "select-debug-geometry", { icon: "copy", title: "选择不含输入内容的几何诊断 JSON" });
    selectDebug.addEventListener("click", () => {
      debugOutput.focus?.();
      debugOutput.select?.();
      setInlineNotice("诊断 JSON 已选中，请按 Ctrl+C 复制；内容不含输入文本。", "success");
    });
    const clearDebug = actionButton(doc, "清空诊断", "clear-debug-geometry", { icon: "trash", kind: "danger", title: "清空本次会话的定位诊断记录" });
    clearDebug.addEventListener("click", () => {
      state.debugGeometryReports.length = 0;
      refreshDebugOutputViews();
      setInlineNotice("定位诊断记录已清空。", "success");
    });
    debugActions.append(selectDebug, clearDebug);

    debugContent.append(debugGuide, debugSwitchLabel, debugActions, debugOutput);
    debugDetails.append(debugSummary, debugContent);
    debugCard.append(debugDetails);

    // Card 7: 卸载前清理数据
    const cleanupCard = element(doc, "section", { className: "ctpo-card", "aria-labelledby": `${view.id}-cleanup`, style: "margin-top: 16px;" });
    cleanupCard.append(
      element(doc, "h2", { id: `${view.id}-cleanup` }, ["卸载前清理数据"]),
      element(doc, "p", { className: "ctpo-hint" }, ["清除 API Key、历史记录和已保存 Provider 配置；包停用不会自动执行此操作。"]),
    );
    const cleanupButton = actionButton(doc, "清理包数据", "clear-history", { icon: "trash", kind: "danger" });
    cleanupButton.addEventListener("click", () => {
      showModalDialog(doc, {
        title: "清理所有包数据",
        message: "清除 API Key、历史记录和已保存 Provider 配置？建议在卸载前执行。",
        confirmText: "确认清理",
        isDanger: true,
        onConfirm: async () => {
          setViewBusy(view, true);
          try {
            await callNode("clear-api-key");
            await callNode("clear-history");
            const response = await callNode("save-settings", {
              settings: {
                ...defaults,
                apiKey: "",
                clearApiKey: true,
              },
            });
            state.settings = { ...defaults, ...(response.settings ?? {}), apiKey: "" };
            state.history = [];
            state.latestSnapshot = null;
            state.latestRestoreEntry?.restoreButton?.remove();
            state.latestRestoreEntry = null;
            setNotice("包数据已清理，可以继续卸载功能包。", "success");
            view.render();
            scheduleScan();
          } catch (error) {
            setNotice(`包数据清理未完成：${error.message}`, "error");
          } finally {
            setViewBusy(view, false);
          }
        },
      });
    });
    cleanupCard.append(element(doc, "div", { className: "ctpo-actions" }, [cleanupButton]));

    wrapper.append(generalCard, profileCard, providerCard, presetCard, historyCard, debugCard, cleanupCard);

    const status = element(doc, "div", { className: "ctpo-status", role: "status", "aria-live": "polite" }, [state.notice?.text || ""]);
    status.dataset.kind = state.notice?.kind || "";
    view.status = status;
    wrapper.append(status);
    container.append(wrapper);
    setViewBusy(view, view.busy);
  };

  state.settingsViews.add(view);
  view.render();
  return () => {
    state.settingsViews.delete(view);
    container.removeAttribute(ROOT_ATTRIBUTE);
  };
}

export function openSettingsDialogModal({
  doc,
  state,
  dialogHost,
  defaults,
  callNode,
  setNotice,
  scheduleScan,
  refreshSettingsViews,
  refreshDebugOutputViews,
  showPreview,
  focusHistory = false,
}) {
  if (state.settingsDialog) {
    state.settingsDialog.cleanup?.();
    state.settingsDialog.backdrop?.remove();
    state.settingsDialog = null;
  }
  const returnFocus = doc.activeElement;
  const backdrop = element(doc, "div", {
    className: "ctpo-settings-dialog-backdrop",
    role: "presentation",
  });
  backdrop.style.inset = "0";
  backdrop.style.position = "fixed";
  backdrop.style.zIndex = "2147483002";
  backdrop.style.display = "flex";
  backdrop.style.alignItems = "center";
  backdrop.style.justifyContent = "center";
  backdrop.style.background = "rgba(0, 0, 0, 0.4)";

  const dialog = element(doc, "div", {
    className: "ctpo-settings-dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "ctpo-settings-dialog-title",
  });
  const header = element(doc, "header", { className: "ctpo-settings-dialog-header" }, [
    element(doc, "h2", { id: "ctpo-settings-dialog-title" }, ["提示词优化设置"]),
  ]);
  const close = element(doc, "button", {
    type: "button",
    className: "ctpo-panel-close",
    "aria-label": "关闭提示词优化设置",
    "data-ctpo-tooltip": "关闭",
  }, [svgIcon(doc, "close")]);

  const closeDialog = () => {
    if (!state.settingsDialog) return;
    state.settingsDialog = null;
    cleanup();
    backdrop.remove();
    if (returnFocus?.focus) returnFocus.focus();
  };

  close.addEventListener("click", closeDialog);
  header.append(close);
  const content = element(doc, "div", { className: "ctpo-settings-dialog-content" });
  dialog.append(header, content);
  backdrop.append(dialog);
  dialogHost.append(backdrop);

  const cleanup = buildSettingsView(content, {
    doc,
    state,
    defaults,
    embedded: true,
    callNode,
    setNotice,
    scheduleScan,
    refreshSettingsViews,
    refreshDebugOutputViews,
    showPreview,
  });

  state.settingsDialog = { backdrop, cleanup, close: closeDialog };
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) closeDialog();
  });

  const history = focusHistory ? content.querySelector?.('[data-ctpo-settings-section="history"]') : null;
  if (history) history.scrollIntoView?.({ block: "start" });
  else close.focus?.();
}
