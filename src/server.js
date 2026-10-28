import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Notifier } from './notifier.js';
import { TestRunner } from './runner.js';
import { CronMonitor } from './cron.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../apps.json');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3080;
const API_KEY = process.env.API_KEY || 'sokoci_sentinel_secret_key_2026';

const notifier = new Notifier();
const runner = new TestRunner(notifier);
const monitor = new CronMonitor(CONFIG_PATH, notifier);

// Démarrage du moniteur Cron
monitor.start();

/**
 * Middleware d'authentification API
 */
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: 'Accès non autorisé : clé API invalide ou absente.' });
  }
  next();
};

/**
 * 1. Healthcheck du service Sentinel
 */
app.get('/health', (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  res.json({
    status: 'ok',
    service: 'VPS Sentinel',
    uptime: Math.round(process.uptime()),
    apps_registered: config.apps.length,
    timestamp: new Date().toISOString()
  });
});

/**
 * 2. Déclenchement Post-Déploiement ciblé : POST /webhook/test/:app_id
 */
app.post('/webhook/test/:app_id', requireAuth, async (req, res) => {
  const appId = req.params.app_id;
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const targetApp = config.apps.find(a => a.id === appId && a.enabled !== false);

  if (!targetApp) {
    return res.status(404).json({ error: `Application "${appId}" introuvable ou désactivée dans apps.json.` });
  }

  console.log(`[Webhook] Déclenchement manuel post-déploiement reçu pour : ${targetApp.name}`);

  // Exécution asynchrone pour libérer rapidement le webhook de déploiement
  runner.executeFullAppSuite(targetApp, 'POST_DEPLOY').catch(err => {
    console.error(`[Error] Échec critique suite de test pour ${targetApp.name}:`, err);
  });

  res.json({
    message: `Banc de test post-déploiement déclenché avec succès pour ${targetApp.name}.`,
    app: targetApp.id,
    status: 'RUNNING'
  });
});

/**
 * 3. Récepteur Universel Coolify : POST /webhook/coolify
 * Capte automatiquement les événements Coolify et identifie l'app par son UUID
 */
app.post('/webhook/coolify', (req, res) => {
  const payload = req.body || {};
  const coolifyUuid = payload.uuid || payload.application_uuid || req.query.uuid;

  if (!coolifyUuid) {
    return res.status(400).json({ error: 'UUID de déploiement Coolify manquant.' });
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const targetApp = config.apps.find(a => a.coolify?.app_uuid === coolifyUuid && a.enabled !== false);

  if (!targetApp) {
    console.log(`[Coolify Webhook] Aucun app matchée pour l'UUID Coolify : ${coolifyUuid}`);
    return res.status(200).json({ message: 'UUID non surveillé.' });
  }

  console.log(`[Coolify Webhook] Déploiement détecté pour ${targetApp.name} (UUID: ${coolifyUuid})`);
  
  // Lancement du banc de tests
  runner.executeFullAppSuite(targetApp, 'COOLIFY_DEPLOY').catch(err => {
    console.error(`[Error] Erreur post-déploiement Coolify:`, err);
  });

  res.json({
    message: `Test automatique initié pour ${targetApp.name}`,
    app_uuid: coolifyUuid
  });
});

/**
 * 4. Liste des applications enregistrées
 */
app.get('/api/apps', requireAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  res.json(config);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🛡️  [VPS Sentinel] Service central actif sur http://0.0.0.0:${PORT}`);
  console.log(`Webhook endpoint : POST http://<IP_VPS>:${PORT}/webhook/test/:app_id?token=VOTRE_CLE`);
});
