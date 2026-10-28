import cron from 'node-cron';
import fs from 'fs';

export class CronMonitor {
  constructor(configPath, notifier) {
    this.configPath = configPath;
    this.notifier = notifier;
  }

  start() {
    const config = this.loadConfig();
    const interval = config.settings?.cron_interval || '*/15 * * * *';

    console.log(`[Cron Monitor] Tâche planifiée activée avec l'intervalle : "${interval}"`);

    cron.schedule(interval, async () => {
      console.log(`[Cron Monitor] Exécution du contrôle de santé périodique...`);
      await this.runAllChecks();
    });
  }

  loadConfig() {
    return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
  }

  async runAllChecks() {
    const config = this.loadConfig();
    const apps = config.apps.filter(a => a.enabled !== false);

    for (const app of apps) {
      try {
        await this.checkApp(app);
      } catch (err) {
        console.error(`[Cron Monitor] Erreur lors du check de ${app.name}:`, err.message);
      }
    }
  }

  async checkApp(app) {
    const healthEndpoint = app.healthcheck?.endpoint || '/up';
    const targetUrl = `${app.base_url}${healthEndpoint}`;
    const maxLatency = app.healthcheck?.max_latency_ms || 800;

    const start = Date.now();
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(6000) });
      const latency = Date.now() - start;

      if (res.status !== (app.healthcheck?.expected_status || 200)) {
        await this.notifier.sendHealthAlert({
          appName: app.name,
          url: targetUrl,
          error: `Statut HTTP inattendu : ${res.status}`,
          latencyMs: latency
        });
        return;
      }

      if (latency > maxLatency) {
        await this.notifier.sendHealthAlert({
          appName: app.name,
          url: targetUrl,
          error: `Latence anormale : ${latency}ms (seuil configuré: ${maxLatency}ms)`,
          latencyMs: latency
        });
      }
    } catch (e) {
      await this.notifier.sendHealthAlert({
        appName: app.name,
        url: targetUrl,
        error: `Connexion impossible ou timeout : ${e.message}`,
        latencyMs: Date.now() - start
      });
    }
  }
}
