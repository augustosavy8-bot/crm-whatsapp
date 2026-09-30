# LEARNING — OAuth de Mercado Pago: PKCE y `state`

Notas para entender qué hace la conexión de Mercado Pago del gimnasio (Fase 1 de
la conversión a marketplace) y por qué es segura. No hace falta saber esto para
usar la app; es para mantenerla.

## El problema

Queremos que **el gimnasio** autorice a **nuestra app** ("Kin Activa Pagos") a
cobrarle a los socios en su nombre. Eso se hace con **OAuth 2.0 (Authorization
Code)**: el admin del gym hace clic en "Conectar", va a Mercado Pago, dice "sí,
autorizo", y MP nos devuelve un `code` que cambiamos por un `access_token` del
gym. Con ese token creamos los pagos (y MP nos retiene nuestra comisión).

Ese ida y vuelta tiene dos riesgos clásicos que resolvemos con **PKCE** y
**`state`**.

## PKCE (Proof Key for Code Exchange)

**Riesgo:** entre que MP nos manda el `code` (por la URL de redirección) y que lo
cambiamos por el token, alguien podría **robar ese `code`** (queda en logs,
historial, referrers) y canjearlo él.

**Solución (PKCE):** antes de empezar generamos un secreto de un solo uso:

1. `code_verifier`: string aleatorio largo (43–128 caracteres). Lo guardamos
   nosotros, **nunca** viaja en la URL.
2. `code_challenge = BASE64URL(SHA-256(code_verifier))`. Este sí va en la URL de
   autorización, junto con `code_challenge_method=S256`.

Cuando canjeamos el `code`, mandamos también el `code_verifier` original. MP
calcula `SHA-256(code_verifier)` y lo compara con el `code_challenge` que le
mandamos al principio. Si no coinciden, rechaza el canje. Así, aunque alguien
robe el `code`, **no puede canjearlo** porque no tiene el `code_verifier` (y no
se puede deducir del challenge, porque SHA-256 es de una sola dirección).

En el código: `generarVerifier()` y `challengeS256()` en `src/lib/mpOauth.ts`.
La app de MP tiene **PKCE activado**, así que estos campos son obligatorios.

## `state` (anti-CSRF y de un solo uso)

**Riesgo (CSRF):** un atacante podría hacer que el navegador del admin caiga en
nuestro callback con un `code` de **la cuenta del atacante**, y terminaríamos
conectando la cuenta equivocada al gym.

**Solución (`state`):** antes de mandar al admin a MP generamos un `state`
aleatorio e impredecible y lo **guardamos en la base** (`mp_oauth_states`) junto
con:
- el `tenant_id` (a qué gym pertenece este pedido),
- el `code_verifier` del PKCE,
- una expiración (10 minutos),
- y un campo `used_at` para que sea **de un solo uso**.

MP nos devuelve ese mismo `state` en el callback. Ahí lo **consumimos**:
- si no existe, ya se usó, o venció → rechazamos (`?mp=error_state`);
- si es válido, lo marcamos usado de forma atómica (condición `used_at is null`)
  y recién ahí seguimos, usando el `tenant_id` guardado (no uno que venga de la
  URL) y el `code_verifier` correcto.

Como el `state` es aleatorio, de un solo uso y ligado server-side al gym, un
pedido de conexión falso no pasa la validación.

En el código: `crearOauthState()` / `consumirOauthState()` en
`src/lib/mpCuentas.ts`.

## Dónde se guardan los tokens

El `access_token` y el `refresh_token` del gym se guardan **encriptados**
(AES-256-GCM, clave `MP_TOKEN_ENC_KEY`) en `mp_cuentas_conectadas`. Nunca se
guardan en claro ni llegan al navegador: el panel solo ve un estado seguro
(conectada / vence / etc.) vía `/api/gym/mp/oauth/estado`. Si se pierde la clave,
los tokens no se pueden desencriptar y cada gym debe reconectar (no afecta nada
más de la app).

## El flujo completo, en orden

1. Admin hace clic en **Conectar Mercado Pago** → `GET /api/gym/mp/oauth/start`.
2. `start` (solo admin) genera `code_verifier` + `code_challenge` + `state`,
   guarda el state, y redirige a `https://auth.mercadopago.com/authorization`.
3. El admin autoriza en Mercado Pago.
4. MP redirige a `https://gym.kinactiva.com/api/gym/mp/oauth/callback?code=...&state=...`.
5. `callback` valida y consume el `state`, cambia el `code` (con el
   `code_verifier`) por los tokens, los guarda encriptados y vuelve al panel.
6. Para desconectar: `POST /api/gym/mp/oauth/disconnect` borra los tokens.
