// API_URL 放到 handler 内部，确保每次请求时才读取 process.env（避免模块加载时 env 未注入）

const STYLES  = ['文化历史深度', '轻松休闲度假', '户外冒险', '综合体验'];
const BUDGETS = ['舒适性价比', '品质中高端', '奢华享受'];

const PARSE_TOOL = {
  name: 'update_plan_params',
  description: '解析用户想修改旅行方案的哪些参数，只提取用户明确提到的字段',
  parameters: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        description: '新的出行天数（整数）。如果用户没有提到天数则不填此字段。',
      },
      style: {
        type: 'string',
        enum: STYLES,
        description: '新的旅行风格。如果用户没有提到风格则不填此字段。',
      },
      budget: {
        type: 'string',
        enum: BUDGETS,
        description: '新的预算档次。如果用户没有提到预算则不填此字段。',
      },
      reply: {
        type: 'string',
        description: '用一两句轻松的话确认你理解了用户的需求，说明会调整哪些内容，语气像朋友。',
      },
    },
    required: ['reply'],
  },
};

const RETRYABLE = new Set([429, 500, 503]);
const MODELS = ['gemini-2.5-flash'];

async function callWithRetry(apiKey, geminiBody, maxRetries = 3) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const model of MODELS) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1));
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      if (response.ok) return response;
      if (RETRYABLE.has(response.status)) {
        const err = await response.json().catch(() => ({}));
        lastErr = err.error?.message || `HTTP ${response.status}`;
        continue;
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    console.warn(`[parse-intent] ${model} failed after ${maxRetries} attempts: ${lastErr}`);
  }
  throw new Error('所有模型均返回限流错误，请稍后再试');
}

export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userMessage, currentParams, country } = req.body ?? {};
  if (!userMessage || !currentParams || !country) {
    return res.status(400).json({ error: 'Missing required fields: userMessage, currentParams, country' });
  }

  const prompt = `
用户正在修改去${country.nameCN}（${country.nameEN}）的旅行方案，当前方案参数如下：
- 出行天数：${currentParams.days} 天
- 旅行风格：${currentParams.style}
- 预算档次：${currentParams.budget}

可选风格：${STYLES.join('、')}
可选预算：${BUDGETS.join('、')}

用户说："${userMessage}"

请识别用户想调整哪些参数，并以 update_plan_params 工具的格式返回。
只提取用户明确提到的字段，没提到的不要修改。
  `.trim();

  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ functionDeclarations: [PARSE_TOOL] }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['update_plan_params'],
      },
    },
    generationConfig: { temperature: 0.2 },
  };

  try {
    const response = await callWithRetry(API_KEY, geminiBody);
    const data = await response.json();
    const allParts = data.candidates?.[0]?.content?.parts ?? [];
    for (const p of allParts) {
      if (p.functionCall?.name === 'update_plan_params') {
        const args = p.functionCall.args;
        return res.status(200).json({
          newParams: {
            days:   args.days   ?? currentParams.days,
            style:  args.style  ?? currentParams.style,
            budget: args.budget ?? currentParams.budget,
          },
          reply: args.reply ?? '好的，我来帮你调整！',
          changed: {
            days:   args.days   !== undefined && args.days   !== currentParams.days,
            style:  args.style  !== undefined && args.style  !== currentParams.style,
            budget: args.budget !== undefined && args.budget !== currentParams.budget,
          },
        });
      }
    }
    return res.status(502).json({ error: 'Gemini 未能解析修改意图，请换一种说法试试' });
  } catch (e) {
    return res.status(502).json({ error: e.message || '服务器内部错误' });
  }
}
