/* ══════════════════════════════════════════════════════════
   TECHSUPPORT CHATBOX · script.js
   Lógica completa del sistema de chat con soporte técnico
   Almacenamiento: LocalStorage
   Sin dependencias externas
══════════════════════════════════════════════════════════ */

'use strict';

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN GLOBAL
// Modifica estos valores para ajustar precios, textos y más
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  empresa: 'TechSupport',
  agente:  'ARIA',

  // ── Precios estimados por servicio ──
  precios: {
    mantenimiento: '$50.000',
    reparacion:    'Desde $80.000',
    diagnostico:   '$30.000',
  },

  // ── Rango del código de reconocimiento (dígitos) ──
  codigoMinDigitos: 3,
  codigoMaxDigitos: 6,

  // ── Estado inicial de solicitudes nuevas ──
  estadoInicial: 'pending', // pending | active | completed

  // ── Clave del LocalStorage ──
  storageKey: 'techsupport_sessions',

  // ── Demora de escritura del bot (ms) ──
  botDelay: {
    corto: 800,
    medio: 1400,
    largo: 2000,
  },
};

// ═══════════════════════════════════════════════════════════
// ESTADO DE LA APLICACIÓN
// ═══════════════════════════════════════════════════════════
const state = {
  sesionActual: null,   // objeto de la sesión activa
  etapa:        'inicio', // etapa del flujo de conversación
  esperandoInput: false,  // si el input de texto está activo
};

// ═══════════════════════════════════════════════════════════
// REFERENCIAS AL DOM
// ═══════════════════════════════════════════════════════════
const dom = {
  welcomeScreen:       document.getElementById('welcome-screen'),
  chatScreen:          document.getElementById('chat-screen'),
  btnNewChat:          document.getElementById('btn-new-chat'),
  btnEnterCode:        document.getElementById('btn-enter-code'),
  recognitionInput:    document.getElementById('recognition-code-input'),
  codeError:           document.getElementById('code-error'),
  chatMessages:        document.getElementById('chat-messages'),
  typingIndicator:     document.getElementById('typing-indicator'),
  userInput:           document.getElementById('user-input'),
  btnSend:             document.getElementById('btn-send'),
  btnRestart:          document.getElementById('btn-restart'),
  codeBadge:           document.getElementById('code-badge'),
  badgeCodeValue:      document.getElementById('badge-code-value'),
  modalRestart:        document.getElementById('modal-restart'),
  btnCancelRestart:    document.getElementById('btn-cancel-restart'),
  btnConfirmRestart:   document.getElementById('btn-confirm-restart'),
};

// ═══════════════════════════════════════════════════════════
// UTILIDADES GENERALES
// ═══════════════════════════════════════════════════════════

/**
 * Genera un código de reconocimiento único aleatorio.
 * La longitud varía entre codigoMinDigitos y codigoMaxDigitos.
 * Verifica que no exista ya en el LocalStorage.
 */
function generarCodigo() {
  const sesiones = cargarSesiones();
  let codigo;
  do {
    const digitos = Math.floor(
      Math.random() * (CONFIG.codigoMaxDigitos - CONFIG.codigoMinDigitos + 1)
    ) + CONFIG.codigoMinDigitos;
    const min = Math.pow(10, digitos - 1);
    const max = Math.pow(10, digitos) - 1;
    codigo = String(Math.floor(Math.random() * (max - min + 1)) + min);
  } while (sesiones[codigo]); // evitar colisiones
  return codigo;
}

/**
 * Retorna la hora actual como string HH:MM
 */
function horaActual() {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna la fecha y hora actual formateada.
 */
function fechaHoraActual() {
  return new Date().toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Pausa la ejecución durante `ms` milisegundos (async/await).
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCIA: LOCALSTORAGE
// ═══════════════════════════════════════════════════════════

/** Carga todas las sesiones del LocalStorage. Retorna objeto. */
function cargarSesiones() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {};
  } catch {
    return {};
  }
}

/** Guarda el objeto de sesiones en el LocalStorage. */
function guardarSesiones(sesiones) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(sesiones));
}

