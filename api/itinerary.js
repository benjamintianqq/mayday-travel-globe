// API_URL 放到 handler 内部，确保每次请求时才读取 process.env（避免模块加载时 env 未注入）

const ITINERARY_TOOL = {
  name: 'create_itinerary',
  description: '为旅行者创建详细的境外旅行行程规划，包含每天的景点、餐厅、住宿安排',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '行程标题，如"东京5日深度游·文化与美食的交响"',
      },
      summary: {
        type: 'string',
        description: '行程总体描述，100字以内，有温度地概括这次旅行的主题和亮点',
      },
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer', description: '第几天，从1开始' },
            title: { type: 'string', description: '当天主题名，如"古都漫游日"、"海岸黄金线"' },
            description: { type: 'string', description: '当天一句话描述，30字以内' },
            activities: {
              type: 'array',
              description: '当天活动列表，4-5个活动，最后一个必须是HOTEL类型',
              items: {
                type: 'object',
                properties: {
                  time: {
                    type: 'string',
                    description: '时间段，格式"HH:MM - HH:MM"，HOTEL写"晚间入住"',
                  },
                  name: { type: 'string', description: '地点/餐厅/酒店的中文名' },
                  nameEn: { type: 'string', description: '地点英文名或原文名' },
                  insight: {
                    type: 'string',
                    description: '精华介绍，60-100字，有温度有画面感，让读者心动',
                  },
                  category: {
                    type: 'string',
                    enum: ['ATTRACTION', 'DINING', 'HOTEL', 'EXPERIENCE'],
                    description: 'ATTRACTION=景点, DINING=餐饮, HOTEL=住宿, EXPERIENCE=体验活动',
                  },
                  mapQuery: {
                    type: 'string',
                    description: 'Google Maps搜索关键词，用英文，格式："Place Name, City, Country"，确保能搜到',
                  },
                  pricePerPerson: {
                    type: 'string',
                    description: '人均费用估算，以人民币表示，如"¥150-300"，没有则不填',
                  },
                  bookingTip: {
                    type: 'string',
                    description: '预订建议或注意事项，如"建议提前1周预订"，选填',
                  },
                },
                required: ['time', 'name', 'nameEn', 'insight', 'category', 'mapQuery'],
              },
            },
          },
          required: ['day', 'title', 'description', 'activities'],
        },
      },
    },
    required: ['title', 'summary', 'days'],
  },
};

// 可重试的状态码：限流或临时过载
const RETRYABLE = new Set([429, 500, 503]);
const MODELS = ['gemini-2.5-flash','gemini-2.0-flash'];

async function callGemini(apiKey, model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
}

async function callWithRetry(apiKey, body, maxRetries = 3) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const model of MODELS) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s, 4s
      }
      const response = await callGemini(apiKey, model, body);
      if (response.ok) return response;

      if (RETRYABLE.has(response.status)) {
        const err = await response.json().catch(() => ({}));
        lastErr = err.error?.message || `HTTP ${response.status}`;
        continue; // 重试
      }

      // 非可重试错误（400, 401 等）立即抛出
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    // 该模型所有重试用尽，记录错误并尝试下一个模型
    console.warn(`[itinerary] ${model} failed after ${maxRetries} attempts: ${lastErr}`);
  }

  throw new Error('所有模型均返回限流错误，请稍后再试');
}

export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { country, days, style, budget } = req.body ?? {};
  if (!country || !days || !style || !budget) {
    return res.status(400).json({ error: 'Missing required fields: country, days, style, budget' });
  }

  const budgetDesc = {
    '舒适性价比': '住3星酒店，吃本地特色中等餐厅',
    '品质中高端': '住4星酒店，吃有质感的本地餐厅',
    '奢华享受': '住5星豪华酒店，吃高端餐厅和米其林',
  };

  const prompt = `
你是一位专业的旅行规划师，正在为中国旅行者规划一次五一出境游。

目的地信息：
- 国家：${country.nameCN}（${country.nameEN}）
- 所属地区：${country.region}
- 特色标签：${country.tags.join('、')}
- 国家特征：${country.desc}

行程需求：
- 出行天数：${days}天
- 旅行风格：${style}
- 预算档次：${budget}（${budgetDesc[budget] || budget}）
- 出发地：中国大陆

规划要求：
1. 每天安排4-5个活动，时间安排合理，考虑景点之间的距离
2. 每天最后一个活动必须是 HOTEL 类型的住宿安排，推荐具体酒店名称
3. 景点选择当地最具代表性、最值得去的地方，避免泛泛的推荐
4. 餐厅推荐要符合预算档次，优先推荐当地特色美食体验
5. insight描述要生动有温度，让读者看完就想去
6. mapQuery必须用英文，确保在Google Maps中能精准搜索到
7. pricePerPerson以人民币估算，参考当地实际消费水平
8. 第一天如有需要可以安排从机场/火车站出发的内容
`.trim();

  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ functionDeclarations: [ITINERARY_TOOL] }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['create_itinerary'],
      },
    },
    generationConfig: { temperature: 0.8 },
  };

  try {
    const response = await callWithRetry(API_KEY, geminiBody);
    const data = await response.json();
    const allParts = data.candidates?.[0]?.content?.parts ?? [];
    for (const p of allParts) {
      if (p.functionCall?.name === 'create_itinerary') {
        return res.status(200).json(p.functionCall.args);
      }
    }
    return res.status(502).json({ error: 'Gemini 未返回结构化行程数据，请重试' });
  } catch (e) {
    return res.status(502).json({ error: e.message || '服务器内部错误' });
  }
}
