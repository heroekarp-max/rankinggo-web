// Inicialización del SDK de Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Carga Inicial de Iconos Lucide
lucide.createIcons();

// Estados globales compartidos de RanKingGo
let userTelegramId = tg.initDataUnsafe?.user?.id || 12345678;
let userFirstName = tg.initDataUnsafe?.user?.first_name || "Pasajero Local";
let currentRegType = 'client'; 
let isDriverActive = true;

// Sincronizar UI del Nombre del Usuario
document.getElementById('user-display-name').innerText = userFirstName;

// Manejador del Sistema de Navegación SPA
function navigate(screenId) {
    const screens = ['screen-welcome', 'screen-register', 'screen-passenger-map', 'screen-driver-portal'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    const subtitle = document.getElementById('app-status-subtitle');
    if (screenId === 'screen-welcome') subtitle.innerText = "Portal de Servicios";
    if (screenId === 'screen-register') subtitle.innerText = "Formulario de Afiliación";
    if (screenId === 'screen-passenger-map') {
        subtitle.innerText = "Sondeo de Moto Taxis";
        // Disparar inicialización del mapa contenido en el otro archivo
        if (typeof initializeMapOnce === "function") initializeMapOnce();
    }
    if (screenId === 'screen-driver-portal') subtitle.innerText = "Consola de Despacho";
}

// Configuración visual del formulario de registro
function setRegType(type) {
    currentRegType = type;
    const tabClient = document.getElementById('tab-reg-client');
    const tabDriver = document.getElementById('tab-reg-driver');
    const driverFields = document.getElementById('driver-fields');

    if (type === 'client') {
        tabClient.className = "py-2.5 rounded-lg text-xs font-black text-black bg-amber-500 transition-all";
        tabDriver.className = "py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-all";
        driverFields.classList.add('hidden');
    } else {
        tabDriver.className = "py-2.5 rounded-lg text-xs font-black text-black bg-amber-500 transition-all";
        tabClient.className = "py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-all";
        driverFields.classList.remove('hidden');
    }
}

function startRegistrationFlow() {
    navigate('screen-register');
    setRegType('client');
}

// Procesamiento de Formulario KYC hacia backend Flask
async function submitRegistration() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const cedula = document.getElementById('reg-cedula').value.trim();
    const placa = document.getElementById('reg-placa').value.trim();
    const banco = document.getElementById('reg-banco').value;
    const telefono = document.getElementById('reg-telefono').value.trim();
    const legalChecked = document.getElementById('reg-legal').checked;

    if (!nombre || !cedula) {
        tg.showAlert("❌ Nombre y Cédula son requeridos.");
        return;
    }
    if (currentRegType === 'driver' && (!placa || !telefono)) {
        tg.showAlert("❌ Datos de vehículo y Pago Móvil obligatorios.");
        return;
    }
    if (!legalChecked) {
        tg.showAlert("❌ Debe aceptar el descargo de responsabilidad vial.");
        return;
    }

    const payload = {
        event: 'registration',
        type: currentRegType,
        user_id: userTelegramId,
        nombre: nombre,
        cedula: cedula,
        placa: currentRegType === 'driver' ? placa : null,
        banco: currentRegType === 'driver' ? banco : null,
        telefono: currentRegType === 'driver' ? telefono : null
    };

    try {
        const response = await fetch('/api/registrar_usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const resData = await response.json();
            tg.showAlert(`🎉 Registro exitoso. Código asignado: ${resData.id_codigo}`);
            navigate('screen-welcome');
        } else {
            tg.showAlert("❌ Error en el servidor de asignación de flota.");
        }
    } catch (err) {
        tg.sendData(JSON.stringify(payload));
        tg.close();
    }
}

// Validación de Perfil de Transportista Profesional (Solución Punto 1)
async function checkDriverStatus() {
    try {
        const res = await fetch(`/api/conductor_perfil?telegram_id=${userTelegramId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.registrado) {
                document.getElementById('driver-code-display').innerText = data.id_conductor;
                document.getElementById('system-bote-display').innerText = `${data.bote_acumulado.toFixed(2)} Bs.`;
                
                isDriverActive = data.estado === 'LIBRE';
                updateStatusButtonUI();
                navigate('screen-driver-portal');
            } else {
                tg.showConfirm(
                    "🏍️ No te encuentras registrado como Conductor.\n\n¿Deseas afiliarte a la flota oficial ahora mismo?",
                    (confirmed) => {
                        if (confirmed) {
                            navigate('screen-register');
                            setRegType('driver');
                        }
                    }
                );
            }
        }
    } catch (e) {
        tg.showAlert("❌ Error de comunicación con la central de RanKingGo.");
    }
}

function updateStatusButtonUI() {
    const btn = document.getElementById('btn-status-toggle');
    const txt = document.getElementById('txt-status-active');
    if (isDriverActive) {
        btn.className = "px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 active:scale-95 transition";
        txt.innerText = "ACTIVO / LIBRE";
    } else {
        btn.className = "px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 bg-rose-500/10 text-rose-400 border-rose-500/20 active:scale-95 transition";
        txt.innerText = "FUERA DE SERVICIO";
    }
}

async function toggleActiveStatus() {
    isDriverActive = !isDriverActive;
    updateStatusButtonUI();

    try {
        await fetch('/api/conductor_cambiar_estado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: userTelegramId,
                estado: isDriverActive ? 'LIBRE' : 'INACTIVO'
            })
        });
    } catch (e) {
        console.error("Fallo de sincronización de presencia de radio.");
    }
}