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
npm run prod
```

### Avec PM2
```
npm run build
pm2 start ecosystem.config.cjs
```

### Variables d'environnement pour la mise en production (fichier .env à créer à la racine du dossier)
```
DOMAIN (protocole + domaine. ex : https://digipad.app)
HOST (IP publique du serveur de production)
PORT (port du serveur local / 3000 par défaut)
DB_HOST (IP du serveur de base de données Redis)
DB_PWD (mot de passe de la base de données Redis)
DB_PORT (port de la base de données Redis / 6379 par défaut)
SESSION_KEY (clé de session Express Session)
SESSION_DURATION (durée de la session de connexion des utilisateurs en millisecondes)
VITE_ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
VITE_ETHERPAD_API_KEY (clé API Etherpad)
VITE_PIXABAY_API_KEY (clé API Pixabay)
VITE_UPLOAD_LIMIT (taille maximale de téléversement des fichiers en Mo)
VITE_UPLOAD_FILE_TYPES (types de fichiers autorisés pour le téléversement / par défaut : .jpg,.jpeg,.png,.gif,.mp4,.m4v,.mp3,.m4a,.ogg,.wav,.pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.ods,.odg,.xls,.xlsx)
VITE_PAD_LIMIT (nombre maximum de pads par compte utilisateur)
VITE_PAD_WITHOUT_ACCOUNT (0 ou 1 / pour autoriser la création de pads sans compte)
VITE_CREATE_ACCOUNT (0 ou 1 / pour autoriser la création de comptes)
VITE_ADMIN_PASSWORD (mot de passe pour accéder à la page d'administration /admin)
CRON_TASK_DATE (régularité de la tâche cron pour supprimer les fichiers temporaires / 59 23 * * Saturday par défaut)
EMAIL_HOST (hôte pour l'envoi d'emails)
EMAIL_ADDRESS (adresse pour l'envoi d'emails)
EMAIL_PASSWORD (mot de passe de l'adresse emails)
EMAIL_PORT (port pour l'envoi d'emails)
EMAIL_SECURE (true ou false)
VITE_MATOMO (lien vers un serveur Matomo)
VITE_MATOMO_SITE_ID (id de site sur le serveur Matomo / 1 par défaut)
VITE_NFS_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un dossier monté NFS - environ 170 000 pour 1 To de capacité disque)
VITE_NFS_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs)
VITE_NFS2_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un 2e dossier monté NFS)
VITE_NFS2_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs2)
VITE_NFS3_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un 3e dossier monté NFS)
VITE_NFS3_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs3)
VITE_NFS4_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un 4e dossier monté NFS)
VITE_NFS4_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs4)
VITE_NFS5_PAD_NUMBER (id de pad à partir de laquelle les fichiers seront enregistrés dans un 5e dossier monté NFS)
VITE_NFS5_FOLDER (nom du dossier monté NFS, obligatoirement situé dans le dossier /static/. ex : /static/nfs5)
AUTHORIZED_DOMAINS (domaines autorisés pour api serveur. ex : ladigitale.dev,example.com / par défaut *)
ALERT_AVAILABLE_SPACE (pourcentage d'espace libre en dessous duquel une alerte est affichée et le téléversement de fichiers empêché / 10 par défaut)
```

### Projet Vue (Vue.js 3 et Vike) avec serveur Node.js (Express) et base de données Redis

### Démo
https://digipad.app

### Remerciements et crédits
Traduction en italien par Paolo Mauri (https://gitlab.com/maupao) et @nilocram (Roberto Marcolin)

Traduction en espagnol par Fernando S. Delgado Trujillo (https://gitlab.com/fersdt)

Traduction en croate par Ksenija Lekić (https://gitlab.com/Ksenija66L)

Traduction en allemand par Alexander Weller (ZUM.de)

### Soutien
Open Collective : https://opencollective.com/ladigitale

Liberapay : https://liberapay.com/ladigitale/
