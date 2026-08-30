import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_INSTRUCTION,
  buildClarificationPayload,
  buildOptimizationPayload,
  activate,
  createNodeRuntime,
  endpointCandidates,
  extractResponseText,
  modelsEndpointCandidates,
  parseJsonResponseBody,
  parseClarificationJson,
  redactSettings,
  sanitizeError,
  validateBaseUrl,
} from "../src/node.js";

async function makeTempDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "ctpo-test-"));
}

async function makeServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function readRequest(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function withRuntime(server, protocol = "openaiResponses", options = {}) {
  const dataDirectory = await makeTempDirectory();
  const runtime = createNodeRuntime({ dataDirectory, ...options });
  const saved = await runtime.invoke("save-settings", {
    settings: {
      enabled: true,
      mode: "direct",
      protocol,
      baseUrl: server.baseUrl,
      apiKey: "test-secret-key",
      model: "test-model",
      instruction: DEFAULT_INSTRUCTION,
      historyLimit: 10,
    },
  });
  assert.equal(saved.status, "ok");
  return {
    runtime,
    dataDirectory,
    cleanup: async () => {
      runtime.dispose();
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

test("validates safe API URLs and bounded endpoint fallback", () => {
  assert.doesNotThrow(() => validateBaseUrl("https://api.example.com"));
  assert.doesNotThrow(() => validateBaseUrl("http://127.0.0.1:8080"));
  assert.throws(() => validateBaseUrl("http://api.example.com"), /HTTPS/);
  assert.throws(() => validateBaseUrl("https://user:pass@api.example.com"), /用户名或密码/);
  assert.deepEqual(endpointCandidates("https://api.example.com", "openaiResponses"), [
    "https://api.example.com/responses",
    "https://api.example.com/v1/responses",
  ]);
  assert.deepEqual(endpointCandidates("https://api.example.com/v1", "openaiResponses"), [
    "https://api.example.com/v1/responses",
  ]);
  assert.deepEqual(modelsEndpointCandidates("https://api.example.com/v1/chat/completions"), [
    "https://api.example.com/v1/models",
  ]);
});

test("builds the three supported non-streaming protocol payloads", () => {
  const common = { model: "m", instruction: "only output prompt", text: "请总结这段话。" };
  const responses = buildOptimizationPayload({ protocol: "openaiResponses", ...common });
  assert.equal(responses.stream, false);
  assert.equal(responses.input[0].content[0].text.includes("请总结这段话"), true);
  const chat = buildOptimizationPayload({ protocol: "openaiChatCompletions", ...common });
  assert.equal(chat.messages[0].role, "system");
  assert.equal(chat.max_tokens, 2048);
  const anthropic = buildOptimizationPayload({ protocol: "anthropicMessages", ...common });
  assert.equal(anthropic.system, "only output prompt");
  assert.equal(anthropic.messages[0].role, "user");
  const clarification = buildClarificationPayload({ protocol: "openaiResponses", model: "m", original: "写一个计划", round: 1 });
  assert.equal(clarification.instructions.includes("合法 JSON"), true);
  assert.equal(clarification.stream, false);
});

test("extracts known response shapes and rejects malformed clarification JSON", () => {
  assert.equal(extractResponseText({ output_text: "responses" }), "responses");
  assert.equal(extractResponseText({ choices: [{ message: { content: [{ type: "text", text: "chat" }] } }] }), "chat");
  assert.equal(extractResponseText({ content: [{ type: "text", text: "anthropic" }] }), "anthropic");
  assert.deepEqual(parseClarificationJson('{"questions":["目标用户是谁？"],"readyToGenerate":false}'), {
    questions: ["目标用户是谁？"],
    readyToGenerate: false,
  });
  assert.deepEqual(parseClarificationJson("```json\n{\"questions\":[],\"readyToGenerate\":true}\n```"), {
    questions: [],
    readyToGenerate: true,
  });
  assert.throws(() => parseClarificationJson("not-json"), /合法 JSON/);
  assert.throws(() => parseClarificationJson('{"questions":["1","2","3","4"],"readyToGenerate":false}'), /数量/);
});

test("accepts a BOM-prefixed JSON response and finite known SSE envelopes", () => {
  assert.deepEqual(parseJsonResponseBody('\ufeff {"output_text":"OK"}'), { output_text: "OK" });
  assert.deepEqual(parseJsonResponseBody([
    'data: {"type":"response.output_text.delta","delta":"O"}',
    '',
    'data: {"type":"response.output_text.delta","delta":"K"}',
    '',
    'data: [DONE]',
  ].join("\n")), { output_text: "OK" });
  assert.deepEqual(parseJsonResponseBody([
    'data: {"choices":[{"delta":{"content":"O"}}]}',
    'data: {"choices":[{"delta":{"content":"K"}}]}',
    'data: [DONE]',
  ].join("\n")), { choices: [{ message: { content: "OK" } }] });
});

test("accepts standard multi-line SSE data events", () => {
  const body = parseJsonResponseBody([
    "event: response.completed",
    'data: {"type":"response.completed",',
    'data: "response":{"output":[{"content":[{"type":"output_text","text":"OK"}]}]}}',
    "",
    "data: [DONE]",
  ].join("\n"));

  assert.equal(extractResponseText(body), "OK");
});

test("uses standard multi-line SSE responses through both OpenAI optimization RPCs", async (t) => {
  const server = await makeServer(async (request, response) => {
    await readRequest(request);
    response.setHeader("content-type", "text/event-stream");
    const payload = request.url === "/responses"
      ? [
        "event: response.completed",
        'data: {"type":"response.completed",',
        'data: "response":{"output":[{"content":[{"type":"output_text","text":"优化结果"}]}]}}',
      ]
      : [
        "event: message",
        'data: {"choices":[{"message":',
        'data: {"content":"优化结果"}}]}',
      ];
    response.end([...payload, "", "data: [DONE]"].join("\n"));
  });
  t.after(() => server.close());
  for (const protocol of ["openaiResponses", "openaiChatCompletions"]) {
    const fixture = await withRuntime(server, protocol);
    try {
      const result = await fixture.runtime.invoke("optimize", { operationId: `multiline-sse-${protocol}`, text: "原始提示词" });
      assert.equal(result.status, "ok", JSON.stringify(result));
      assert.equal(result.result, "优化结果");
    } finally {
      await fixture.cleanup();
    }
  }
});

test("supports all three protocols and finite /v1 fallback without streaming", async (t) => {
  const calls = [];
  const server = await makeServer(async (request, response) => {
    calls.push({ method: request.method, url: request.url, body: request.method === "POST" ? await readRequest(request) : null });
    response.setHeader("content-type", "application/json");
    if (request.url === "/responses" || request.url === "/chat/completions") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    if (request.url === "/v1/responses") response.end(JSON.stringify({ output_text: "优化后的 Responses" }));
    else if (request.url === "/v1/chat/completions") response.end(JSON.stringify({ choices: [{ message: { content: "优化后的 Chat" } }] }));
    else if (request.url === "/v1/messages") response.end(JSON.stringify({ content: [{ type: "text", text: "优化后的 Anthropic" }] }));
    else {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  t.after(() => server.close());

  for (const [protocol, expected] of [
    ["openaiResponses", "优化后的 Responses"],
    ["openaiChatCompletions", "优化后的 Chat"],
    ["anthropicMessages", "优化后的 Anthropic"],
  ]) {
    const fixture = await withRuntime(server, protocol);
    try {
      const result = await fixture.runtime.invoke("optimize", { operationId: `protocol-${protocol}`, text: "原始提示词" });
      assert.equal(result.status, "ok", `${protocol}: ${JSON.stringify(result)}`);
      assert.equal(result.result, expected);
    } finally {
      await fixture.cleanup();
    }
  }
  assert.equal(calls.filter((call) => call.url === "/responses").length, 1);
  assert.equal(calls.filter((call) => call.url === "/chat/completions").length, 1);
  assert.equal(calls.filter((call) => call.url === "/v1/messages").length, 1);
});

test("list-models and test-connection accept complete known SSE responses for OpenAI-compatible providers", async (t) => {
  const server = await makeServer(async (request, response) => {
    if (request.method === "POST") await readRequest(request);
    if (request.method === "GET" && request.url === "/models") {
      response.setHeader("content-type", "application/json");
      response.end('\ufeff{"data":[{"id":"test-model"}]}');
      return;
    }
    response.setHeader("content-type", "text/event-stream");
    if (request.url === "/responses") {
      response.end([
        'data: {"type":"response.output_text.delta","delta":"O"}',
        '',
        'data: {"type":"response.output_text.delta","delta":"K"}',
        '',
        'data: [DONE]',
      ].join("\n"));
    } else if (request.url === "/chat/completions") {
      response.end([
        'data: {"choices":[{"delta":{"content":"O"}}]}',
        'data: {"choices":[{"delta":{"content":"K"}}]}',
        'data: [DONE]',
      ].join("\n"));
    } else if (request.url === "/v1/messages") {
      response.end(JSON.stringify({ content: [{ type: "text", text: "OK" }] }));
    } else {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  t.after(() => server.close());

  for (const protocol of ["openaiResponses", "openaiChatCompletions", "anthropicMessages"]) {
    const fixture = await withRuntime(server, protocol);
    try {
      const models = await fixture.runtime.invoke("list-models", { operationId: `models-${protocol}` });
      assert.equal(models.status, "ok", `${protocol}: ${JSON.stringify(models)}`);
      assert.deepEqual(models.models, ["test-model"]);
      const connection = await fixture.runtime.invoke("test-connection", { operationId: `connection-${protocol}` });
      assert.equal(connection.status, "ok", `${protocol}: ${JSON.stringify(connection)}`);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("lists models before a model has been selected", async (t) => {
  const server = await makeServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/models");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "test-model" }] }));
  });
  t.after(() => server.close());
  const dataDirectory = await makeTempDirectory();
  const runtime = createNodeRuntime({ dataDirectory });
  try {
    await runtime.invoke("save-settings", {
      settings: {
        protocol: "openaiChatCompletions",
        baseUrl: server.baseUrl,
        apiKey: "test-secret-key",
        model: "",
      },
    });

    const response = await runtime.invoke("list-models", { operationId: "models-without-model" });
    assert.equal(response.status, "ok", JSON.stringify(response));
    assert.deepEqual(response.models, ["test-model"]);
  } finally {
    runtime.dispose();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("keeps draft connection tests out of persisted settings and never returns the Key", async (t) => {
  const server = await makeServer(async (request, response) => {
    if (request.method === "POST") await readRequest(request);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ output_text: "OK" }));
  });
  t.after(() => server.close());
  const fixture = await withRuntime(server);
  try {
    const draft = await fixture.runtime.invoke("test-connection", {
      settings: {
        enabled: true,
        protocol: "openaiResponses",
        baseUrl: server.baseUrl,
        apiKey: "draft-only-key",
        model: "draft-model",
      },
    });
    assert.equal(draft.status, "ok");
    const loaded = await fixture.runtime.invoke("load-settings");
    assert.equal(loaded.settings.model, "test-model");
    assert.equal(loaded.settings.apiKeyConfigured, true);
    assert.equal(loaded.settings.apiKey, "");
    const rawConfig = JSON.parse(await readFile(path.join(fixture.dataDirectory, "config.json"), "utf8"));
    assert.equal(rawConfig.apiKey, "test-secret-key");
    assert.equal(JSON.stringify(draft).includes("draft-only-key"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("handles empty input, empty result, HTTP errors, timeouts and redaction", async (t) => {
  const errorServer = await makeServer(async (request, response) => {
    if (request.method === "POST") await readRequest(request);
    response.setHeader("content-type", "application/json");
    response.statusCode = 401;
    response.end(JSON.stringify({ error: "Bearer test-secret-key should not escape" }));
  });
  t.after(() => errorServer.close());
  const fixture = await withRuntime(errorServer);
  try {
    const empty = await fixture.runtime.invoke("optimize", { text: "" });
    assert.equal(empty.code, "empty_input");
    const error = await fixture.runtime.invoke("optimize", { text: "原文" });
    assert.equal(error.status, "failed");
    assert.equal(JSON.stringify(error).includes("test-secret-key"), false);
    assert.equal(sanitizeError(new Error("Authorization: Bearer test-secret-key"), ["test-secret-key"]).includes("test-secret-key"), false);
  } finally {
    await fixture.cleanup();
  }

  const emptyServer = await makeServer(async (request, response) => {
    if (request.method === "POST") await readRequest(request);
    response.setHeader("content-type", "application/json");
    if (request.url === "/responses") {
      response.statusCode = 404;
      response.end("not found");
    } else response.end(JSON.stringify({ output_text: "" }));
  });
  const emptyFixture = await withRuntime(emptyServer);
  try {
    const emptyResult = await emptyFixture.runtime.invoke("optimize", { text: "原文", operationId: "empty-result" });
    assert.equal(emptyResult.code, "empty_result");
  } finally {
    await emptyFixture.cleanup();
    await emptyServer.close();
  }

  const slow = await makeServer(() => {});
  const slowFixture = await withRuntime(slow, "openaiResponses", { timeoutMs: 40 });
  try {
    const timeout = await slowFixture.runtime.invoke("optimize", { operationId: "timeout", text: "原文" });
    assert.equal(timeout.code, "timeout");
  } finally {
    await slowFixture.cleanup();
    await slow.close();
  }
});

test("cancellation prevents a completed result and history is explicit", async (t) => {
  let requestAborted = false;
  const server = await makeServer((request, response) => {
    request.on("aborted", () => { requestAborted = true; });
    // The client must cancel this request; the server intentionally never completes it.
    response.setHeader("content-type", "application/json");
  });
  t.after(() => server.close());
  const fixture = await withRuntime(server, "openaiResponses", { timeoutMs: 500 });
  try {
    const pending = fixture.runtime.invoke("optimize", { operationId: "cancel-me", text: "原文" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const cancellation = await fixture.runtime.invoke("optimize", { operationId: "cancel-me", cancel: true });
    assert.equal(cancellation.status, "ok");
    const result = await pending;
    assert.equal(result.status, "cancelled");
    assert.equal((await fixture.runtime.invoke("list-history")).entries.length, 0);
    assert.equal(requestAborted, true);
    await fixture.runtime.invoke("save-settings", { historyRecord: { original: "原文", result: "结果", mode: "direct" } });
    assert.equal((await fixture.runtime.invoke("list-history")).entries.length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("history limits are constrained to 0/5/10/20/50 and records contain no provider data", async () => {
  const dataDirectory = await makeTempDirectory();
  const runtime = createNodeRuntime({ dataDirectory });
  try {
    await runtime.invoke("save-settings", {
      settings: { historyLimit: 5, baseUrl: "https://api.example.com", apiKey: "secret", model: "m" },
    });
    for (let index = 0; index < 7; index += 1) {
      await runtime.invoke("save-settings", { historyRecord: { original: `原文 ${index}`, result: `结果 ${index}`, mode: "preview" } });
    }
    assert.equal((await runtime.invoke("list-history")).entries.length, 5);
    await runtime.invoke("save-settings", { settings: { historyLimit: 0 } });
    assert.equal((await runtime.invoke("list-history")).entries.length, 0);
    const rawHistory = await readFile(path.join(dataDirectory, "history.json"), "utf8");
    assert.equal(rawHistory.includes("api.example.com"), false);
    assert.equal(rawHistory.includes("secret"), false);
    const redacted = redactSettings({ baseUrl: "https://api.example.com", apiKey: "secret", model: "m" });
    assert.equal(redacted.apiKey, "");
  } finally {
    runtime.dispose();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("registers exactly the fixed Node RPC surface and cleans registrations", async () => {
  const dataDirectory = await makeTempDirectory();
  const names = [];
  let unregistered = 0;
  const runtime = activate({
    dataDirectory,
    rpc: {
      handle(name) {
        names.push(name);
        return () => { unregistered += 1; };
      },
    },
  });
  try {
    assert.deepEqual(names, [
      "load-settings",
      "save-settings",
      "clear-api-key",
      "test-connection",
      "list-models",
      "optimize",
      "clarify-round",
      "list-history",
      "delete-history",
      "clear-history",
    ]);
  } finally {
    runtime.dispose();
    assert.equal(unregistered, names.length);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
