FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Installation de k6, curl, jq et dépendances
RUN apt-get update && apt-get install -y gnupg ca-certificates curl jq bc && \
    gpg -k && \
    gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | tee /etc/apt/sources.list.d/k6.list && \
    apt-get update && apt-get install -y k6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Node.js
COPY package*.json ./
RUN npm install

# Copie du code source
COPY . .

# Création des dossiers de rapports
RUN mkdir -p reports/playwright reports/k6 reports/screenshots

EXPOSE 3080

CMD ["npm", "start"]
