import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf-8"));

// ==================== 工具函数 ====================

function log(msg) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${time}] ${msg}`);
}

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || "POST",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(options.timeout || config.timeoutMs, () => {
      req.destroy(new Error("Request timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

// ==================== 图片检测与处理 ====================

function findImageBlocks(messages) {
  const images = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    if (!Array.isArray(msg.content)) continue;
    for (let ci = 0; ci < msg.content.length; ci++) {
      const block = msg.content[ci];
      // Anthropic 格式: type=image, source.type=base64
      if (block.type === "image" && block.source?.type === "base64") {
        images.push({
          messageIndex: mi,
          blockIndex: ci,
          mediaType: block.source.media_type || "image/png",
          base64: block.source.data,
        });
      }
    }
  }
  return images;
}

async function describeImage(image) {
  // 使用 OpenAI 兼容格式调用 mimo-v2.5 的视觉能力
  const dataUrl = `data:${image.mediaType};base64,${image.base64}`;
  const body = JSON.stringify({
    model: config.visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: config.describePrompt },
        ],
      },
    ],
    max_tokens: config.maxTokens,
    stream: false,
  });

  try {
    const res = await makeRequest(
      config.visionApiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.visionApiKey}`,
        },
        timeout: config.timeoutMs,
      },
      body
    );

    if (res.status !== 200) {
      log(`  ⚠️ 图片描述 API 返回 ${res.status}: ${res.body.slice(0, 200)}`);
      return config.fallbackText;
    }

    const data = JSON.parse(res.body);
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      log("  ⚠️ 图片描述 API 返回空内容");
      return config.fallbackText;
    }

    return `[Image Description]\n${text}`;
  } catch (err) {
    log(`  ❌ 图片描述失败: ${err.message}`);
    return config.fallbackText;
  }
}

function replaceImageBlocks(messages, images, descriptions) {
  // 从后往前替换，避免索引偏移
  const sorted = [...images].sort(
    (a, b) => b.blockIndex - a.blockIndex || b.messageIndex - a.messageIndex
  );

  for (let i = 0; i < sorted.length; i++) {
    const img = sorted[i];
    const desc = descriptions[i];
    const msg = messages[img.messageIndex];
    msg.content[img.blockIndex] = {
      type: "text",
      text: desc,
      ...(msg.content[img.blockIndex].cache_control
        ? { cache_control: msg.content[img.blockIndex].cache_control }
        : {}),
    };
  }

  return messages;
}

// ==================== 代理核心 ====================

async function handleRequest(clientReq, clientRes) {
  const chunks = [];
  for await (const chunk of clientReq) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf-8");

  // 只处理 POST /v1/messages
  const isMessagesEndpoint =
    clientReq.method === "POST" &&
    (clientReq.url === "/v1/messages" ||
      clientReq.url?.startsWith("/v1/messages?"));

  if (!isMessagesEndpoint) {
    return forwardToMiMo(clientReq, clientRes, rawBody);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return forwardToMiMo(clientReq, clientRes, rawBody);
  }

  const images = findImageBlocks(body.messages || []);

  if (images.length === 0) {
    return forwardToMiMo(clientReq, clientRes, rawBody);
  }

  log(`🖼️  检测到 ${images.length} 张图片，正在调用 ${config.visionModel} 描述...`);
  const startTime = Date.now();

  // 并发描述所有图片
  const descriptions = await Promise.all(images.map(describeImage));

  // 替换图片块为描述文字
  replaceImageBlocks(body.messages, images, descriptions);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`✅ 图片描述完成，耗时 ${elapsed}s`);

  const modifiedBody = JSON.stringify(body);
  forwardToMiMo(clientReq, clientRes, modifiedBody);
}

function forwardToMiMo(clientReq, clientRes, body) {
  const upstream = new URL(config.anthropicBaseUrl);

  const headers = { ...clientReq.headers };
  delete headers["host"];
  headers["host"] = upstream.host;
  headers["content-length"] = Buffer.byteLength(body);
  // 确保 API key 正确
  headers["x-api-key"] = config.anthropicApiKey;
  headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";

  const proxyReq = https.request(
    {
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname + clientReq.url,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    log(`❌ 转发到 MiMo 失败: ${err.message}`);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
    }
    clientRes.end(JSON.stringify({ error: "Vision Proxy: 转发到 MiMo 失败" }));
  });

  proxyReq.write(body);
  proxyReq.end();
}

// ==================== 启动服务 ====================

const server = http.createServer(handleRequest);

server.listen(config.proxyPort, "127.0.0.1", () => {
  log("═══════════════════════════════════════════");
  log("  Vision Proxy 已启动 (服务器版)");
  log(`  监听地址: http://127.0.0.1:${config.proxyPort}`);
  log(`  转发目标: ${config.anthropicBaseUrl}`);
  log(`  图片描述模型: ${config.visionModel} (OpenAI API)`);
  log(`  主模型: mimo-v2.5-pro (Anthropic API)`);
  log("═══════════════════════════════════════════");
});

process.on("SIGINT", () => {
  log("\n正在关闭 Vision Proxy...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  log("\n正在关闭 Vision Proxy...");
  server.close(() => process.exit(0));
});
