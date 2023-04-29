# Digipad

Digipad est une application en ligne pour créer des murs collaboratifs. 

Elle est publiée sous licence GNU AGPLv3.
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
PORT (port du serveur local nuxt.js / 3000 par défaut)
DB_HOST (IP du serveur de base de données Redis)
DB_PWD (mot de passe de la base de données Redis)
DB_PORT (port de la base de données Redis / 6379 par défaut)
SESSION_KEY (clé de session Express Session)
SESSION_DURATION (durée de la session de connexion des utilisateurs en millisecondes)
ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
ETHERPAD_API_KEY (clé API Etherpad)
UPLOAD_LIMIT (limite de téléversement des fichiers en Mo)
UPLOAD_FILE_TYPES (types de fichiers autorisés pour le téléversement / par défaut : .jpg,.jpeg,.png,.gif,.mp4,.m4v,.mp3,.m4a,.ogg,.wav,.pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.ods,.odg,.xls,.xlsx)
PAD_LIMIT (nombre maximum de pads par compte utilisateur)
CRON_TASK_DATE (régularité de la tâche cron pour supprimer les fichiers temporaires / 59 23 * * Saturday par défaut)
ADMIN_PASSWORD (mot de passe pour accéder à la page d'administration /admin)
EMAIL_HOST (hôte pour l'envoi d'emails)
EMAIL_ADDRESS (adresse pour l'envoi d'emails)
EMAIL_PASSWORD (mot de passe de l'adresse emails)
EMAIL_PORT (port pour l'envoi d'emails)
EMAIL_SECURE (true ou false)
MATOMO (lien vers un serveur Matomo)
MATOMO_SITE_ID (id de site sur le serveur Matomo / 1 par défaut)
NFS_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un dossier monté NFS - environ 200 000 pour 1 To de capacité disque)
NFS_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs)
NFS2_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un 2e dossier monté NFS - environ 200 000 pour 1 To de capacité disque)
NFS2_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs2)
AUTORIZED_DOMAINS (domaines autorisés pour api serveur. ex : ladigitale.dev,example.com / par défaut *)
```

### Projet Nuxt.js avec serveur Node.js (Express) et base de données Redis

### Démo
https://digipad.app

### Remerciements et crédits
Traduction en italien par Paolo Mauri (https://gitlab.com/maupao) et @nilocram (Roberto Marcolin)

Traduction en espagnol par Fernando S. Delgado Trujillo (https://gitlab.com/fersdt)

Traduction en croate par Ksenija Lekić (https://gitlab.com/Ksenija66L)

### Soutien
https://opencollective.com/ladigitale

