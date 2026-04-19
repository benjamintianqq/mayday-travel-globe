import { useState, useEffect } from 'react';
import { track } from '@vercel/analytics';
import { generateItinerary } from '../services/generateItinerary';
import { calcItineraryCost } from '../data/countries';
import PosterModal from './PosterModal';
import './ItineraryModal.css';

// ① No 美食探索  ② No 经济背包
const STYLES  = ['文化历史深度', '轻松休闲度假', '户外冒险', '综合体验'];
const BUDGETS = ['舒适性价比', '品质中高端', '奢华享受'];

function getDaysOptions(duration) {
  if (duration === '3天以内') return [1, 2, 3];
  if (duration === '3-6天')   return [3, 4, 5, 6];
  if (duration === '6-10天')  return [6, 7, 8, 9, 10];
  if (duration === '10天以上') return [10, 11, 12, 13, 14, 15];
  return [3, 4, 5, 6, 7];
}

function getDefaultDays(duration, options) {
  const mid = options[Math.floor(options.length / 2)];
  return mid;
}

const LOADING_MSGS = [
  '正在研究当地最佳旅游路线…',
  '挑选最值得打卡的景点…',
  '寻找当地最好吃的餐厅…',
  '安排最优步行动线…',
  '为你量身定制专属故事…',
];

const CAT = {
  ATTRACTION: { icon: '🏛', label: '景点',  color: '#60a5fa' },
  DINING:     { icon: '🍽', label: '餐饮',  color: '#fb923c' },
  HOTEL:      { icon: '🏨', label: '住宿',  color: '#a78bfa' },
  EXPERIENCE: { icon: '✨', label: '体验',  color: '#34d399' },
};

function buildMapEmbed(activities, countryEN) {
  const places = activities
    .filter(a => a.category !== 'HOTEL' && a.mapQuery)
    .map(a => encodeURIComponent(a.mapQuery));
  if (!places.length) return null;
  if (places.length === 1)
    return `https://www.google.com/maps?q=${places[0]}&output=embed`;
  const [origin, ...rest] = places;
  const dest  = rest[rest.length - 1];
  const mid   = rest.slice(0, -1);
  const daddr = mid.length ? `${mid.join('+to:')}+to:${dest}` : dest;
  return `https://www.google.com/maps?saddr=${origin}&daddr=${daddr}&dirflg=w&output=embed`;
}

function buildRouteUrl(activities, countryEN) {
  const stops = activities
    .filter(a => a.category !== 'HOTEL' && a.mapQuery)
    .map(a => encodeURIComponent(a.mapQuery));
  if (!stops.length) return '#';
  return `https://www.google.com/maps/dir/${stops.join('/')}`;
}

