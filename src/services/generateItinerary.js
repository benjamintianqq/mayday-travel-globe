// 单段最大天数：超过这个值会拆分成多段并行请求，避免 Vercel 60s 函数超时
const CHUNK_SIZE = 6;

async function callItineraryAPI(body) {
  const response = await fetch('/api/itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    // 空响应 / 非 JSON — 多半是 Vercel 60s 超时
    throw new Error(`生成超时，请重试（服务器响应异常 ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

export async function generateItinerary({ country, days, style, budget }) {
  // 短行程：单次调用
  if (days <= CHUNK_SIZE) {
    return await callItineraryAPI({ country, days, style, budget });
  }

  // 长行程：拆成多段并行生成，最后拼接
  const chunks = [];
  for (let start = 1; start <= days; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, days);
    chunks.push({ start, end });
  }

  const results = await Promise.all(
    chunks.map(({ start, end }) =>
      callItineraryAPI({
        country,
        days,
        style,
        budget,
        dayRange: { start, end, total: days },
      })
    )
  );

  // 合并：用第一段的 title/summary，把所有 days 数组拼起来
  return {
    title: results[0].title,
    summary: results[0].summary,
    days: results.flatMap(r => r.days ?? []),
  };
}
