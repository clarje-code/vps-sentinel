# 🛡️ VPS Sentinel - Service Centralisé de Tests & Monitoring Multi-Applications

`VPS Sentinel` est un conteneur Docker autonome conçu pour être déployé sur votre serveur (ex: Coolify, Docker Compose) afin d'orchestrer les tests post-déploiement et la surveillance périodique de **toutes** vos applications web et API.

---

## 🌟 Fonctionnalités Clés

1. **Fichier de Registre Unique (`apps.json`)** : centralise toutes vos applications (URL, healthcheck, routes critiques, scripts Playwright et k6).
2. **Double Mode de Déclenchement** :
   - **Mode Webhook Post-Déploiement** : endpoint HTTP `POST /webhook/test/:app_id` (sécurisé par Bearer Token) appelable par vos pipelines ou scripts de build dès qu'un conteneur est mis à jour.
   - **Mode Cron Périodique (Monitoring)** : surveillance active toutes les 15 ou 30 minutes de la santé HTTP et des temps de latence de toutes les applications enregistrées.
3. **Moteur Double Niveau** :
   - **Playwright** pour l'intégrité UI (zéro écran blanc, détection des erreurs console JS, formulaires Inertia/Vue, pages 404).
   - **k6** pour la détection immédiate des dégradations de performances (latence p95, temps de réponse sous charge).
4. **Alertes Unifiées Discord & Telegram** : embeds enrichis avec métriques réelles et upload de capture d'écran de l'erreur en cas de régression.

---

## 📁 Structure du Projet

```text
vps-sentinel/
├── Dockerfile                   # Image avec Node.js, Playwright Chromium & k6
├── docker-compose.yml           # Déploiement en un clic sur le VPS
├── apps.json                    # Configuration maîtresse multi-applications
├── package.json                 # Dépendances Express, Playwright, node-cron
├── .env.example                 # Clés API et Webhooks d'alerte
├── src/
│   ├── server.js                # Serveur API Webhook & routage
│   ├── runner.js                # Orchestrateur Playwright + k6 + Healthcheck
│   ├── notifier.js              # Module d'alerte Discord & Telegram
│   └── cron.js                  # Tâche de surveillance planifiée
└── tests/
    └── sokoci-delivery/
        ├── e2e.spec.ts          # Scénarios Playwright E2E SOKOCI Delivery
        └── k6-load.js           # Test de performance k6 SOKOCI Delivery
```

---

## 🚀 Déploiement sur votre VPS (`69.62.110.128`)

### 1. Configuration initiale
```bash
mkdir -p /opt/vps-sentinel
cd /opt/vps-sentinel

# Copiez les fichiers ou décompressez l'archive vps-sentinel.zip
cp .env.example .env
nano .env # Définissez votre API_KEY et vos webhooks Discord/Telegram
```

### 2. Démarrer avec Docker Compose
```bash
docker compose up -d --build
```
Le service est désormais actif et écoute sur le port `3080`.

Vérification :
```bash
curl http://localhost:3080/health
```

---

## 🔗 Déclenchement Post-Déploiement

### Option 1 : Appel Webhook direct depuis un script (Curl / Bash / PHP)
Dans votre script d'orchestration de déploiement Coolify :

```bash
curl -X POST "http://localhost:3080/webhook/test/sokoci-delivery?token=VOTRE_API_KEY"
```

En PHP :
```php
$sentinelUrl = 'http://127.0.0.1:3080/webhook/test/sokoci-delivery?token=VOTRE_API_KEY';
file_get_contents($sentinelUrl, false, stream_context_create([
    'http' => ['method' => 'POST']
]));
```

### Option 2 : Webhook Automatique Coolify
Configurez un Webhook dans Coolify pointant vers :
`http://vps-sentinel:3080/webhook/coolify`
Le service détectera automatiquement l'UUID `pjfnqfkonvxeccglhcdwambp` et lancera la suite dédiée à SOKOCI Delivery.

---

## ➕ Ajouter une Nouvelle Application dans `apps.json`

Pour surveiller un nouveau projet hébergé sur le serveur, il vous suffit d'ajouter un bloc dans `apps.json` sans redémarrer le conteneur :

```json
{
  "id": "mon-autre-app",
  "name": "Mon Autre Application",
  "enabled": true,
  "base_url": "https://mon-autre-app.com",
  "healthcheck": {
    "endpoint": "/health",
    "expected_status": 200,
    "max_latency_ms": 500
  },
  "tests": {
    "playwright_spec": "tests/mon-autre-app/e2e.spec.ts",
    "k6_script": "tests/mon-autre-app/k6-load.js"
  }
}
```
