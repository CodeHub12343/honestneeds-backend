# Social-token encryption-key rotation

Social OAuth tokens are stored on `social_connections` as AES-256-GCM ciphertext
by `src/utils/crypto.js`. The ciphertext carries a `keyId`, so multiple keys can
coexist during a rotation — old rows still decrypt while new rows are written
under the active key.

## Envs

- `SOCIAL_TOKEN_ENCRYPTION_KEY` — base64 of 32 random bytes. The **active** key.
  All new ciphertext is produced with this key.
- `SOCIAL_TOKEN_ENCRYPTION_KEY_ID` — short string that identifies the active
  key in the stored ciphertext (default `1`).
- `SOCIAL_TOKEN_ENCRYPTION_KEYS` — optional JSON object `{ "<id>": "<base64>" }`
  of **retired** keys that must still decrypt. Keys here are read-only.

Generate a new key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Rotation procedure (zero-downtime)

1. **Add the next key as retired first.** On the current deploy, set
   `SOCIAL_TOKEN_ENCRYPTION_KEYS={"2":"<new base64>"}` and redeploy. The service
   can now decrypt ciphertext tagged with id `2` even though no row carries it
   yet.
2. **Promote the new key.** Flip `SOCIAL_TOKEN_ENCRYPTION_KEY` to the new
   base64 and `SOCIAL_TOKEN_ENCRYPTION_KEY_ID=2`. Move the **old** key into
   `SOCIAL_TOKEN_ENCRYPTION_KEYS={"1":"<old base64>"}`. Redeploy. New
   ciphertext is now `v1:2:…`; the old rows still decrypt under id `1`.
3. **Re-encrypt in the background.** Run
   `node scripts/migrations/reencrypt-social-tokens.js` (not shipped — one-off).
   It reads each row, decrypts under whatever id is stamped, and writes back
   under the active id.
4. **Retire the old key.** When no row carries id `1` any more (check with
   `db.social_connections.countDocuments({access_token_ct: /^v1:1:/})`),
   remove the id `1` entry from `SOCIAL_TOKEN_ENCRYPTION_KEYS` and redeploy.

## Loss of the active key

If the active key is lost before step 4, every ciphertext under its id is
unrecoverable; connections tagged `active` will fail refresh and be marked
`needs_reauth`. The user must reconnect each provider. There is no recovery —
the keys live only in the Render dashboard + an offline backup envelope.
