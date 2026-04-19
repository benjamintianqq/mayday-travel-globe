export async function parseEditIntent(userMessage, currentParams, country) {
  const response = await fetch('/api/parse-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userMessage, currentParams, country }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`解析超时，请重试（服务器响应异常 ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(data.error || '解析失败，请重试');
  }

  return data;
}
