import fs from 'fs';
import path from 'path';

export class Notifier {
  constructor() {
    this.discordUrl = process.env.DISCORD_WEBHOOK_URL || '';
    this.telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  /**
   * Envoi d'un rapport de test complet (Succès ou Échec)
   */
  async sendReport({ appName, status, type, details, screenshotPath = null, metrics = {} }) {
    const isSuccess = status === 'SUCCESS';
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const title = isSuccess 
      ? `✅ [${appName}] Tests Post-Déploiement Validés`
      : `🚨 [${appName}] Incident / Échec Post-Déploiement`;

    console.log(`[Notifier] Envoi alerte ${appName} (${status})...`);

    // 1. Notification Discord
    if (this.discordUrl) {
      await this.notifyDiscord({ title, isSuccess, appName, type, details, screenshotPath, metrics, timestamp });
    }

    // 2. Notification Telegram
    if (this.telegramToken && this.telegramChatId) {
      await this.notifyTelegram({ title, isSuccess, appName, type, details, screenshotPath, metrics, timestamp });
    }
  }

  /**
   * Envoi d'une alerte lors des vérifications périodiques (Cron)
   */
  async sendHealthAlert({ appName, url, error, latencyMs }) {
    const title = `⚠️ [${appName}] Alerte Disponibilité / Latence`;
    const details = `L'application présente une anomalie lors du contrôle périodique :\n- URL : ${url}\n- Latence : ${latencyMs ? latencyMs + 'ms' : 'N/A'}\n- Erreur : ${error}`;
    
    if (this.discordUrl) {
      await this.notifyDiscord({ title, isSuccess: false, appName, type: 'CRON_HEALTHCHECK', details, timestamp: new Date().toISOString() });
    }
    if (this.telegramToken && this.telegramChatId) {
      await this.notifyTelegram({ title, isSuccess: false, appName, type: 'CRON_HEALTHCHECK', details, timestamp: new Date().toISOString() });
    }
  }

  async notifyDiscord({ title, isSuccess, appName, type, details, screenshotPath, metrics, timestamp }) {
    try {
      const color = isSuccess ? 3066993 : 15158332; // Vert ou Rouge
      const fields = [
        { name: 'Application', value: appName, inline: true },
        { name: 'Déclencheur', value: type, inline: true },
        { name: 'Date (UTC)', value: timestamp, inline: true },
      ];

      if (metrics.p95Latency) {
        fields.push({ name: 'Latence k6 p95', value: `${metrics.p95Latency} ms`, inline: true });
      }

      const embed = {
        title,
        color,
        fields,
        description: details.substring(0, 2000),
        footer: { text: 'VPS Sentinel - Surveillance Centralisée' }
      };

      if (screenshotPath && fs.existsSync(screenshotPath)) {
        embed.image = { url: 'attachment://incident.png' };
        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [embed] }));
        
        const fileBuffer = fs.readFileSync(screenshotPath);
        const blob = new Blob([fileBuffer], { type: 'image/png' });
        formData.append('files[0]', blob, 'incident.png');

        await fetch(this.discordUrl, { method: 'POST', body: formData });
      } else {
        await fetch(this.discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] })
        });
      }
    } catch (err) {
      console.error('[Notifier] Erreur envoi Discord:', err.message);
    }
  }

  async notifyTelegram({ title, isSuccess, appName, type, details, screenshotPath, metrics, timestamp }) {
    try {
      let text = `<b>${title}</b>\n\n` +
                 `<b>Application :</b> ${appName}\n` +
                 `<b>Type :</b> ${type}\n` +
                 `<b>Date :</b> ${timestamp}\n`;
      
      if (metrics.p95Latency) {
        text += `<b>Latence p95 :</b> ${metrics.p95Latency} ms\n`;
      }
      text += `\n<b>Détails :</b>\n<code>${details.substring(0, 1500)}</code>`;

      if (screenshotPath && fs.existsSync(screenshotPath)) {
        const formData = new FormData();
        formData.append('chat_id', this.telegramChatId);
        formData.append('caption', text.substring(0, 1024));
        formData.append('parse_mode', 'HTML');
        
        const fileBuffer = fs.readFileSync(screenshotPath);
        const blob = new Blob([fileBuffer], { type: 'image/png' });
        formData.append('photo', blob, 'screenshot.png');

        await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendPhoto`, {
          method: 'POST',
          body: formData
        });
      } else {
        await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.telegramChatId,
            text,
            parse_mode: 'HTML'
          })
        });
      }
    } catch (err) {
      console.error('[Notifier] Erreur envoi Telegram:', err.message);
    }
  }
}
