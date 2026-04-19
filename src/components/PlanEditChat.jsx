import { useState, useRef, useEffect } from 'react';
import { parseEditIntent } from '../services/parseEditIntent';
import './PlanEditChat.css';

function greeting(params) {
  return `当前方案：${params.days} 天 · ${params.style} · ${params.budget}\n\n你想改哪里？随便说，比如"改成 7 天""换成户外冒险""预算提高一档"…`;
}

export default function PlanEditChat({ currentParams, country, onClose, onConfirm }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: greeting(currentParams) },
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const { newParams, reply, changed } = await parseEditIntent(text, currentParams, country);

      const diffs = [];
      if (changed.days)   diffs.push(`出行天数  ${currentParams.days} 天 → ${newParams.days} 天`);
      if (changed.style)  diffs.push(`旅行风格  "${currentParams.style}" → "${newParams.style}"`);
      if (changed.budget) diffs.push(`预算档次  "${currentParams.budget}" → "${newParams.budget}"`);

      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: reply, diffs, newParams },
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: '没太理解你的意思，能换种说法再试试吗？😅', error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // The last assistant message that carries newParams is the pending confirmation
  const confirmMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.newParams);

  return (
    <div className="pec-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pec-dialog">

        {/* Header */}
        <div className="pec-header">
          <div className="pec-header-left">
            <span className="pec-icon">✏️</span>
            <div>
              <div className="pec-title">修改方案</div>
              <div className="pec-sub">{country.nameCN} · {country.nameEN}</div>
            </div>
          </div>
          <button className="pec-close" onClick={onClose}>×</button>
        </div>

        {/* Messages */}
        <div className="pec-messages">
          {messages.map((m, i) => (
            <div key={i} className={`pec-row pec-row-${m.role}`}>
              {m.role === 'assistant' && <div className="pec-avatar">✨</div>}
              <div className={`pec-bubble ${m.error ? 'pec-bubble-error' : ''}`}>
                <p className="pec-bubble-text">{m.text}</p>
                {m.diffs?.length > 0 && (
                  <div className="pec-diffs">
                    {m.diffs.map((d, j) => (
                      <div key={j} className="pec-diff-item">
                        <span className="pec-diff-arrow">→</span> {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="pec-row pec-row-assistant">
              <div className="pec-avatar">✨</div>
              <div className="pec-bubble pec-bubble-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Confirm strip */}
        {confirmMsg && !loading && (
          <div className="pec-confirm">
            <button className="pec-confirm-btn" onClick={() => onConfirm(confirmMsg.newParams)}>
              ✨ 确认，重新生成方案
            </button>
            <button className="pec-confirm-cancel" onClick={() => {
              // Strip the last assistant newParams so user can keep chatting
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.newParams ? { ...m, newParams: undefined, diffs: [] } : m
              ));
            }}>再改改</button>
          </div>
        )}

        {/* Input */}
        <div className="pec-input-row">
          <input
            ref={inputRef}
            className="pec-input"
            placeholder="说说想怎么改…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            disabled={loading}
          />
          <button
            className="pec-send"
            onClick={send}
            disabled={loading || !input.trim()}>
            发送
          </button>
        </div>

      </div>
    </div>
  );
}
