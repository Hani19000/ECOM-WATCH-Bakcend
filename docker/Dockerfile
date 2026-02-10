FROM node:20-alpine

WORKDIR /usr/src/app

# Copie des fichiers de package
COPY package*.json ./

# installe TOUTES les dépendances pour le moment 
# pour éliminer un manque lié à Sentry
RUN npm install

# Copie du reste du code
COPY . .

# Vérification de sécurité : on liste les fichiers pour être sûr (visible dans les logs de build)
RUN ls -R src/config

EXPOSE 3001

# Utilisation de npm start pour avoir des logs plus clairs en cas d'échec
CMD ["npm", "start"]