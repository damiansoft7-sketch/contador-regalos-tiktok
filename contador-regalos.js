// ============================================================
// CONTADOR DE REGALOS DE TIKTOK LIVE -> FIREBASE (textoLive)
// ============================================================
// Este script se conecta a tu TikTok Live, escucha los regalos
// que te envían y actualiza el número directamente en la misma
// ruta de Firebase que ya usa tu overlay (textoLive/<id>).
//
// No necesitas tocar index.html ni overlay.html: como overlay.html
// ya escucha esa ruta con onValue(), el número cambia solo, en vivo.
// ============================================================

import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get } from "firebase/database";
import express from "express";

// ------------------------------------------------------------
// 1) TU USUARIO DE TIKTOK (sin @)
// ------------------------------------------------------------
const TIKTOK_USERNAME = "toyasao.ff";

// ------------------------------------------------------------
// 2) TU CONFIGURACIÓN DE FIREBASE (la misma de firebase.js)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDqdpAchewxlYmGrhFb5WyJKqbL5UP2XsA",
  authDomain: "tikfinity-overlay.firebaseapp.com",
  databaseURL: "https://tikfinity-overlay-default-rtdb.firebaseio.com",
  projectId: "tikfinity-overlay",
  storageBucket: "tikfinity-overlay.firebasestorage.app",
  messagingSenderId: "943639302610",
  appId: "1:943639302610:web:5e747094f2f6151b70380b"
};

// ------------------------------------------------------------
// 3) TUS CONTADORES PERSONALIZADOS
// ------------------------------------------------------------
// Cada entrada = un regalo que quieres contar y a qué caja de texto
// (id de tu overlay) debe actualizar el número.
//
// El nombre del regalo (giftName) debe coincidir EXACTO con el que
// manda TikTok (revisa el log de la consola / de Render al recibir
// uno real, por si aparece distinto).
const CONTADORES = {
  "Collar de Amistad": { id: "texto_1786492863677", cantidad: 0 },
  "Rosa":              { id: "texto_1786492875052", cantidad: 0 },
};

// Si quieres un contador que sume TODOS los regalos sin importar
// cuál sea, pon activo:true y el id de esa caja.
const CONTADOR_TOTAL = {
  activo: false,
  id: "texto_CAMBIAR_ESTE_ID_TOTAL",
  cantidad: 0
};

// ============================================================
// A partir de aquí no necesitas tocar nada
// ============================================================

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

async function actualizarContador(id, cantidad) {
  try {
    await set(ref(database, "textoLive/" + id), String(cantidad));
    console.log(`  -> Firebase actualizado: textoLive/${id} = ${cantidad}`);
  } catch (err) {
    console.error("  -> Error al escribir en Firebase:", err.message);
  }
}

// Restaura los contadores guardados (por si el servicio se reinicia
// y no quieres que vuelva a empezar desde 0)
async function restaurarContadores() {
  for (const giftName in CONTADORES) {
    const cfg = CONTADORES[giftName];
    const snap = await get(ref(database, "textoLive/" + cfg.id));
    if (snap.exists()) {
      const valor = parseInt(snap.val(), 10);
      if (!isNaN(valor)) cfg.cantidad = valor;
    }
  }
  if (CONTADOR_TOTAL.activo) {
    const snap = await get(ref(database, "textoLive/" + CONTADOR_TOTAL.id));
    if (snap.exists()) {
      const valor = parseInt(snap.val(), 10);
      if (!isNaN(valor)) CONTADOR_TOTAL.cantidad = valor;
    }
  }
}

async function iniciar() {
  await restaurarContadores();

  // enableExtendedGiftInfo permite que data.giftDetails.giftName
  // venga con el nombre real del regalo (ej. "Rosa", "Collar de Amistad")
  const connection = new TikTokLiveConnection(TIKTOK_USERNAME, {
    enableExtendedGiftInfo: true
  });

  connection.connect()
    .then(state => {
      console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (roomId: ${state.roomId})`);
    })
    .catch(err => {
      console.error("❌ No se pudo conectar. ¿Estás en vivo ahora mismo?", err);
    });

  connection.on(WebcastEvent.GIFT, data => {
    const giftType = data.giftDetails?.giftType ?? data.giftType;
    const giftName = data.giftDetails?.giftName ?? data.giftName;
    const uniqueId = data.user?.uniqueId ?? data.uniqueId ?? "alguien";

    // TikTok reenvía el mismo regalo varias veces mientras el usuario
    // mantiene presionado el botón (combo). Solo contamos cuando el
    // combo termina, para no duplicar de más.
    if (giftType === 1 && !data.repeatEnd) return;

    const cantidadRecibida = data.repeatCount || 1;
    console.log(`🎁 ${uniqueId} envió ${cantidadRecibida}x "${giftName}"`);

    const cfg = CONTADORES[giftName];
    if (cfg) {
      cfg.cantidad += cantidadRecibida;
      actualizarContador(cfg.id, cfg.cantidad);
    }

    if (CONTADOR_TOTAL.activo) {
      CONTADOR_TOTAL.cantidad += cantidadRecibida;
      actualizarContador(CONTADOR_TOTAL.id, CONTADOR_TOTAL.cantidad);
    }
  });

  connection.on(WebcastEvent.DISCONNECTED, () => {
    console.log("⚠️ Desconectado del live. Reintentando en 10s...");
    setTimeout(() => connection.connect().catch(() => {}), 10000);
  });
}

iniciar();

// ------------------------------------------------------------
// SERVIDOR WEB MÍNIMO — necesario solo para poder desplegar esto
// gratis en Render (que exige un "Web Service" que responda HTTP).
// No hace nada más que confirmar que el proceso sigue vivo.
// Un monitor gratuito como UptimeRobot debe visitar esta URL
// cada 5-10 minutos para evitar que Render lo duerma.
// ------------------------------------------------------------
const server = express();
const PORT = process.env.PORT || 3000;

server.get("/health", (req, res) => {
  res.status(200).send("Contador de regalos activo ✅");
});

server.listen(PORT, () => {
  console.log(`Servidor de salud escuchando en el puerto ${PORT}`);
});
