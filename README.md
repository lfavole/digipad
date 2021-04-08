# Digipad

Digipad est une application en ligne pour créer des murs collaboratifs. 

Elle est publiée sous licence GNU GPLv3.
Sauf les fontes Roboto Slab et Material Icons (Apache License Version 2.0) et la fonte HKGrotesk (Sil Open Font Licence 1.1)

### Préparation et installation des dépendances
```
npm install
```

### Lancement du serveur de développement sur localhost:3000
```
npm run dev
```

### Compilation, minification des fichiers et lancement du serveur de production
```
npm run build
npm run start
```

### Avec PM2
```
npm run build
pm2 start
```

### Fichier .env nécessaire à la racine avant compilation avec 7 variables
```
DOMAIN (protocole + domaine. ex : https://digipad.app)
HOST (IP du serveur de production)
DB_HOST (IP du serveur de base de données Redis)
DB_PWD (mot de passe de la base de données Redis)
SESSION_KEY (clé de session Express Session)
ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
ETHERPAD_API_KEY (clé API Etherpad)
```

### Projet Nuxt.js avec serveur Node.js (Express) et base de données Redis


### Démo
https://digipad.app


### THANKS AND CREDITS
Italian translation by Paolo Mauri (https://gitlab.com/maupao)
