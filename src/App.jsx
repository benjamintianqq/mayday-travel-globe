import { useState, useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import * as topojson from 'topojson-client';
import worldData from 'world-atlas/countries-110m.json';
import { countries, filterCountries, calcCostRange, DAYS_MAP } from './data/countries';
import ItineraryModal from './components/ItineraryModal';
import PlanEditChat from './components/PlanEditChat';
import './App.css';

const STORAGE_KEY = 'travel_saved_plans';

function loadSavedPlans() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function savePlansToStorage(plans) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); } catch {}
}

const TRAVEL_TYPES = ['绝美自然风光', 'City walk', '文化历史', '购物', '海岛躺平', '户外运动', '美食中心'];
const VISA_TYPES = ['免签', '需要办签证', '落地签/电子签'];
const DURATIONS = ['3天以内', '3-6天', '6-10天', '10天以上'];
const BUDGETS = ['5000以内', '10000以内', '20000以内', '30000以内', '预算无上限'];

function fmt(n) {
  return `¥${n.toLocaleString()}`;
}

// Build polygon lookup by ISO numeric ID from bundled topojson
const geoFeatures = topojson.feature(worldData, worldData.objects.countries).features;
const geoLookup = {};
geoFeatures.forEach(f => { geoLookup[Number(f.id)] = f; });