/** Crea y guarda una nueva sesión con el código dado. */
function crearSesion(codigo, servicio) {
  const sesiones = cargarSesiones();
  sesiones[codigo] = {
    codigo,
    servicio,
    fecha:   fechaHoraActual(),
    estado:  CONFIG.estadoInicial,
    historial: [],
  };
  guardarSesiones(sesiones);
  return sesiones[codigo];
}

/** Obtiene una sesión por código. Retorna null si no existe. */
function obtenerSesion(codigo) {
  const sesiones = cargarSesiones();
  return sesiones[codigo] || null;
}

// ═══════════════════════════════════════════════════════════
// GESTIÓN DE PANTALLAS
// ═══════════════════════════════════════════════════════════

/** Cambia de pantalla: 'welcome' | 'chat' */
function mostrarPantalla(nombre) {
  dom.welcomeScreen.classList.remove('active');
  dom.chatScreen.classList.remove('active');

  if (nombre === 'welcome') dom.welcomeScreen.classList.add('active');
  if (nombre === 'chat')    dom.chatScreen.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// MENSAJES DEL CHAT
// ═══════════════════════════════════════════════════════════

/**
 * Agrega un mensaje de burbuja al chat.
 * @param {string} tipo - 'bot' | 'user'
 * @param {string|HTMLElement} contenido - texto HTML o elemento
 */
function agregarMensaje(tipo, contenido) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${tipo}`;

  // Avatar pequeño solo para mensajes del bot
  if (tipo === 'bot') {
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = `
      <svg viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="rgba(0,212,255,0.12)"/>
        <rect x="10" y="8" width="12" height="8" rx="2" fill="var(--accent)"/>
        <circle cx="13" cy="11" r="1.5" fill="#0b0e14"/>
        <circle cx="19" cy="11" r="1.5" fill="#0b0e14"/>
        <path d="M10 18 Q16 24 22 18" stroke="var(--accent)" stroke-width="1.5" fill="none"/>
        <rect x="14" y="16" width="4" height="3" rx="1" fill="var(--accent)"/>
      </svg>`;
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  // El contenido puede ser string HTML o nodo DOM
  if (typeof contenido === 'string') {
    bubble.innerHTML = contenido;
  } else {
    bubble.appendChild(contenido);
  }

  // Timestamp
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = horaActual();
  bubble.appendChild(time);

  const innerWrapper = document.createElement('div');
  innerWrapper.style.display = 'flex';
  innerWrapper.style.flexDirection = 'column';
  innerWrapper.appendChild(bubble);
  wrapper.appendChild(innerWrapper);

  dom.chatMessages.appendChild(wrapper);
  scrollAlFinal();
}

/** Desplaza el chat al último mensaje. */
function scrollAlFinal() {
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

/**
 * Muestra el indicador de escritura y luego envía un mensaje del bot.
 * @param {string|HTMLElement} contenido - contenido del mensaje
 * @param {number} delay - tiempo en ms antes de mostrar el mensaje
 * @param {Function} callback - función a ejecutar después
 */
async function botEscribe(contenido, delay = CONFIG.botDelay.medio, callback) {
  // Mostrar indicador de escritura
  dom.typingIndicator.style.display = 'flex';
  scrollAlFinal();

  await esperar(delay);

  // Ocultar indicador y mostrar mensaje
  dom.typingIndicator.style.display = 'none';
  agregarMensaje('bot', contenido);

  if (callback) callback();
}

// ═══════════════════════════════════════════════════════════
// BOTONES DE OPCIONES RÁPIDAS (opciones de servicio)
// ═══════════════════════════════════════════════════════════

/**
 * Crea un conjunto de botones de opción rápida.
 * @param {Array<{texto, valor}>} opciones
 * @param {Function} onSeleccion - callback con el valor seleccionado
 */
function crearOpcionesRapidas(opciones, onSeleccion) {
  const contenedor = document.createElement('div');
  contenedor.className = 'quick-options';

  opciones.forEach(({ texto, valor }) => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = texto;
    btn.addEventListener('click', () => {
      // Deshabilitar todos los botones para evitar doble clic
      contenedor.querySelectorAll('.quick-btn').forEach(b => b.disabled = true);
      onSeleccion(valor, texto);
    });
    contenedor.appendChild(btn);
  });

  return contenedor;
}

// ═══════════════════════════════════════════════════════════
// TARJETA DE CÓDIGO DE RECONOCIMIENTO
// ═══════════════════════════════════════════════════════════

/** Crea y retorna el nodo HTML de la tarjeta con el código. */
function crearTarjetaCodigo(codigo) {
  const frag = document.createDocumentFragment();

  const p = document.createElement('p');
  p.innerHTML = `Este es tu <strong style="color:var(--accent)">código de reconocimiento</strong> dentro de nuestra empresa. Guárdalo — te servirá para identificar tu solicitud y consultar el estado de tu servicio.`;
  frag.appendChild(p);

  const card = document.createElement('div');
  card.className = 'code-reveal-card';
  card.innerHTML = `
    <div class="code-reveal-label">🔑 Tu código de reconocimiento</div>
    <div class="code-reveal-number">${codigo}</div>
    <div class="code-reveal-info">
      Tu voz de reconocimiento es: <strong style="color:var(--accent);font-family:var(--font-mono)">${codigo}</strong>
    </div>`;
  frag.appendChild(card);

  return frag;
}

// ═══════════════════════════════════════════════════════════
// TABLA DE PRECIOS
// ═══════════════════════════════════════════════════════════

/** Crea y retorna la tarjeta con la tabla de precios estimados. */
function crearTarjetaPrecios(servicioSeleccionado) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<p>Estos son nuestros precios estimados:</p>`;

  const card = document.createElement('div');
  card.className = 'price-card';

  const servicios = [
    { nombre: 'Mantenimiento', clave: 'mantenimiento', emoji: '🔧' },
    { nombre: 'Reparación',    clave: 'reparacion',    emoji: '🛠' },
    { nombre: 'Diagnóstico',   clave: 'diagnostico',   emoji: '🔍' },
  ];

  servicios.forEach(({ nombre, clave, emoji }) => {
    const row = document.createElement('div');
    row.className = `price-row${clave === servicioSeleccionado ? ' highlighted' : ''}`;
    row.innerHTML = `
      <span class="price-service">${emoji} ${nombre}${clave === servicioSeleccionado ? ' ✓' : ''}</span>
      <span class="price-amount">${CONFIG.precios[clave]}</span>`;
    card.appendChild(row);
  });

  wrapper.appendChild(card);
  return wrapper;
}

