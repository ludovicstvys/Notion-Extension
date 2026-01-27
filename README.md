# Stage → Notion (Extension Chrome)

Cette extension extrait des informations d’une offre (si possible via JSON-LD `JobPosting`, sinon via OpenGraph/meta) puis crée ou met à jour une ligne dans une base Notion, en évitant les doublons grâce à la colonne **URL**.

## Installation

1. Dézippe l’archive.
2. Chrome → `chrome://extensions`
3. Active **Mode développeur**
4. Clique **Charger l’extension non empaquetée** et sélectionne le dossier.

## Configuration Notion

1. Notion → Settings → Integrations → crée une **Internal Integration**
2. Copie le **secret**
3. Partage ta base Notion avec cette intégration
4. Récupère le **Database ID**
5. Dans l’extension: Options → colle le secret + database id

## Colonnes attendues (noms exacts)

- **Intitulé** (Title)
- **Entreprise** (Text)
- **Lieu** (Text)
- **URL** (URL)
- **Statut** (Select) — ex: À postuler / Postulé
- **Postulé ?** (Checkbox)
- **Date d’ajout** (Date)
- **Date de candidature** (Date)
- **Description** (Text/Rich text)

Si tes colonnes ont d’autres noms, adapte `background.js` → `buildProps()`.
