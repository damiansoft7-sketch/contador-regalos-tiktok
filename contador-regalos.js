// ============================================================
// CONTADOR DE REGALOS DE TIKTOK LIVE -> FIREBASE (textoLive)
// ============================================================
// Este script se conecta a tu TikTok Live (vía Tik.Tools) y
// actualiza el número directamente en Firebase, en la misma ruta
// que ya usa tu overlay (textoLive/<id>).
//
// No necesitas tocar index.html ni overlay.html: como overlay.html
// ya escucha esa ruta con onValue(), el número cambia solo, en vivo.
// ============================================================

import { TikTokLive } from "tiktok-live-api";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get } from "firebase/database";
import express from "express";

// ------------------------------------------------------------
// 1) TU USUARIO DE TIKTOK (sin @)
// ------------------------------------------------------------
const TIKTOK_USERNAME = "toyasao.ff";

// ------------------------------------------------------------
// 2) TU API KEY DE TIK.TOOLS (gratis, sacada en tik.tools)
//    Se configura como variable de entorno en Render:
//    Key: TIKTOOLS_API_KEY   Value: tu clave
// ------------------------------------------------------------
const TIKTOOLS_API_KEY = process.env.TIKTOOLS_API_KEY;

// ------------------------------------------------------------
// 3) TU CONFIGURACIÓN DE FIREBASE (la misma de firebase.js)
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
// 4) TUS CONTADORES PERSONALIZADOS
// ------------------------------------------------------------
// El nombre del regalo (giftName) debe coincidir EXACTO con el que
// manda TikTok (revisa el log de Render al recibir uno real, por
// si aparece distinto).
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

// ------------------------------------------------------------
// DIAGNÓSTICO: prueba una petición HTTP normal (no WebSocket)
// contra tik.tools para ver el status, los headers y el cuerpo
// exactos de la respuesta. Esto nos dice si el 403 viene de un
// firewall/WAF (headers tipo cloudflare) o de tik.tools mismo
// (un mensaje de error en el cuerpo).
// ------------------------------------------------------------
async function diagnosticoConexion() {
  try {
    const url = `https://api.tik.tools/?uniqueId=${TIKTOK_USERNAME}&apiKey=${TIKTOOLS_API_KEY}`;
    const res = await fetch(url);
    console.log("🔎 DIAGNOSTICO status:", res.status);
    console.log("🔎 DIAGNOSTICO headers:", JSON.stringify([...res.headers.entries()]));
    const texto = await res.text();
    console.log("🔎 DIAGNOSTICO body:", texto.slice(0, 500));
  } catch (e) {
    console.log("🔎 DIAGNOSTICO error:", e.message);
  }
}

// ------------------------------------------------------------
// Lógica central: qué hacer cuando llega un regalo (real o de prueba)
// ------------------------------------------------------------
function procesarRegalo(giftName, cantidadRecibida, uniqueId = "prueba") {
  console.log(`🎁 ${uniqueId} envió ${cantidadRecibida}x "${giftName}" (nombre exacto tal cual lo manda TikTok)`);

  const cfg = CONTADORES[giftName];
  if (!cfg) {
    console.log(`   ⚠️ "${giftName}" no coincide con ningún nombre en CONTADORES. Nombres configurados: ${Object.keys(CONTADORES).join(", ")}`);
  } else {
    cfg.cantidad += cantidadRecibida;
    actualizarContador(cfg.id, cfg.cantidad);
  }

  if (CONTADOR_TOTAL.activo) {
    CONTADOR_TOTAL.cantidad += cantidadRecibida;
    actualizarContador(CONTADOR_TOTAL.id, CONTADOR_TOTAL.cantidad);
  }
}

async function iniciar() {
  await diagnosticoConexion();
  await restaurarContadores();

  if (!TIKTOOLS_API_KEY) {
    console.error("❌ Falta configurar la variable de entorno TIKTOOLS_API_KEY en Render.");
    return;
  }

  const client = new TikTokLive(TIKTOK_USERNAME, { apiKey: TIKTOOLS_API_KEY });

  client.on("connected", () => {
    console.log(`✅ Conectado al live de @${TIKTOK_USERNAME}`);
  });

  client.on("gift", data => {
    const giftName = data.giftName;
    const uniqueId = data.user?.uniqueId ?? "alguien";
    const repeatEnd = data.repeatEnd;
    const giftType = data.giftType;

    // TikTok reenvía el mismo regalo varias veces mientras el usuario
    // mantiene presionado el botón (combo). Solo contamos cuando el
    // combo termina, para no duplicar de más.
    if (giftType === 1 && repeatEnd === false) return;

    const cantidadRecibida = data.repeatCount || 1;
    procesarRegalo(giftName, cantidadRecibida, uniqueId);
  });

  client.on("disconnected", () => {
    console.log("⚠️ Desconectado del live. La librería reintentará sola.");
  });

  client.on("error", err => {
    console.log(`❌ Error de conexión: ${err.message || err}`);
  });

  client.connect();
}

// Evita que un error interno del socket de la librería tumbe todo
// el proceso (y con él, el servidor Express de /health).
process.on("uncaughtException", (err) => {
  console.error("⚠️ Excepción no capturada:", err);
});

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

// ------------------------------------------------------------
// RUTAS DE PRUEBA Y RESETEO
// ------------------------------------------------------------
// Clave secreta para que nadie más pueda usar estas rutas si
// llega a ver tu URL. Configúrala en Railway como variable de
// entorno: ADMIN_KEY = lo-que-tú-quieras
// Si no la configuras, usa "cambiame123" por defecto (cámbiala).
const ADMIN_KEY = process.env.ADMIN_KEY || "cambiame123";

// Prueba: simula que llegó un regalo, sin necesidad de mandarlo de verdad.
// Uso: https://tu-servicio.up.railway.app/test-gift?clave=TU_CLAVE&nombre=Rosa&cantidad=1
server.get("/test-gift", (req, res) => {
  if (req.query.clave !== ADMIN_KEY) {
    return res.status(403).send("❌ Clave incorrecta");
  }
  const nombre = req.query.nombre;
  const cantidad = parseInt(req.query.cantidad, 10) || 1;
  if (!nombre) {
    return res.status(400).send("❌ Falta el parámetro 'nombre'. Ej: /test-gift?clave=...&nombre=Rosa&cantidad=1");
  }
  procesarRegalo(nombre, cantidad, "PRUEBA-MANUAL");
  res.status(200).send(`✅ Simulado: ${cantidad}x "${nombre}". Revisa los logs y el overlay.`);
});

// Reset: pone todos los contadores en 0, tanto en memoria como en Firebase.
// Uso: https://tu-servicio.up.railway.app/reset?clave=TU_CLAVE
server.get("/reset", async (req, res) => {
  if (req.query.clave !== ADMIN_KEY) {
    return res.status(403).send("❌ Clave incorrecta");
  }
  for (const giftName in CONTADORES) {
    CONTADORES[giftName].cantidad = 0;
    await actualizarContador(CONTADORES[giftName].id, 0);
  }
  if (CONTADOR_TOTAL.activo) {
    CONTADOR_TOTAL.cantidad = 0;
    await actualizarContador(CONTADOR_TOTAL.id, 0);
  }
  console.log("🔄 Contadores reiniciados a 0 por petición manual.");
  res.status(200).send("✅ Todos los contadores fueron reiniciados a 0.");
});

server.listen(PORT, () => {
  console.log(`Servidor de salud escuchando en el puerto ${PORT}`);
});