export default function ItineraryModal({
  country,
  duration,       // from main filter, drives days options
  onClose,
  onSave,         // (params, itinerary) => void
  onEdit,         // () => void — open chat editor
  initialData,    // { params, itinerary } for saved plan view
  autoGenerate,   // true = skip form, generate right away with initialData.params
}) {
  const daysOptions = getDaysOptions(duration);

  const initParams = initialData?.params ?? {};
  const [phase,    setPhase]   = useState(initialData?.itinerary ? 'done' : 'form');
  const [days,     setDays]    = useState(initParams.days  ?? getDefaultDays(duration, daysOptions));
  const [style,    setStyle]   = useState(initParams.style ?? '综合体验');
  const [budget,   setBudget]  = useState(initParams.budget ?? '舒适性价比');
  const [itinerary, setItinerary] = useState(initialData?.itinerary ?? null);
  const [activeDay, setActiveDay] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0]);
  const [error,    setError]   = useState(null);
  const [saved,      setSaved]     = useState(!!initialData?.itinerary);
  const [showPoster, setShowPoster] = useState(false);

  // Cycle loading text
  useEffect(() => {
    if (phase !== 'generating') return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[i]);
    }, 2400);
    return () => clearInterval(t);
  }, [phase]);

  // Auto-generate on mount if requested
  useEffect(() => {
    if (autoGenerate) handleGenerate();
  }, []); // eslint-disable-line

  const handleGenerate = async () => {
    setPhase('generating');
    setSaved(false);
    setError(null);
    try {
      const data = await generateItinerary({ country, days, style, budget });
      setItinerary(data);
      setActiveDay(0);
      setPhase('done');
      track('itinerary_generated', { country: country.nameEN, days, style, budget });
    } catch (e) {
      setError(e.message);
      setPhase('form');
    }
  };

  const handleSave = () => {
    if (!itinerary) return;
    onSave?.({ days, style, budget }, itinerary);
    setSaved(true);
  };


  const dayPlan  = itinerary?.days?.[activeDay];
  const mapEmbed = dayPlan ? buildMapEmbed(dayPlan.activities, country.nameEN) : null;
  const routeUrl = dayPlan ? buildRouteUrl(dayPlan.activities, country.nameEN) : '#';

  return (
    <>
    <div className="it-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="it-modal">

        {/* Header */}
        <div className="it-header">
          <div className="it-header-left">
            {phase === 'done'
              ? <button className="it-back" onClick={() => { setPhase('form'); setSaved(false); }}>← 重新规划</button>
              : <button className="it-back" onClick={onClose}>← 返回</button>
            }
            <div>
              <div className="it-dest">{country.nameCN} · {country.nameEN}</div>
              <div className="it-headline">
                {phase === 'done' && itinerary ? itinerary.title : '生成你的专属旅游规划'}
              </div>
            </div>
          </div>
          <div className="it-header-right">
            {phase === 'done' && (
              <>
                {onEdit && (
                  <button className="it-edit-btn" onClick={() => onEdit({ days, style, budget })}>✏️ 修改方案</button>
                )}
                <button className="it-poster-btn" onClick={() => setShowPoster(true)}>🖼 生成海报</button>
                <button className={`it-save-btn ${saved ? 'saved' : ''}`} onClick={handleSave}>
                  {saved ? '✅ 已保存' : '💾 保存方案'}
                </button>
              </>
            )}
            <button className="it-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Body */}
        <div className="it-body">

          {/* FORM */}
          {phase === 'form' && (
            <div className="it-form-scroll">
              <div className="it-form">

                <div className="it-dest-card">
                  <div className="it-dest-region">{country.region}</div>
                  <div className="it-dest-name">{country.nameCN}</div>
                  <div className="it-dest-tags">
                    {country.tags.map(t => <span key={t} className="it-tag">{t}</span>)}
                  </div>
                  <p className="it-dest-desc">{country.desc}</p>
                </div>

                <div className="it-field">
                  <div className="it-field-label">出行天数</div>
                  <div className="it-chips">
                    {daysOptions.map(d => (
                      <button key={d}
                        className={`it-chip ${days === d ? 'active' : ''}`}
                        onClick={() => setDays(d)}>
                        {d} 天
                      </button>
                    ))}
                  </div>
                </div>

                <div className="it-field">
                  <div className="it-field-label">旅行风格</div>
                  <div className="it-chips">
                    {STYLES.map(s => (
                      <button key={s}
                        className={`it-chip ${style === s ? 'active' : ''}`}
                        onClick={() => setStyle(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="it-field">
                  <div className="it-field-label">预算档次</div>
                  <div className="it-chips">
                    {BUDGETS.map(b => (
                      <button key={b}
                        className={`it-chip ${budget === b ? 'active' : ''}`}
                        onClick={() => setBudget(b)}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const cost = calcItineraryCost(country, days, budget);
                  return (
                    <div className="it-cost-estimate">
                      参考总费用：¥{cost.low.toLocaleString()}–¥{cost.high.toLocaleString()}
                      <span className="it-cost-note">（含直飞+酒店+日常）</span>
                    </div>
                  );
                })()}

                {error && <div className="it-error">⚠️ {error}，请重试</div>}

                <button className="it-gen-btn" onClick={handleGenerate}>
                  ✨ 生成专属 {days} 天行程
                </button>
              </div>
            </div>
          )}

          {/* GENERATING */}
          {phase === 'generating' && (
            <div className="it-loading">
              <div className="it-loading-icon">🌍</div>
              <div className="it-spinner" />
              <div className="it-loading-msg" key={loadingMsg}>{loadingMsg}</div>
              <div className="it-loading-sub">
                {country.nameCN} · {days}天 · {style} · {budget}
              </div>
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && itinerary && (
            <div className="it-result">
              <div className="it-summary">{itinerary.summary}</div>

              <div className="it-tabs">
                {itinerary.days.map((d, i) => (
                  <button key={i}
                    className={`it-tab ${activeDay === i ? 'active' : ''}`}
                    onClick={() => setActiveDay(i)}>
                    <span className="it-tab-num">Day {d.day}</span>
                    <span className="it-tab-name">{d.title}</span>
                  </button>
                ))}
              </div>

              <div className="it-content">
                {/* Activity list */}
                <div className="it-activities">
                  {dayPlan?.description && (
                    <div className="it-day-summary">{dayPlan.description}</div>
                  )}
                  {dayPlan?.activities.map((act, i) => {
                    const cfg = CAT[act.category] || CAT.ATTRACTION;
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.mapQuery)}`;
                    // Attraction: GetYourGuide (global, reliable)
                    const gygUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(act.name + ' ' + country.nameEN)}`;
                    // Hotel: Booking.com
                    const bookingUrl = `https://www.booking.com/search.html?ss=${encodeURIComponent(act.name + ' ' + country.nameEN)}`;

                    return (
                      <div key={i} className="it-card">
                        <div className="it-card-time">{act.time}</div>
                        <div className="it-card-body">
                          <div className="it-card-top">
                            <span className="it-badge"
                              style={{ background: `${cfg.color}22`, color: cfg.color }}>
                              {cfg.icon} {cfg.label}
                            </span>
                            {act.pricePerPerson && (
                              <span className="it-price">{act.pricePerPerson}</span>
                            )}
                          </div>
                          <div className="it-card-name">
                            {act.name}
                            {act.nameEn && <span className="it-card-name-en"> · {act.nameEn}</span>}
                          </div>
                          <p className="it-card-insight">{act.insight}</p>
                          {act.bookingTip && (
                            <div className="it-tip">💡 {act.bookingTip}</div>
                          )}
                          <div className="it-card-actions">
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                              className="it-btn it-btn-map">📍 地图</a>

                            {act.category === 'DINING' && (
                              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                className="it-btn it-btn-book">🍽 预订</a>
                            )}
                            {act.category === 'ATTRACTION' && (
                              <a href={gygUrl} target="_blank" rel="noopener noreferrer"
                                className="it-btn it-btn-ctrip">🎫 查门票</a>
                            )}
                            {act.category === 'HOTEL' && (
                              <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
                                className="it-btn it-btn-book">🏨 Booking</a>
                            )}
                            {act.category === 'EXPERIENCE' && (
                              <a href={gygUrl} target="_blank" rel="noopener noreferrer"
                                className="it-btn it-btn-ctrip">✨ 预订体验</a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Map panel */}
                <div className="it-map">
                  <div className="it-map-label">
                    Day {dayPlan?.day} · {dayPlan?.title} · 今日路线
                  </div>
                  {mapEmbed ? (
                    <iframe key={activeDay} src={mapEmbed}
                      className="it-map-frame" allowFullScreen loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade" title="today route" />
                  ) : (
                    <div className="it-map-placeholder">地图加载中…</div>
                  )}
                  <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                    className="it-map-link">
                    在 Google Maps 中查看完整路线 →
                  </a>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>

    {showPoster && (
      <PosterModal
        country={country}
        days={days}
        style={style}
        budget={budget}
        duration={duration}
        itinerary={itinerary}
        onClose={() => setShowPoster(false)}
      />
    )}
    </>
  );
}
