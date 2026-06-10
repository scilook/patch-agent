import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultDataRoot = path.resolve(projectRoot, 'sample-data', 'var');

const defaultPaths = (dataRoot) => ({
  dataRoot,
  auditLogPath: path.join(dataRoot, 'log', 'vuln-patch-agent', 'audit.log'),
  scanPath: path.join(dataRoot, 'log', 'vuln-patch-agent', 'latest_scan.json'),
  reportPath: path.join(dataRoot, 'log', 'vuln-patch-agent', 'latest_report.json'),
});

function readJsonConfig(configPath) {
  if (!configPath) {
    return Promise.resolve({});
  }

  return fs
    .readFile(configPath, 'utf-8')
    .then((content) => JSON.parse(content))
    .catch(() => ({}));
}

async function resolveRuntimeConfig() {
  const envConfigPath = process.env.PATCH_AGENT_FE_CONFIG || '';
  const envDataRoot = process.env.PATCH_AGENT_DATA_ROOT || process.env.PATCH_AGENT_DATA_DIR || '';
  const envPort = process.env.PORT || process.env.PATCH_AGENT_FE_PORT || '';
  const fileConfig = await readJsonConfig(envConfigPath);

  const dataRoot = path.resolve(fileConfig.dataRoot || envDataRoot || defaultDataRoot);
  const resolvedDefaults = defaultPaths(dataRoot);

  const directAuditPath = path.join(dataRoot, 'audit.log');
  const directScanPath = path.join(dataRoot, 'latest_scan.json');
  const directReportPath = path.join(dataRoot, 'latest_report.json');

  const finalAuditPath = (await fileExists(directAuditPath)) ? directAuditPath : resolvedDefaults.auditLogPath;
  const finalScanPath = (await fileExists(directScanPath)) ? directScanPath : resolvedDefaults.scanPath;
  const finalReportPath = (await fileExists(directReportPath)) ? directReportPath : resolvedDefaults.reportPath;

  return {
    port: Number(envPort || fileConfig.port || 4173),
    dataRoot,
    auditLogPath: path.resolve(fileConfig.auditLogPath || fileConfig.audit_log || finalAuditPath),
    scanPath: path.resolve(fileConfig.scanPath || fileConfig.scan_output || finalScanPath),
    reportPath: path.resolve(fileConfig.reportPath || fileConfig.report_output || finalReportPath),
    configPath: envConfigPath || null,
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readAuditLog(filePath, limit = 200) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const entries = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return entries.slice(-limit);
  } catch {
    return [];
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizePackages(scan) {
  const packages = Array.isArray(scan?.packages) ? scan.packages : [];

  return packages
    .map((pkg) => {
      const vulnerabilities = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [];
      const cvssValues = vulnerabilities
        .map((item) => toNumber(item.cvss_score))
        .filter((value) => value !== null);
      const highestCvss = cvssValues.length ? Math.max(...cvssValues) : null;

      return {
        package: pkg.package,
        installedVersion: pkg.installed_version || '-',
        vulnerabilityCount: vulnerabilities.length,
        highestCvss,
        vulnerabilities: vulnerabilities
          .map((item) => ({
            cveId: item.cve_id,
            cvssScore: toNumber(item.cvss_score),
            sourceProduct: item.source_product,
            reasoning: item.reasoning,
          }))
          .sort((left, right) => (right.cvssScore ?? -1) - (left.cvssScore ?? -1)),
      };
    })
    .sort((left, right) => {
      const scoreDelta = (right.highestCvss ?? -1) - (left.highestCvss ?? -1);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.package.localeCompare(right.package);
    });
}

function countAuditEvents(entries) {
  return entries.reduce((accumulator, entry) => {
    const event = entry?.event || 'unknown';
    accumulator[event] = (accumulator[event] || 0) + 1;
    return accumulator;
  }, {});
}

function buildSummary(config, report, scan, auditEntries) {
  const latestScan = report?.latest_scan || scan || null;
  const latestPatch = report?.latest_patch || null;
  const packages = summarizePackages(latestScan);
  const vulnerableFindings = toNumber(latestScan?.vulnerable_findings) ?? 0;
  const vulnerablePackages = toNumber(latestScan?.vulnerable_packages) ?? packages.length;
  const installedPackages = toNumber(latestScan?.total_installed_packages) ?? packages.length;
  const mitigationRate = toNumber(report?.mitigation_success_rate);
  const patchTargets = Array.isArray(latestPatch?.targets) ? latestPatch.targets : [];
  const updateCandidates = patchTargets.length
    ? patchTargets
    : packages.filter((pkg) => pkg.vulnerabilityCount > 0).map((pkg) => pkg.package);

  const auditCounts = countAuditEvents(auditEntries);
  const newestAudit = auditEntries.length ? auditEntries[auditEntries.length - 1] : null;

  return {
    config,
    report,
    scan: latestScan,
    latestPatch,
    packages,
    updateCandidates,
    audit: {
      totalEntries: auditEntries.length,
      entries: auditEntries,
      eventCounts: auditCounts,
      newestEntry: newestAudit,
    },
    metrics: {
      installedPackages,
      vulnerablePackages,
      vulnerableFindings,
      updateCandidateCount: updateCandidates.length,
      mitigationRate,
    },
  };
}

async function main() {
  const runtimeConfig = await resolveRuntimeConfig();
  const app = express();

  app.get('/api/health', (_, response) => {
    response.json({ ok: true });
  });

  app.get('/api/config', async (_, response) => {
    const status = {
      auditLogExists: await fileExists(runtimeConfig.auditLogPath),
      scanExists: await fileExists(runtimeConfig.scanPath),
      reportExists: await fileExists(runtimeConfig.reportPath),
    };

    response.json({
      ok: true,
      runtime: runtimeConfig,
      status,
    });
  });

  app.get('/api/summary', async (_, response) => {
    const [report, scan, auditEntries] = await Promise.all([
      readJsonFile(runtimeConfig.reportPath),
      readJsonFile(runtimeConfig.scanPath),
      readAuditLog(runtimeConfig.auditLogPath, 200),
    ]);

    response.json({
      ok: true,
      ...buildSummary(runtimeConfig, report, scan, auditEntries),
    });
  });

  if (process.env.NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      server: {
        middlewareMode: true,
      },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    const indexPath = path.join(projectRoot, 'index.html');
    app.get('*', async (request, response, next) => {
      try {
        const html = await fs.readFile(indexPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(request.originalUrl, html);
        response.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (error) {
        next(error);
      }
    });
  } else {
    const distPath = path.join(projectRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', async (_, response) => {
      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(runtimeConfig.port, () => {
    console.log(`vuln-patch dashboard listening on http://localhost:${runtimeConfig.port}`);
    console.log(`data root: ${runtimeConfig.dataRoot}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});