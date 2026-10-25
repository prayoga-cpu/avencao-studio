# Stockage des fichiers

Fichiers conservés : PDF de factures, justificatifs d'encaissement et de règlement, pièces de
charges, documents clients/projets, logo. Les **rushs et masters restent dans Drive / Frame.io** :
seuls leurs liens sont enregistrés.

| Pilote | Configuration | Lecture |
|---|---|---|
| `local` | `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR` (hors `/public`) | Flux servi par `/api/files/[id]` après contrôle d'accès, `nosniff` + CSP sandbox |
| `s3` (obligatoire sur Vercel) | `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, clés, `S3_FORCE_PATH_STYLE` | Redirection vers une URL signée valable 5 minutes, après contrôle d'accès |

Cloudflare R2 : endpoint `https://<compte>.r2.cloudflarestorage.com`, région `auto`, chemin forcé
(`S3_FORCE_PATH_STYLE=true`). Le bucket doit rester **privé** ; activer le versioning si disponible.

## Contrôles à l'envoi

- Type vérifié par **signature binaire** (PDF, PNG, JPEG, WebP), pas par l'extension.
- Taille maximale : réglage de l'agence (Mo).
- Empreinte SHA-256 enregistrée ; nom de stockage aléatoire (jamais le nom d'origine).
- Droit d'écriture vérifié selon le propriétaire (facture → finances, vidéo → production, etc.).

`pnpm check:env` teste l'écriture, la lecture et la suppression d'un fichier témoin dans le bucket.
