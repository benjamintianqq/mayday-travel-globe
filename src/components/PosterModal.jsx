import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { QRCodeSVG } from 'qrcode.react';
import './PosterModal.css';

// 根据地区给海报一个色调 accent
const REGION_ACCENT = {
  '东南亚':   '#f59e0b',
  '东亚':     '#ef4444',
  '西欧':     '#3b82f6',
  '南欧':     '#f97316',
  '中欧':     '#6366f1',
  '东欧':     '#8b5cf6',
  '北欧':     '#0ea5e9',
  '北美':     '#22c55e',
  '南美':     '#10b981',
  '大洋洲':   '#14b8a6',
  '中东':     '#eab308',
  '南亚':     '#f97316',
  '北非':     '#f59e0b',
  '东非':     '#22c55e',
  '南非':     '#10b981',
  '中亚':     '#8b5cf6',
  '高加索':   '#6366f1',
  '港澳台':   '#ef4444',
  '西亚/南欧':'#3b82f6',
};

function getAccent(region) {
  for (const [key, color] of Object.entries(REGION_ACCENT)) {
    if (region?.includes(key)) return color;
  }
  return '#3b82f6';
}

export default function PosterModal({ country, days, style, budget, duration, itinerary, onClose }) {
  const posterRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  const accent = getAccent(country.region);

  const shareUrl = (() => {
    const params = new URLSearchParams({
      share: '1',
      country: country.nameEN,
      days: String(days),
      style,
      budget,
      dur: duration || '3-6天',
    });
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  })();

  const dayHighlights = itinerary?.days?.slice(0, Math.min(days, 4)) ?? [];

  const handleDownload = async () => {
    if (!posterRef.current || downloading) return;
    setDownloading(true);
    try {
      // 截两次：第一次预热字体和图像，第二次是干净的结果
      await toPng(posterRef.current, { pixelRatio: 3 });
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.download = `${country.nameCN}-五一行程海报.png`;
      link.href = dataUrl;
      link.click();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      alert('海报生成失败，请重试');
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="pm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-wrapper">

        {/* ── 海报主体（此区域会被截图） ── */}
        <div className="pm-poster" ref={posterRef}>

          {/* 顶部 accent 条 */}
          <div className="pm-accent-bar" style={{ background: accent }} />

          {/* header */}
          <div className="pm-header">
            <span className="pm-brand">五一出境去哪玩</span>
            <span className="pm-region" style={{ color: accent }}>{country.region}</span>
          </div>

          {/* 目的地 hero */}
          <div className="pm-hero">
            <div className="pm-name-en">{country.nameEN}</div>
            <div className="pm-name-cn">{country.nameCN}</div>
            <div className="pm-tags">
              {country.tags.slice(0, 3).map(t => (
                <span key={t} className="pm-tag" style={{ borderColor: `${accent}44`, color: accent }}>{t}</span>
              ))}
            </div>
          </div>

          <div className="pm-rule" />

          {/* 行程参数 */}
          <div className="pm-params">
            <div className="pm-param-item">
              <span className="pm-param-num" style={{ color: accent }}>{days}</span>
              <span className="pm-param-unit">天</span>
            </div>
            <div className="pm-param-dot" />
            <div className="pm-param-item">
              <span className="pm-param-text">{style}</span>
            </div>
            <div className="pm-param-dot" />
            <div className="pm-param-item">
              <span className="pm-param-text">{budget}</span>
            </div>
          </div>

          {/* 行程标题 */}
          {itinerary?.title && (
            <div className="pm-itinerary-title">「{itinerary.title}」</div>
          )}

          <div className="pm-rule" />

          {/* 每日主题 + 具体地点 */}
          {dayHighlights.length > 0 && (
            <div className="pm-days">
              {dayHighlights.map((d, i) => {
                const places = (d.activities ?? [])
                  .filter(a => a.category !== 'HOTEL')
                  .map(a => a.name);
                return (
                  <div key={i} className="pm-day-block">
                    <div className="pm-day-header">
                      <span className="pm-day-label" style={{ color: accent }}>Day {d.day}</span>
                      <span className="pm-day-title">{d.title}</span>
                    </div>
                    {places.length > 0 && (
                      <div className="pm-day-places">
                        {places.map((p, j) => (
                          <span key={j} className="pm-place">
                            {j > 0 && <span className="pm-place-sep">→</span>}
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="pm-rule" />

          {/* 底部二维码 */}
          <div className="pm-footer">
            <div className="pm-qr-box">
              <QRCodeSVG
                value={shareUrl}
                size={72}
                fgColor="#09090b"
                bgColor="#ffffff"
                level="M"
              />
            </div>
            <div className="pm-qr-copy">
              <div className="pm-qr-headline">扫码生成你的专属行程</div>
              <div className="pm-qr-sub">选目的地 · 定风格 · AI规划</div>
              <div className="pm-qr-url">travel-globe-iota.vercel.app</div>
            </div>
          </div>

        </div>
        {/* ── 海报主体结束 ── */}

        {/* 操作按钮（不进入截图） */}
        <div className="pm-actions">
          <button
            className={`pm-btn-download ${done ? 'done' : ''}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? '生成中…' : done ? '✓ 已保存' : '↓ 保存海报'}
          </button>
          <button className="pm-btn-close" onClick={onClose}>关闭</button>
        </div>

      </div>
    </div>
  );
}
