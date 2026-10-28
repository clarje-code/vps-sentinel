import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

export class TestRunner {
  constructor(notifier) {
    this.notifier = notifier;
    this.runningApps = new Set();
  }

  /**
   * Attente active que l'endpoint Healthcheck réponde (utile après un déploiement Coolify)
   */
  async waitForHealthcheck(url, maxAttempts = 15, delayMs = 3000) {
    console.log(`[Runner] Attente active de disponibilité sur ${url}...`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.status === 200) {
          console.log(`[Runner] Application disponible (HTTP 200) après ${attempt * (delayMs / 1000)}s.`);
          return true;
        }
      } catch (e) {
        // En attente
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
    return false;
  }

  /**
   * Exécute les tests complets (Playwright + k6) pour une application configurée
   */
  async executeFullAppSuite(app, triggerType = 'POST_DEPLOY') {
    if (this.runningApps.has(app.id)) {
      throw new Error(`Un banc de test est déjà en cours d'exécution pour ${app.name}`);
    }

    this.runningApps.add(app.id);
    const startTime = Date.now();
    let isSuccess = true;
    let detailsSummary = [];
    let failureScreenshot = null;
    let k6Metrics = {};

    try {
      console.log(`\n======================================================`);
      console.log(`🚀 [VPS Sentinel] Démarrage des tests pour : ${app.name} (${app.id})`);
      console.log(`Déclencheur : ${triggerType} | URL : ${app.base_url}`);
      console.log(`======================================================`);

      // Étape 1 : Healthcheck de démarrage
      const healthUrl = `${app.base_url}${app.healthcheck?.endpoint || '/up'}`;
      const isHealthy = await this.waitForHealthcheck(healthUrl);

      if (!isHealthy) {
        isSuccess = false;
        detailsSummary.push(`❌ Échec Healthcheck initial : L'endpoint ${healthUrl} ne répond pas en 200.`);
        await this.notifier.sendReport({
          appName: app.name,
          status: 'FAILED',
          type: triggerType,
          details: detailsSummary.join('\n'),
        });
        return { success: false, summary: detailsSummary };
      }
      detailsSummary.push(`✅ Healthcheck : ${healthUrl} répond en 200 OK.`);

      // Préparation de l'environnement d'exécution
      const envVars = {
        ...process.env,
        APP_URL: app.base_url,
        ...(app.env || {}),
      };

      // Étape 2 : Exécution Playwright
      if (app.tests?.playwright_spec && fs.existsSync(app.tests.playwright_spec)) {
        console.log(`[Playwright] Exécution du fichier ${app.tests.playwright_spec}...`);
        try {
          const pwCmd = `npx playwright test ${app.tests.playwright_spec} --config=playwright.config.ts`;
          const { stdout } = await execAsync(pwCmd, { env: envVars });
          detailsSummary.push(`✅ Playwright E2E : Tous les scénarios fonctionnels ont réussi.`);
        } catch (pwError) {
          isSuccess = false;
          detailsSummary.push(`❌ Playwright E2E : Des scénarios ont échoué.`);
          console.error(`[Playwright Error]`, pwError.stdout || pwError.message);
          
          // Recherche d'une capture d'écran d'échec
          failureScreenshot = this.findLatestScreenshot();
        }
      }

      // Étape 3 : Exécution k6 Performance
      if (app.tests?.k6_script && fs.existsSync(app.tests.k6_script)) {
        console.log(`[k6] Exécution du scénario de charge ${app.tests.k6_script}...`);
        const summaryFile = `reports/k6/${app.id}-summary.json`;
        try {
          const k6Cmd = `k6 run --summary-export=${summaryFile} ${app.tests.k6_script}`;
          await execAsync(k6Cmd, { env: envVars });
          
          if (fs.existsSync(summaryFile)) {
            const k6Data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
            const p95 = Math.round(k6Data.metrics?.http_req_duration?.values?.['p(95)'] || 0);
            k6Metrics.p95Latency = p95;
            detailsSummary.push(`✅ k6 Performance : Latence p95 = ${p95}ms (conforme aux seuils).`);
          } else {
            detailsSummary.push(`✅ k6 Performance : Test complété.`);
          }
        } catch (k6Error) {
          isSuccess = false;
          detailsSummary.push(`⚠️ k6 Performance : Dépassement des seuils de latence ou taux d'erreurs.`);
        }
      }

      // Étape 4 : Envoi de l'alerte
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      detailsSummary.push(`⏱️ Durée totale d'exécution : ${durationSec}s`);

      await this.notifier.sendReport({
        appName: app.name,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        type: triggerType,
        details: detailsSummary.join('\n'),
        screenshotPath: failureScreenshot,
        metrics: k6Metrics
      });

      return { success: isSuccess, summary: detailsSummary, durationSec };

    } finally {
      this.runningApps.delete(app.id);
    }
  }

  findLatestScreenshot() {
    const searchDirs = ['test-results', 'reports/screenshots'];
    let latestFile = null;
    let latestTime = 0;

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir, { recursive: true });
      for (const f of files) {
        if (typeof f === 'string' && f.endsWith('.png')) {
          const fullPath = path.join(dir, f);
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > latestTime) {
            latestTime = stat.mtimeMs;
            latestFile = fullPath;
          }
        }
      }
    }
    return latestFile;
  }
}
