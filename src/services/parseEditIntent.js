export async function parseEditIntent(userMessage, currentParams, country) {
  const response = await fetch('/api/parse-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userMessage, currentParams, country }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '解析失败，请重试');
  }

  return data;
}
