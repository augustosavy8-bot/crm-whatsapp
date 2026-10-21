# Puntos KinActiva — cómo funciona

Adaptación de **Point** (sistema de puntos) al gimnasio: los socios suman puntos
por venir a entrenar y, a fin de mes, los que más puntos tienen se llevan un
premio. Esta es la **v1** (motor de puntos + ranking + vista del socio).

## De dónde salen los puntos

No hay doble carga: los puntos se calculan de la **asistencia que ya se
registra** en el gimnasio (`gym_asistencias`, estado `presente`). Cada vez que
queda marcada la asistencia de un socio a una clase, eso ya cuenta.

## Las reglas (v1)

- **1 punto por asistencia** (cada clase a la que fue).
- **Bonus de constancia:** si en una **semana** (lunes a domingo) completa
  **3 clases**, suma **+2 puntos** esa semana. Si cumple varias semanas, el
  bonus se acumula.
- **Premio del mes:** los **3 con más puntos** del mes se llevan el premio.

Los números (1 punto, 3 clases/+2, top 3) están como constantes en
`src/lib/gymPuntos.ts` y se pueden cambiar en un solo lugar. Más adelante se
pueden hacer configurables desde el panel.

## Qué ve el socio

En **`/mi-cuenta`**, el socio ve una sección **Puntos**:
- **Sus puntos del mes** y su **puesto** en el ranking.
- Un aviso si va entre los que ganan el premio.
- La **tabla del mes** (ranking, con su fila resaltada).
- Un **"¿Cómo funciona?"** que explica las reglas.

## Estado actual (importante)

- **Gateado a la cuenta de prueba** (`src/lib/gymPuntosPrueba.ts`): hoy la vista
  de Puntos la ve **solo** el teléfono `3471538679` (Augusto). El resto de los
  socios **no la ve** todavía.
- Para habilitarla a todos: que `puntosHabilitadoParaAlumno` devuelva `true`
  (o se vacía el set y se cambia la condición), igual que el gate de MercadoPago.

## Próxima etapa (check-in por NFC / QR)

Falta definir el **check-in**: que el socio marque su propia asistencia
escaneando un **QR** del gimnasio o tocando su **chip NFC** (en vez de que lo
marque el staff). Eso alimenta la misma asistencia que ya usan los puntos, así
que el motor de puntos no cambia; solo se agrega la forma de registrar que vino.
Dos modelos posibles:
- **El gym lee al socio** (estilo Point): chip/QR personal del socio, leído por
  un dispositivo en la entrada.
- **El socio lee al gym:** QR fijo del gimnasio, escaneado con el teléfono del
  socio (sin hardware).