export default function App() {
  const globeRef = useRef(null);
  const globeInstanceRef = useRef(null);

  const [travelTypes, setTravelTypes] = useState([]);
  const [visaTypes, setVisaTypes] = useState([]);
  const [duration, setDuration] = useState(null);
  const [budget, setBudget] = useState(null);
  const [matched, setMatched] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hasFiltered, setHasFiltered] = useState(false);
  const [showItinerary, setShowItinerary] = useState(false);
  const [itineraryMode, setItineraryMode] = useState('form'); // 'form' | 'view' | 'regen'
  const [savedPlans, setSavedPlans] = useState(loadSavedPlans); // { [nameCN]: {params, itinerary} }
  const [showEditChat, setShowEditChat]   = useState(false);
  const [editChatParams, setEditChatParams] = useState(null); // params to edit (saved or current)
  const [regenParams, setRegenParams]     = useState(null); // params confirmed via chat

  const toggleMulti = (val, setState) => {
    setState(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  // Recompute matched on filter change
  useEffect(() => {
    const anyFilter = travelTypes.length > 0 || visaTypes.length > 0 || duration || budget;
    if (!anyFilter) { setMatched([]); setHasFiltered(false); return; }
    setHasFiltered(true);
    setMatched(filterCountries({ travelTypes, visaTypes, duration, budget }));
  }, [travelTypes, visaTypes, duration, budget]);

  // Init Globe once
  useEffect(() => {
    if (!globeRef.current) return;

    const globe = Globe()(globeRef.current);
    globeInstanceRef.current = globe;

    globe
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .width(globeRef.current.clientWidth)
      .height(globeRef.current.clientHeight)
      .showAtmosphere(true)
      .atmosphereColor('#4fc3f7')
      .atmosphereAltitude(0.15);

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.5;
    globe.controls().enableZoom = true;

    // Polygon layer config (data set later)
    globe
      .polygonCapColor(() => 'rgba(255, 160, 40, 0.28)')
      .polygonSideColor(() => 'rgba(255, 160, 40, 0.12)')
      .polygonStrokeColor(() => 'rgba(255, 180, 60, 0.95)')
      .polygonAltitude(0.006);

    const handleResize = () => {
      if (globeRef.current) {
        globe.width(globeRef.current.clientWidth).height(globeRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Control rotation based on selection
  useEffect(() => {
    const globe = globeInstanceRef.current;
    if (!globe) return;
    globe.controls().autoRotate = !selected;
  }, [selected]);

  // Update dots
  useEffect(() => {
    const globe = globeInstanceRef.current;
    if (!globe) return;
    const displayCountries = hasFiltered ? matched : countries;

    globe
      .pointsData(displayCountries)
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(d => selected?.nameCN === d.nameCN ? 0.05 : 0.01)
      .pointRadius(d => selected?.nameCN === d.nameCN ? 0.7 : 0.45)
      .pointColor(d => {
        if (selected?.nameCN === d.nameCN) return '#ff6b35';
        if (!hasFiltered) return 'rgba(100,220,255,0.85)';
        return 'rgba(255,200,50,0.95)';
      })
      .pointLabel(d => `
        <div style="background:rgba(10,10,20,0.88);color:white;padding:8px 14px;border-radius:10px;font-family:-apple-system,sans-serif;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1)">
          <b style="font-size:14px">${d.nameCN}</b> <span style="color:#aaa;font-size:12px">${d.nameEN}</span><br/>
          <span style="color:#64b5f6;font-size:11px">${d.region}</span>
        </div>
      `)
      .onPointClick(d => selectCountry(d));
  }, [matched, hasFiltered, selected]);

  // Update polygon highlight
  useEffect(() => {
    const globe = globeInstanceRef.current;
    if (!globe) return;
    if (selected?.isoNum && geoLookup[selected.isoNum]) {
      globe.polygonsData([geoLookup[selected.isoNum]]);
    } else {
      globe.polygonsData([]);
    }
  }, [selected]);

  const selectCountry = (c) => {
    const isDeselect = selected?.nameCN === c.nameCN;
    setSelected(isDeselect ? null : c);
    const globe = globeInstanceRef.current;
    if (globe && !isDeselect) {
      globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 1.4 }, 1200);
    }
  };

  const clearAll = () => {
    setTravelTypes([]); setVisaTypes([]); setDuration(null); setBudget(null); setSelected(null);
  };

  const handleSavePlan = (country, params, itinerary) => {
    const next = { ...savedPlans, [country.nameCN]: { params, itinerary } };
    setSavedPlans(next);
    savePlansToStorage(next);
  };

  const handleDeletePlan = (nameCN) => {
    const next = { ...savedPlans };
    delete next[nameCN];
    setSavedPlans(next);
    savePlansToStorage(next);
  };

  const budgetRange = selected && duration ? calcCostRange(selected, duration) : null;
  const savedPlan = selected ? savedPlans[selected.nameCN] : null;

  return (
    <div className="app">
      <div className="globe-container" ref={globeRef} />

      {/* Left Panel — light glassmorphism */}
      <div className="panel">
        <div className="panel-header">
          <div className="logo-icon">🌏</div>
          <h1 className="app-title">五一出境去哪玩</h1>
        </div>

        <div className="filters">
          <div className="section">
            <div className="section-label">
              <span className="section-num">①</span> 期望中的旅行是
              <span className="section-hint">可多选</span>
            </div>
            <div className="chips">
              {TRAVEL_TYPES.map(t => (
                <button key={t} className={`chip ${travelTypes.includes(t) ? 'active' : ''}`}
                  onClick={() => toggleMulti(t, setTravelTypes)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">
              <span className="section-num">②</span> 签证要求
              <span className="section-hint">可多选</span>
            </div>
            <div className="chips">
              {VISA_TYPES.map(v => (
                <button key={v} className={`chip ${visaTypes.includes(v) ? 'active' : ''}`}
                  onClick={() => toggleMulti(v, setVisaTypes)}>{v}</button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">
              <span className="section-num">③</span> 准备玩几天
              <span className="section-hint">单选</span>
            </div>
            <div className="chips">
              {DURATIONS.map(d => (
                <button key={d} className={`chip ${duration === d ? 'active' : ''}`}
                  onClick={() => setDuration(prev => prev === d ? null : d)}>{d}</button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">
              <span className="section-num">④</span> 人均预算
              <span className="section-hint">单选</span>
            </div>
            <div className="chips">
              {BUDGETS.map(b => (
                <button key={b} className={`chip ${budget === b ? 'active' : ''}`}
                  onClick={() => setBudget(prev => prev === b ? null : b)}>{b}</button>
              ))}
            </div>
          </div>
        </div>

        {hasFiltered ? (
          <div className="results-section">
            <div className="results-header">
              <span className="results-count">
                <span className="count-num">{matched.length}</span> 个目的地匹配
              </span>
              <button className="clear-btn" onClick={clearAll}>清除筛选</button>
            </div>
            <div className="results-list">
              {matched.length === 0
                ? <div className="no-results">暂无匹配，调整筛选条件试试 🔍</div>
                : matched.map(c => {
                  const range = duration ? calcCostRange(c, duration) : null;
                  return (
                    <div key={c.nameCN}
                      className={`result-item ${selected?.nameCN === c.nameCN ? 'selected' : ''}`}
                      onClick={() => selectCountry(c)}>
                      <div className="result-main">
                        <div className="result-name">
                          <span className="cn">{c.nameCN}</span>
                          <span className="en">{c.nameEN}</span>
                        </div>
                        {range && <div className="result-cost">{fmt(range.min)}+</div>}
                      </div>
                      <div className="result-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}
                        <span className={`visa-dot ${c.visa[0] === '免签' ? 'free' : c.visa[0] === '落地签/电子签' ? 'evisa' : 'visa'}`}>
                          {c.visa[0]}
                        </span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        ) : (
          <div className="hint-box">
            <div className="hint-icon">✈️</div>
            <p>选择你的旅行偏好<br/>地球上的目的地会为你高亮</p>
          </div>
        )}
      </div>

      {/* Detail Card */}
      {selected && (
        <div className="detail-card">
          <button className="close-btn" onClick={() => setSelected(null)}>×</button>
          <div className="detail-region">{selected.region}</div>
          <h2 className="detail-name">
            {selected.nameCN}
            <span className="detail-name-en">{selected.nameEN}</span>
          </h2>
          <p className="detail-desc">{selected.desc}</p>

          <div className="detail-row">
            <div className="detail-block">
              <div className="detail-label">旅行标签</div>
              <div className="detail-tags">
                {selected.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
            <div className="detail-block">
              <div className="detail-label">签证</div>
              <span className={`visa-badge ${selected.visa[0] === '免签' ? 'free' : selected.visa[0] === '落地签/电子签' ? 'evisa' : 'visa'}`}>
                {selected.visa[0]}
              </span>
            </div>
          </div>

          <div className="detail-block">
            <div className="detail-label">必去 Top 3</div>
            <div className="spots">
              {selected.top3.map((s, i) => (
                <div key={i} className="spot"><span className="spot-num">{i + 1}</span>{s}</div>
              ))}
            </div>
          </div>

          {budgetRange ? (
            <div className="cost-card">
              <div className="detail-label">预估总费用（{duration}）</div>
              <div className="cost-range">
                <span className="cost-min">{fmt(budgetRange.min)}</span>
                <span className="cost-arrow">→</span>
                <span className="cost-max">{fmt(budgetRange.max)}</span>
              </div>
              <div className="cost-note">经济出行 → 豪华出行</div>
            </div>
          ) : (
            <div className="cost-hint">← 选择出行天数查看费用估算</div>
          )}

          <div className="price-grid">
            <div className="price-item">
              <span>机票往返</span>
              <span>{fmt(selected.flightTransfer)} – {fmt(selected.flightDirect)}</span>
            </div>
            <div className="price-item">
              <span>酒店/晚</span>
              <span>{fmt(selected.hotel3star)} – {fmt(selected.hotel5star)}</span>
            </div>
            <div className="price-item">
              <span>餐饮景点等/天</span>
              <span>{fmt(selected.dailyBudget)} – {fmt(selected.dailyLuxury)}</span>
            </div>
          </div>

          {savedPlan ? (
            <div className="saved-plan">
              <div className="saved-plan-header">
                <span className="saved-plan-label">✅ 已保存方案</span>
                <span className="saved-plan-meta">{savedPlan.params.days}天 · {savedPlan.params.style} · {savedPlan.params.budget}</span>
                <button className="saved-plan-delete" onClick={() => handleDeletePlan(selected.nameCN)}>删除</button>
              </div>
              <div className="saved-plan-title">{savedPlan.itinerary.title}</div>
              <div className="saved-plan-actions">
                <button className="view-plan-btn" onClick={() => {
                  setItineraryMode('view');
                  setShowItinerary(true);
                }}>📋 查看方案</button>
                <button className="edit-plan-btn" onClick={() => {
                  setEditChatParams(savedPlan.params);
                  setShowEditChat(true);
                }}>
                  ✏️ 修改方案
                </button>
              </div>
            </div>
          ) : (
            <button className="plan-btn" onClick={() => {
              setItineraryMode('form');
              setShowItinerary(true);
            }}>
              ✨ 生成你的专属旅游规划
            </button>
          )}
        </div>
      )}

      {showItinerary && selected && (
        <ItineraryModal
          country={selected}
          duration={duration}
          onClose={() => { setShowItinerary(false); setRegenParams(null); setShowEditChat(false); }}
          onSave={(params, itinerary) => handleSavePlan(selected, params, itinerary)}
          onEdit={(currentParams) => {
            setShowItinerary(false);
            setEditChatParams(currentParams);
            setShowEditChat(true);
          }}
          initialData={itineraryMode === 'view' ? savedPlans[selected.nameCN] :
                       itineraryMode === 'regen' && regenParams ? { params: regenParams } : undefined}
          autoGenerate={itineraryMode === 'regen'}
        />
      )}

      {showEditChat && selected && editChatParams && (
        <PlanEditChat
          currentParams={editChatParams}
          country={selected}
          onClose={() => { setShowEditChat(false); setEditChatParams(null); }}
          onConfirm={(newParams) => {
            setShowEditChat(false);
            setEditChatParams(null);
            setRegenParams(newParams);
            setItineraryMode('regen');
            setShowItinerary(true);
          }}
        />
      )}

      <div className="status-bar">
        {!hasFiltered
          ? `展示全部 ${countries.length} 个五一热门出境目的地 · 点击光点探索`
          : `已筛选 ${matched.length} / ${countries.length} 个目的地匹配`}
      </div>
    </div>
  );
}
