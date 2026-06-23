let mapInstance = null;
let originMarker, destMarker, routeLine;

// Casco Central de Charallave por defecto (Evita campos vacíos en fallas de GPS)
const latDefault = 10.2438;
const lonDefault = -66.8611;

// Los 5 puntos de acceso rápido estratégicos solicitados
const puntosCharallave = [
    { nombre: "📍 El BDV Casco Central", lat: 10.2442, lng: -66.8625 },
    { nombre: "🛍️ C.C. Tamanaco", lat: 10.2421, lng: -66.8643 },
    { nombre: "🌳 Plaza Bolívar", lat: 10.2438, lng: -66.8611 },
    { nombre: "🏥 El Hospitalito", lat: 10.2465, lng: -66.8598 },
    { nombre: "🍲 Mama Pancha", lat: 10.2415, lng: -66.8660 }
];

function initializeMapOnce() {
    if (mapInstance) return;

    // Inicializar mapa sin controles invasivos
    mapInstance = L.map('map', { zoomControl: false }).setView([latDefault, lonDefault], 15);

    /* CAPA SATELITAL HÍBRIDA DE GOOGLE MAPS (lyrs=y)
       Permite ver casas reales, calles y nombres de todos los comercios de Charallave.
    */
    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps'
    }).addTo(mapInstance);

    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // Inicializar Marcadores Personalizados de la SPA
    originMarker = L.marker([latDefault, lonDefault], {
        draggable: true,
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: "<div class='w-7 h-7 bg-blue-500 border-2 border-slate-900 rounded-full flex items-center justify-center font-black text-xs text-white shadow-xl'>A</div>",
            iconSize: [28, 28]
        })
    }).addTo(mapInstance);

    destMarker = L.marker([10.2421, -66.8643], { // Ubicación inicial en el Tamanaco por defecto
        draggable: true,
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: "<div class='w-7 h-7 bg-amber-500 border-2 border-slate-900 rounded-full flex items-center justify-center font-black text-xs text-black shadow-xl animate-bounce'>B</div>",
            iconSize: [28, 28]
        })
    }).addTo(mapInstance);

    routeLine = L.polyline([], {
        color: '#f59e0b',
        weight: 5,
        opacity: 0.85
    }).addTo(mapInstance);

    // Solicitar geolocalización real del teléfono
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const gpsLat = position.coords.latitude;
                const gpsLon = position.coords.longitude;
                originMarker.setLatLng([gpsLat, gpsLon]);
                mapInstance.setView([gpsLat, gpsLon], 16);
                actualizarCalculosViales();
            },
            () => { actualizarCalculosViales(); }
        );
    } else {
        actualizarCalculosViales();
    }

    // Eventos de arrastre sincronizados
    const updateLinePreview = () => {
        routeLine.setLatLngs([originMarker.getLatLng(), destMarker.getLatLng()]);
    };

    originMarker.on('drag', updateLinePreview);
    destMarker.on('drag', updateLinePreview);
    originMarker.on('dragend', actualizarCalculosViales);
    destMarker.on('dragend', actualizarCalculosViales);

    // Inyectar los 5 botones rápidos en la interfaz
    renderizarBotonesDestino();
}

// Función del asistente rápido de mapas
function fijarDestinoRapido(lat, lng, nombre) {
    destMarker.setLatLng([lat, lng]);
    mapInstance.setView([lat, lng], 17);
    routeLine.setLatLngs([originMarker.getLatLng(), destMarker.getLatLng()]);
    actualizarCalculosViales();
    
    if (typeof tg !== 'undefined') {
        tg.HapticFeedback?.notificationOccurred('success');
    }
}

function renderizarBotonesDestino() {
    const contenedor = document.getElementById('contenedor-puntos-charallave');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    puntosCharallave.forEach(punto => {
        const btn = document.createElement('button');
        btn.className = 'btn-punto-charallave';
        btn.innerText = punto.nombre;
        btn.onclick = (e) => {
            e.preventDefault();
            fijarDestinoRapido(punto.lat, punto.lng, punto.nombre);
        };
        contenedor.appendChild(btn);
    });
}

function calcularDistanciaLineal(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Consumo de ruteador OSRM y Tasas del Servidor Flask
async function actualizarCalculosViales() {
    const posA = originMarker.getLatLng();
    const posB = destMarker.getLatLng();
    
    let distanciaFinalKm = calcularDistanciaLineal(posA.lat, posA.lng, posB.lat, posB.lng) * 1.25; 
    let trayectoCoordenadas = [posA, posB];

    try {
        const urlRouting = `https://router.project-osrm.org/route/v1/driving/${posA.lng},${posA.lat};${posB.lng},${posB.lat}?overview=full&geometries=geojson`;
        const res = await fetch(urlRouting);
        if (res.ok) {
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                distanciaFinalKm = data.routes[0].distance / 1000;
                trayectoCoordenadas = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            }
        }
    } catch (e) {
        console.warn("Usando aproximación Haversine.");
    }

    routeLine.setLatLngs(trayectoCoordenadas);

    let tasaDolar = 45.00;
    try {
        const configRes = await fetch('/admin/data');
        if (configRes.ok) {
            const dataConfig = await configRes.json();
            tasaDolar = dataConfig.tasa_actual || 45.00;
        }
    } catch (e) {
        console.log("Usando fallback de tasa.");
    }

    let precioUsd = 0.50;
    if (distanciaFinalKm >= 2.00) {
        precioUsd = 0.50 + ((distanciaFinalKm - 2.00) * 0.25);
    }
    const precioBs = precioUsd * tasaDolar;

    document.getElementById('distancia-texto').innerText = `${distanciaFinalKm.toFixed(2)} km`;
    document.getElementById('precio-texto').innerText = `${precioBs.toFixed(2)} Bs.`;
}

// Botón de Envío de Pedido a Telegram Bot
document.getElementById('btn-confirmar').addEventListener('click', () => {
    const posA = originMarker.getLatLng();
    const posB = destMarker.getLatLng();
    const distancia = parseFloat(document.getElementById('distancia-texto').innerText);
    
    const payload = {
        event: 'request_trip',
        dest_lat: posB.lat,
        dest_lon: posB.lng,
        orig_lat: posA.lat,
        orig_lon: posA.lng,
        distancia_km: distancia
    };

    if (typeof tg !== 'undefined') {
        tg.sendData(JSON.stringify(payload));
        tg.close();
    }
});