# Digipad

Digipad est une application en ligne pour créer des murs collaboratifs. 

Elle est publiée sous licence GNU GPLv3.
Sauf les fontes Roboto Slab et Material Icons (Apache License Version 2.0) et la fonte HKGrotesk (Sil Open Font Licence 1.1), jsPanel4 - https://github.com/Flyer53/jsPanel4 (MIT), pdf.js - https://github.com/mozilla/pdf.js - (Apache License Version 2.0) et viewer.js - https://github.com/webodf/ViewerJS (Apache License Version 2.0)

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

### Variables d'environnement pour la mise en production (fichier .env à créer à la racine du dossier)
```
DOMAIN (protocole + domaine. ex : https://digipad.app)
HOST (IP publique du serveur de production)
DB_HOST (IP du serveur de base de données Redis)
DB_PWD (mot de passe de la base de données Redis)
SESSION_KEY (clé de session Express Session)
ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
ETHERPAD_API_KEY (clé API Etherpad)
UPLOAD_LIMIT (limite de téléversement des fichiers en Mo)
PAD_LIMIT (nombre maximum de pads par compte utilisateur)
ADMIN_PASSWORD (mot de passe pour accéder à la page d'administration /admin)
```

### Projet Nuxt.js avec serveur Node.js (Express) et base de données Redis


### Démo
https://digipad.app


### Remerciements et crédits
Traduction en italien par Paolo Mauri (https://gitlab.com/maupao)

Traduction en espagnol par Fernando S. Delgado Trujillo (https://gitlab.com/fersdt)

Traduction en croate par Ksenija Lekić (https://gitlab.com/Ksenija66L)


### Soutien
https://opencollective.com/ladigitale

