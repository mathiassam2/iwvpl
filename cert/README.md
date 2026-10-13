# Certificate authorities

`isrgrootx1.pem` is the **ISRG Root X1** certificate — the public root for
Let's Encrypt, which issues the TLS certificate TiDB Cloud presents on its
public endpoint.

It is not a secret. A root CA is a public document; the private key that makes
it meaningful never leaves ISRG, and is what makes the certificate trustworthy
rather than self-signed noise. Anyone can download this same file from
letsencrypt.org. Committing it is therefore safe and keeps a fresh clone able to
connect without hunting for it.

## Why verification matters here

TiDB's public endpoint accepts TLS only — plaintext connections are refused —
so `DB_SSL=true` is mandatory rather than advisory. That alone would encrypt
the traffic without proving it reached TiDB.

`DB_SSL_CA` points at this file so the server's certificate is also verified
against it. Without it, `config.ts` falls back to `rejectUnauthorized: false`:
still encrypted, but no protection against a machine in the middle presenting
its own certificate.

The bundled root was sufficient for this cluster. That is not guaranteed for
every TiDB region — if a different cluster chains to Amazon Root CA 1 rather
than ISRG, download that cluster's own CA from the Connect dialog and point
`DB_SSL_CA` at it instead. Verification failing loudly is better than silently
falling back.

## In production

Render has no filesystem access to this directory, so `DB_SSL_CA` is set to the
PEM text inline, with literal `\n` escapes. `config.ts` accepts either form —
a path relative to `api/`, or the PEM text itself.