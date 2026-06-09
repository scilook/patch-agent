import { useEffect, useMemo, useState } from 'react';

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SeverityBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="badge badge-muted">n/a</span>;
  }

  const tone = score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
  return <span className={`badge badge-${tone}`}>{score.toFixed(1)}</span>;
}

function StatCard({ label, value, hint }) {
  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </article>
  );
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function AuditRow({ entry }) {
  return (
    <li className="audit-row">
      <div>
        <span className="audit-event">{entry.event}</span>
        <p className="audit-details">{JSON.stringify(entry.details || {}, null, 0)}</p>
      </div>
      <span className="audit-meta">
        {entry.level} · {formatDate(entry.timestamp)}
      </span>
    </li>
  );
}

export default function App() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    summary: null,
    config: null,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [installName, setInstallName] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  async function loadData() {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const [summaryResponse, configResponse] = await Promise.all([
        fetch('/api/summary'),
        fetch('/api/config'),
      ]);

      if (!summaryResponse.ok) {
        throw new Error(`summary request failed: ${summaryResponse.status}`);
      }

      if (!configResponse.ok) {
        throw new Error(`config request failed: ${configResponse.status}`);
      }

      const [summary, config] = await Promise.all([summaryResponse.json(), configResponse.json()]);

      setState({
        loading: false,
        error: null,
        summary,
        config,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error.message,
        summary: null,
        config: null,
      });
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function postJson(path, body) {
    setActionMessage(null);
    setActionLoading(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      setActionLoading(false);
      if (!res.ok) {
        setActionMessage(data.error || `request failed ${res.status}`);
        return { ok: false, data };
      }
      setActionMessage('작업이 완료되었습니다. 목록을 새로고침하세요.');
      return { ok: true, data };
    } catch (err) {
      setActionLoading(false);
      setActionMessage(String(err));
      return { ok: false, data: null };
    }
  }

  async function installPackage(name) {
    if (!name) return setActionMessage('패키지 이름을 입력하세요.');
    const r = await postJson('/api/packages/install', { name });
    if (r.ok) await loadData();
  }

  async function removePackage(name) {
    if (!confirm(`${name} 패키지를 제거하시겠습니까?`)) return;
    const r = await postJson('/api/packages/remove', { name });
    if (r.ok) await loadData();
  }

  async function upgradePackage(name) {
    const body = name ? { name } : {};
    const r = await postJson('/api/packages/upgrade', body);
    if (r.ok) await loadData();
  }

  async function updateCache() {
    const r = await postJson('/api/packages/update-cache', {});
    if (r.ok) await loadData();
  }

  const packageRows = useMemo(() => state.summary?.packages || [], [state.summary]);
  const auditEntries = state.summary?.audit?.entries || [];
  const updateCandidates = state.summary?.updateCandidates || [];
  const metrics = state.summary?.metrics || {};
  const latestPatch = state.summary?.latestPatch || null;
  const report = state.summary?.report || null;
  const config = state.config?.runtime || state.summary?.config || null;
  const status = state.config?.status || {};

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <main className="page">
        <section className="hero panel">
          <div className="hero-copy">
            <span className="eyebrow">local patch intelligence</span>
            <h1>vuln-patch dashboard</h1>
            <p>
              patch-agent가 만든 scan, report, audit 데이터를 읽어서 현재 설치 패키지와 취약점,
              그리고 업데이트 가능 대상을 한 화면에서 보여줍니다.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={loadData} type="button">
                새로고침
              </button>
              <div className="source-pill">
                <span>data root</span>
                <strong>{config?.dataRoot || '-'}</strong>
              </div>
            </div>
          </div>

          <div className="hero-rail">
            <div className="status-card">
              <span>scan</span>
              <strong>{status.scanExists ? 'available' : 'missing'}</strong>
            </div>
            <div className="status-card">
              <span>report</span>
              <strong>{status.reportExists ? 'available' : 'missing'}</strong>
            </div>
            <div className="status-card">
              <span>audit</span>
              <strong>{status.auditLogExists ? 'available' : 'missing'}</strong>
            </div>
            <div className="status-card accent">
              <span>latest patch</span>
              <strong>{latestPatch?.status || 'n/a'}</strong>
            </div>
          </div>
        </section>

        {state.error ? (
          <section className="panel error-panel">
            <strong>데이터 로딩 실패</strong>
            <p>{state.error}</p>
          </section>
        ) : null}

        <section className="metrics-grid">
          <StatCard
            label="설치 패키지"
            value={formatNumber(metrics.installedPackages)}
            hint="scan 결과 기준"
          />
          <StatCard
            label="취약 패키지"
            value={formatNumber(metrics.vulnerablePackages)}
            hint="현재 영향 받은 패키지 수"
          />
          <StatCard
            label="취약점 발견"
            value={formatNumber(metrics.vulnerableFindings)}
            hint="패키지별 CVE 매치 건수"
          />
          <StatCard
            label="완화율"
            value={
              metrics.mitigationRate === null || metrics.mitigationRate === undefined
                ? '-'
                : `${metrics.mitigationRate}%`
            }
            hint="latest report 기준"
          />
        </section>

        <section className="panel">
          <SectionTitle
            eyebrow="package inventory"
            title="현재 패키지와 취약점"
            description="설치된 패키지 버전, 매칭된 CVE, 그리고 위험도 점수를 우선순위로 정렬해 보여줍니다."
          />

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                placeholder="설치할 패키지 이름"
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
                className="input"
                aria-label="install-name"
              />
              <button
                className="primary-button"
                onClick={() => installPackage(installName)}
                disabled={actionLoading}
                type="button"
              >
                설치
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="secondary-button"
                onClick={updateCache}
                disabled={actionLoading}
                type="button"
              >
                패키지 캐시 갱신
              </button>
              <button
                className="secondary-button"
                onClick={() => upgradePackage()}
                disabled={actionLoading}
                type="button"
              >
                전체 업그레이드
              </button>
            </div>

            {actionMessage ? <div className="action-message">{actionMessage}</div> : null}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>패키지</th>
                  <th>버전</th>
                  <th>취약점</th>
                  <th>최대 점수</th>
                  <th>CVE 목록</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {packageRows.length ? (
                  packageRows.map((pkg) => (
                    <tr key={pkg.package}>
                      <td>
                        <strong>{pkg.package}</strong>
                      </td>
                      <td className="mono">{pkg.installedVersion}</td>
                      <td>{formatNumber(pkg.vulnerabilityCount)}</td>
                      <td>
                        <SeverityBadge score={pkg.highestCvss} />
                      </td>
                      <td>
                        <div className="cve-list">
                          {pkg.vulnerabilities.slice(0, 3).map((item) => (
                            <span className="cve-chip" key={item.cveId}>
                              {item.cveId}
                            </span>
                          ))}
                          {pkg.vulnerabilities.length > 3 ? (
                            <span className="cve-chip muted">
                              +{pkg.vulnerabilities.length - 3}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="secondary-button"
                            onClick={() => upgradePackage(pkg.package)}
                            type="button"
                          >
                            업그레이드
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => removePackage(pkg.package)}
                            type="button"
                          >
                            제거
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="empty-state">
                      표시할 패키지 데이터가 없습니다. data root를 확인하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="split-grid">
          <article className="panel">
            <SectionTitle
              eyebrow="update targets"
              title="업데이트 가능 목록"
              description="report에 기록된 patch 대상이 있으면 그대로 사용하고, 없으면 취약 패키지 목록을 대체 후보로 보여줍니다."
            />

            <div className="target-list">
              {updateCandidates.length ? (
                updateCandidates.map((target) => (
                  <div className="target-row" key={target}>
                    <strong>{target}</strong>
                    <span>apt upgrade 후보</span>
                  </div>
                ))
              ) : (
                <div className="empty-state compact">업데이트 후보가 없습니다.</div>
              )}
            </div>
          </article>

          <article className="panel">
            <SectionTitle
              eyebrow="patch report"
              title="최신 패치 요약"
              description="마지막 report.json과 patch 이력을 바탕으로 현재 완화 성과를 보여줍니다."
            />

            <div className="report-stack">
              <div className="report-row">
                <span>생성 시각</span>
                <strong>{formatDate(report?.generated_at)}</strong>
              </div>
              <div className="report-row">
                <span>패치 상태</span>
                <strong>{latestPatch?.status || '-'}</strong>
              </div>
              <div className="report-row">
                <span>대상 패키지</span>
                <strong>{formatNumber(latestPatch?.target_count)}</strong>
              </div>
              <div className="report-row">
                <span>완화된 취약점</span>
                <strong>{formatNumber(latestPatch?.mitigated_findings)}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="panel">
          <SectionTitle
            eyebrow="audit trail"
            title="감사 로그"
            description="audit.log의 JSON Lines를 최근 순으로 읽어 이벤트와 상세 정보를 보여줍니다."
          />

          <div className="audit-meta-grid">
            <div className="report-row">
              <span>총 이벤트</span>
              <strong>{formatNumber(state.summary?.audit?.totalEntries)}</strong>
            </div>
            <div className="report-row">
              <span>가장 최근 이벤트</span>
              <strong>{state.summary?.audit?.newestEntry?.event || '-'}</strong>
            </div>
            <div className="report-row">
              <span>파일 경로</span>
              <strong className="mono">{config?.auditLogPath || '-'}</strong>
            </div>
          </div>

          <ul className="audit-list">
            {auditEntries.length ? (
              auditEntries
                .slice()
                .reverse()
                .map((entry, index) => (
                  <AuditRow entry={entry} key={`${entry.timestamp}-${entry.event}-${index}`} />
                ))
            ) : (
              <li className="empty-state compact">감사 로그가 없습니다.</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
