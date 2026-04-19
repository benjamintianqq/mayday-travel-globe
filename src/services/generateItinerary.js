export async function generateItinerary({ country, days, style, budget }) {
  const response = await fetch('/api/itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country, days, style, budget }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    // Empty or non-JSON body — most likely a Vercel timeout (504)
    throw new Error(`生成超时，请重试（服务器响应异常 ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}
