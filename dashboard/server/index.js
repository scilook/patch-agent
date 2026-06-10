import express from 'express';
import fs from 'fs/promises';
import { spawn } from 'child_process';
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

async function loadDotEnv(envPath) {
  try {
    const content = await fs.readFile(envPath, 'utf-8');
    content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        // prefer explicit process.env values, but allow override if not set
        if (!process.env[key]) {
          process.env[key] = val;
        }
      });
  } catch (_) {
    // ignore missing .env
  }
}

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
  // load .env candidates early so process.env may contain NVD key
  await loadDotEnv(path.resolve(projectRoot, '.env'));
  await loadDotEnv(path.resolve(defaultDataRoot, '.env'));
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
<<<<<<< HEAD
    auditLogPath: path.resolve(fileConfig.auditLogPath || fileConfig.audit_log || finalAuditPath),
    scanPath: path.resolve(fileConfig.scanPath || fileConfig.scan_output || finalScanPath),
    reportPath: path.resolve(fileConfig.reportPath || fileConfig.report_output || finalReportPath),
=======
    auditLogPath: path.resolve(fileConfig.auditLogPath || resolvedDefaults.auditLogPath),
    scanPath: path.resolve(fileConfig.scanPath || resolvedDefaults.scanPath),
    reportPath: path.resolve(fileConfig.reportPath || resolvedDefaults.reportPath),
    nvdApiKey: process.env.NVD_API_KEY || fileConfig.nvd_api_key || null,
>>>>>>> 3e611a99100f8ddebe402755e25a1da6dd5e2857
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

async function execCommand(command, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += String(c)));
    child.stderr.on('data', (c) => (stderr += String(c)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: 1, stdout: '', stderr: String(err) }));
  });
}

async function writeAudit(event, details = {}) {
  try {
    const entry = { timestamp: new Date().toISOString(), event, details };
    await fs.mkdir(path.dirname(runtimeConfig.auditLogPath), { recursive: true });
    await fs.appendFile(runtimeConfig.auditLogPath, JSON.stringify(entry) + '\n');
  } catch (err) {
    // ignore audit failures
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
  app.use(express.json());

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

  // Settings endpoints: read/write runtime config including optional NVD API key
  app.get('/api/settings', async (_, response) => {
    const candidatePath = runtimeConfig.configPath && (await fileExists(runtimeConfig.configPath)) ? runtimeConfig.configPath : path.join(runtimeConfig.dataRoot, 'config.json');
    const fileConfig = (await readJsonFile(candidatePath)) || {};

    const envKey = process.env.NVD_API_KEY || null;
    const maskedFileConfig = Object.assign({}, fileConfig);
    if (maskedFileConfig.nvd_api_key) maskedFileConfig.nvd_api_key = '*****';

    response.json({
      ok: true,
      configPath: candidatePath,
      fileConfig: maskedFileConfig,
      envKeyPresent: !!envKey,
      nvdApiKeySource: envKey ? 'env' : fileConfig.nvd_api_key ? 'file' : null,
    });
  });

  app.post('/api/settings/nvd-key', async (req, response) => {
    // Write API key into project root .env to share with other tooling
    const apiKey = req.body?.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
      return response.status(400).json({ ok: false, error: 'apiKey is required in request body' });
    }

    const dotenvPath = path.join(projectRoot, '.env');
    try {
      // Read existing .env (if any) and replace or append NVD_API_KEY
      let content = '';
      try {
        content = await fs.readFile(dotenvPath, 'utf-8');
      } catch (_) {
        content = '';
      }

      const lines = content.split('\n').filter(Boolean);
      const filtered = lines.filter((l) => !/^\s*NVD_API_KEY\s*=/.test(l));
      filtered.push(`NVD_API_KEY=${apiKey}`);
      await fs.writeFile(dotenvPath, filtered.join('\n') + '\n', { mode: 0o600 });
      // also set in current process for immediate use
      process.env.NVD_API_KEY = apiKey;
      response.json({ ok: true, dotenvPath });
    } catch (err) {
      response.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Package management API
  const validPkgName = (name) => typeof name === 'string' && /^[A-Za-z0-9+:.@_\-]+$/.test(name);

  app.get('/api/packages', async (_, response) => {
    // list installed packages via dpkg-query
    const res = await execCommand('dpkg-query', ['-W', '-f=${Package}\t${Version}\n']);
    if (res.code !== 0) {
      return response.status(500).json({ ok: false, error: res.stderr || 'dpkg-query failed' });
    }
    const lines = res.stdout.trim().split('\n').filter(Boolean);
    const packages = lines.map((ln) => {
      const [pkg, ver] = ln.split('\t');
      return { package: pkg, version: ver };
    });
    response.json({ ok: true, packages });
  });

  app.get('/api/package/:name', async (req, response) => {
    const name = req.params.name;
    if (!validPkgName(name)) return response.status(400).json({ ok: false, error: 'invalid package name' });
    const res = await execCommand('apt-cache', ['policy', name]);
    response.json({ ok: true, raw: res.stdout, code: res.code, stderr: res.stderr });
  });

  app.post('/api/packages/install', async (req, response) => {
    const name = req.body?.name;
    if (!validPkgName(name)) return response.status(400).json({ ok: false, error: 'invalid package name' });
    await writeAudit('install_requested', { package: name });
    const res = await execCommand('apt-get', ['update']);
    const inst = await execCommand('apt-get', ['install', '-y', '--no-install-recommends', name]);
    await writeAudit('install_result', { package: name, code: inst.code, stderr: inst.stderr });
    response.json({ ok: inst.code === 0, code: inst.code, stdout: inst.stdout, stderr: inst.stderr });
  });

  app.post('/api/packages/remove', async (req, response) => {
    const name = req.body?.name;
    if (!validPkgName(name)) return response.status(400).json({ ok: false, error: 'invalid package name' });
    await writeAudit('remove_requested', { package: name });
    const res = await execCommand('apt-get', ['remove', '-y', name]);
    await writeAudit('remove_result', { package: name, code: res.code, stderr: res.stderr });
    response.json({ ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr });
  });

  app.post('/api/packages/upgrade', async (req, response) => {
    const name = req.body?.name;
    if (name) {
      if (!validPkgName(name)) return response.status(400).json({ ok: false, error: 'invalid package name' });
      await writeAudit('upgrade_requested', { package: name });
      const res = await execCommand('apt-get', ['install', '-y', '--only-upgrade', name]);
      await writeAudit('upgrade_result', { package: name, code: res.code, stderr: res.stderr });
      return response.json({ ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr });
    }

    await writeAudit('upgrade_all_requested', {});
    const res = await execCommand('apt-get', ['upgrade', '-y']);
    await writeAudit('upgrade_all_result', { code: res.code, stderr: res.stderr });
    response.json({ ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr });
  });

  app.post('/api/packages/update-cache', async (req, response) => {
    await writeAudit('update_cache_requested', {});
    const res = await execCommand('apt-get', ['update']);
    await writeAudit('update_cache_result', { code: res.code, stderr: res.stderr });
    response.json({ ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr });
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