// ═══════════════════════════════════════════════════════════
// TARJETA DE HISTORIAL
// ═══════════════════════════════════════════════════════════

/** Crea la tarjeta con el historial de una sesión existente. */
function crearTarjetaHistorial(sesion) {
  const etiquetasEstado = {
    pending:   { label: 'Pendiente',  clase: 'pending'   },
    active:    { label: 'En proceso', clase: 'active'     },
    completed: { label: 'Completado', clase: 'completed'  },
  };

  const estado = etiquetasEstado[sesion.estado] || etiquetasEstado.pending;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<p>Aquí está el estado actual de tu solicitud:</p>`;

  const card = document.createElement('div');
  card.className = 'history-card';
  card.innerHTML = `
    <div class="history-row">
      <span class="history-key">📋 Servicio</span>
      <span class="history-val" style="text-transform:capitalize">${sesion.servicio}</span>
    </div>
    <div class="history-row">
      <span class="history-key">📅 Fecha</span>
      <span class="history-val">${sesion.fecha}</span>
    </div>
    <div class="history-row">
      <span class="history-key">🔑 Código</span>
      <span class="history-val" style="font-family:var(--font-mono);color:var(--accent)">${sesion.codigo}</span>
    </div>
    <div class="history-row">
      <span class="history-key">📊 Estado</span>
      <span class="history-val"><span class="status-badge ${estado.clase}">${estado.label}</span></span>
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

// ═══════════════════════════════════════════════════════════
// FLUJO PRINCIPAL: NUEVA CONVERSACIÓN
// ═══════════════════════════════════════════════════════════

/**
 * Inicia una nueva sesión de chat desde cero.
 * Flujo: saludo → selección de servicio → código → precio → despedida.
 */
async function iniciarNuevaConversacion() {
  mostrarPantalla('chat');
  limpiarChat();
  state.etapa = 'seleccion_servicio';
  state.esperandoInput = false;
  habilitarInput(false);

  // ── Paso 1: Saludo inicial ───────────────────────────────
  await botEscribe(
    `¡Hola! Soy <strong>ARIA</strong>, asistente de soporte técnico de <strong>${CONFIG.empresa}</strong>. 👋<br/>
     Estoy aquí para ayudarte con tu solicitud de servicio.`,
    CONFIG.botDelay.medio
  );

  // ── Paso 2: Pregunta del servicio ────────────────────────
  await esperar(400);
  await botEscribe(
    buildServiciosPregunta(),
    CONFIG.botDelay.corto,
    () => {
      // Agregar botones de opciones DENTRO del último mensaje del bot
      const opcionesNode = crearOpcionesRapidas(
        [
          { texto: '🔧 Mantenimiento', valor: 'mantenimiento' },
          { texto: '🛠 Reparación',    valor: 'reparacion'    },
          { texto: '🔍 Diagnóstico',   valor: 'diagnostico'   },
        ],
        onServicioSeleccionado
      );
      // Insertar las opciones justo después del último mensaje del bot
      const ultimoBubble = dom.chatMessages.lastElementChild.querySelector('.msg-bubble');
      if (ultimoBubble) {
        ultimoBubble.insertBefore(opcionesNode, ultimoBubble.querySelector('.msg-time'));
      }
    }
  );
}

/** Construye el HTML de la pregunta de servicio. */
function buildServiciosPregunta() {
  return `¿Qué tipo de servicio necesitas hoy? Por favor selecciona una opción:`;
}

/**
 * Callback cuando el usuario selecciona un servicio.
 * @param {string} valor - clave del servicio ('mantenimiento' etc.)
 * @param {string} texto - label del botón
 */
async function onServicioSeleccionado(valor, texto) {
  // Mostrar elección del usuario
  agregarMensaje('user', `<p>${texto}</p>`);
  state.etapa = 'generando_codigo';

  // ── Paso 3: Confirmación del servicio ────────────────────
  await botEscribe(
    `Perfecto. Has seleccionado: <strong style="color:var(--accent)">${texto}</strong>.<br/>
     Estoy generando tu código de reconocimiento único...`,
    CONFIG.botDelay.medio
  );

  // ── Paso 4: Generar y mostrar el código ──────────────────
  const codigo = generarCodigo();
  const sesion = crearSesion(codigo, valor);
  state.sesionActual = sesion;

  // Actualizar badge en el header
  actualizarBadgeCodigo(codigo);

  await esperar(600);
  dom.typingIndicator.style.display = 'none';

  agregarMensaje('bot', crearTarjetaCodigo(codigo));

  // ── Paso 5: Precios ──────────────────────────────────────
  await botEscribe(
    crearTarjetaPrecios(valor),
    CONFIG.botDelay.largo
  );

  // ── Paso 6: Mensaje de próximos pasos ────────────────────
  await botEscribe(
    `Un agente especializado revisará tu solicitud y se comunicará contigo próximamente. 
     <br/><br/>
     Si tienes alguna pregunta o comentario adicional, escríbelo a continuación. 
     También puedes <strong>guardar tu código</strong> para consultar el estado de tu solicitud en el futuro.`,
    CONFIG.botDelay.largo,
    () => {
      // Habilitar el input de texto para consultas adicionales
      state.etapa = 'chat_libre';
      habilitarInput(true);
    }
  );
}

// ═══════════════════════════════════════════════════════════
// FLUJO: USUARIO RECURRENTE (con código existente)
// ═══════════════════════════════════════════════════════════

/**
 * Inicia la sesión para un usuario que ya tiene código.
 * @param {string} codigo
 */
async function iniciarSesionExistente(codigo) {
  const sesion = obtenerSesion(codigo);
  if (!sesion) {
    dom.codeError.style.display = 'block';
    return;
  }

  dom.codeError.style.display = 'none';
  mostrarPantalla('chat');
  limpiarChat();
  state.sesionActual = sesion;
  state.etapa = 'chat_libre';
  habilitarInput(false);
  actualizarBadgeCodigo(codigo);

  // ── Bienvenida de regreso ────────────────────────────────
  await botEscribe(
    `¡Bienvenido de nuevo! 🎉<br/>
     Hemos reconocido tu código <strong style="color:var(--accent);font-family:var(--font-mono)">${codigo}</strong>.`,
    CONFIG.botDelay.medio
  );

  // ── Mostrar historial ────────────────────────────────────
  await botEscribe(
    crearTarjetaHistorial(sesion),
    CONFIG.botDelay.medio,
    () => {
      habilitarInput(true);
      state.etapa = 'chat_libre';
    }
  );

  await botEscribe(
    `¿En qué más puedo ayudarte hoy? Si tienes alguna consulta sobre tu solicitud, escríbela aquí.`,
    CONFIG.botDelay.corto
  );
}

// ═══════════════════════════════════════════════════════════
// MANEJO DEL INPUT DEL USUARIO (chat libre)
// ═══════════════════════════════════════════════════════════

/**
 * Procesa el mensaje escrito por el usuario en el input de texto.
 */
async function procesarMensajeUsuario() {
  const texto = dom.userInput.value.trim();
  if (!texto) return;

  dom.userInput.value = '';
  agregarMensaje('user', `<p>${escapeHtml(texto)}</p>`);
  habilitarInput(false);

  // Respuesta genérica del bot en modo chat libre
  await botEscribe(
    await respuestaAutomatica(texto),
    CONFIG.botDelay.medio,
    () => habilitarInput(true)
  );
}

/**
 * Genera una respuesta automática básica según palabras clave.
 * Puedes ampliar esta función para conectar con una API de IA.
 * @param {string} texto
 * @returns {string} HTML de la respuesta
 */
async function respuestaAutomatica(texto) {
  const t = texto.toLowerCase();

  // Palabras clave → respuestas contextuales
  if (t.includes('código') || t.includes('codigo') || t.includes('número') || t.includes('numero')) {
    const cod = state.sesionActual?.codigo || '—';
    return `Tu código de reconocimiento es: <strong style="color:var(--accent);font-family:var(--font-mono)">${cod}</strong>. Guárdalo para futuras consultas.`;
  }
  if (t.includes('estado') || t.includes('solicitud') || t.includes('seguimiento')) {
    const s = state.sesionActual;
    if (s) return crearTarjetaHistorial(s).outerHTML || 'Aquí está el estado de tu solicitud.';
    return 'Para consultar el estado, necesito tu código de reconocimiento.';
  }
  if (t.includes('precio') || t.includes('costo') || t.includes('valor') || t.includes('cuánto')) {
    return crearTarjetaPrecios(state.sesionActual?.servicio || '').outerHTML ||
      `Los precios son: Mantenimiento ${CONFIG.precios.mantenimiento} · Diagnóstico ${CONFIG.precios.diagnostico} · Reparación ${CONFIG.precios.reparacion}.`;
  }
  if (t.includes('gracias') || t.includes('thanks') || t.includes('listo')) {
    return '¡De nada! Fue un placer ayudarte. Si necesitas algo más, aquí estaré. 😊';
  }
  if (t.includes('hola') || t.includes('buenas') || t.includes('hey')) {
    return `¡Hola! Soy ${CONFIG.agente}. ¿En qué puedo ayudarte hoy?`;
  }
  if (t.includes('agente') || t.includes('humano') || t.includes('persona')) {
    return 'Estoy notificando a un agente humano para que se comunique contigo lo antes posible. El tiempo de respuesta es de 1 a 3 horas hábiles.';
  }
  if (t.includes('cancelar') || t.includes('cancel')) {
    return 'Para cancelar una solicitud, por favor comunícate directamente con nuestro equipo de soporte al número <strong>+57 (1) 234-5678</strong> con tu código de reconocimiento a mano.';
  }

  // Respuesta por defecto
  const respuestasDefault = [
    `Entendido. Hemos registrado tu mensaje. Un agente de ${CONFIG.empresa} lo revisará pronto.`,
    `Gracias por tu mensaje. Si necesitas atención inmediata, puedes llamarnos con tu código de reconocimiento.`,
    `He notado tu consulta. ¿Hay algo más específico en lo que pueda ayudarte ahora mismo?`,
  ];
  return respuestasDefault[Math.floor(Math.random() * respuestasDefault.length)];
}

// ═══════════════════════════════════════════════════════════
// HELPERS DE UI
// ═══════════════════════════════════════════════════════════

/** Habilita o deshabilita el campo de texto y el botón de envío. */
function habilitarInput(activo) {
  dom.userInput.disabled = !activo;
  dom.btnSend.disabled   = !activo;
  state.esperandoInput   = activo;
  if (activo) dom.userInput.focus();
}

/** Actualiza el badge del código en el header. */
function actualizarBadgeCodigo(codigo) {
  dom.badgeCodeValue.textContent = codigo;
  dom.codeBadge.style.display = 'flex';
}

/** Limpia todos los mensajes del chat. */
function limpiarChat() {
  dom.chatMessages.innerHTML = '';
  dom.typingIndicator.style.display = 'none';
  dom.codeBadge.style.display = 'none';
  dom.badgeCodeValue.textContent = '—';
}

/**
 * Escapa caracteres HTML para evitar inyecciones.
 * @param {string} str
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════
// REINICIO DE CONVERSACIÓN
// ═══════════════════════════════════════════════════════════

/** Muestra el modal de confirmación para reiniciar. */
function mostrarModalReinicio() {
  dom.modalRestart.style.display = 'flex';
}

/** Oculta el modal de confirmación. */
function ocultarModalReinicio() {
  dom.modalRestart.style.display = 'none';
}

/** Ejecuta el reinicio: limpia estado y vuelve a la pantalla de bienvenida. */
function reiniciarConversacion() {
  ocultarModalReinicio();
  state.sesionActual  = null;
  state.etapa         = 'inicio';
  state.esperandoInput = false;
  limpiarChat();
  dom.recognitionInput.value = '';
  dom.codeError.style.display = 'none';
  mostrarPantalla('welcome');
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════

// ── Pantalla de bienvenida: nueva conversación ────────────
dom.btnNewChat.addEventListener('click', () => {
  iniciarNuevaConversacion();
});

// ── Pantalla de bienvenida: ingresar código existente ─────
document.getElementById('btn-enter-code').onclick = () => {
  const codigo = document.getElementById('recognition-code-input').value.trim();
  console.log("Código capturado:", codigo);
  if (!codigo) {
    console.log("Vacío, mostrando error");
    document.getElementById('code-error').textContent = '⚠ Por favor ingresa tu código.';
    document.getElementById('code-error').style.display = 'block';
    return;
  }
  console.log("Llamando a iniciarSesionExistente con:", codigo);
  iniciarSesionExistente(codigo);
};

// Limpiar error al escribir
dom.recognitionInput.addEventListener('input', () => {
  dom.codeError.style.display = 'none';
});

// ── Chat: enviar mensaje con botón ────────────────────────
dom.btnSend.addEventListener('click', () => {
  if (!dom.userInput.disabled) procesarMensajeUsuario();
});

// ── Chat: enviar mensaje con Enter ────────────────────────
dom.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !dom.userInput.disabled) {
    e.preventDefault();
    procesarMensajeUsuario();
  }
});

// ── Chat: botón de reiniciar ──────────────────────────────
dom.btnRestart.addEventListener('click', mostrarModalReinicio);

// ── Modal: cancelar reinicio ──────────────────────────────
dom.btnCancelRestart.addEventListener('click', ocultarModalReinicio);

// ── Modal: confirmar reinicio ─────────────────────────────
dom.btnConfirmRestart.addEventListener('click', reiniciarConversacion);

// ── Cerrar modal al hacer clic fuera de la tarjeta ────────
dom.modalRestart.addEventListener('click', (e) => {
  if (e.target === dom.modalRestart) ocultarModalReinicio();
});

// ═══════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════

/**
 * Punto de entrada de la aplicación.
 * Muestra la pantalla de bienvenida al cargar.
 */
function init() {
  mostrarPantalla('welcome');
  console.log(`%c${CONFIG.empresa} · Chat de Soporte Técnico`, 'color:#00d4ff;font-family:monospace;font-size:14px;font-weight:bold;');
  console.log('%cSesiones almacenadas:', 'color:#7a8aaa;', cargarSesiones());
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
