export default async function handler(req, res) {
  const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const results = {};

  // 测试 v1beta 和 v1 两个端点
  for (const ver of ['v1beta', 'v1']) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/${ver}/models?key=${API_KEY}&pageSize=50`
      );
      const data = await r.json().catch(() => ({}));
      results[ver] = r.ok
        ? (data.models ?? [])
            .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
            .map(m => m.name)
        : { error: data.error?.message || `HTTP ${r.status}` };
    } catch (e) {
      results[ver] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
