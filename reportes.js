const ReportesManager = {
    reportes: [],
    supabase: null,
    
    init: function() {
        try {
            if (typeof supabase !== 'undefined') {
                this.supabase = supabase.createClient(SB_URL, SB_KEY);
                console.log('✅ Supabase conectado para reportes');
            } else {
                console.error('❌ Supabase no está disponible');
            }
            this.loadReportes();
        } catch (error) {
            console.error('Error inicializando Reportes:', error);
        }
    },

    openForm: function() {
        const modal = document.getElementById('reporte-modal');
        if (modal) {
            modal.classList.add('show');
            this.autoFillLocation();
            console.log('📋 Formulario de reporte abierto');
        } else {
            console.error('❌ Modal de reporte no encontrado');
        }
    },

    closeForm: function() {
        const modal = document.getElementById('reporte-modal');
        if (modal) {
            modal.classList.remove('show');
        }
    },

    autoFillLocation: function() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    
                    const latInput = document.getElementById('lat');
                    const lngInput = document.getElementById('lng');
                    
                    if (latInput && lngInput) {
                        latInput.value = lat.toFixed(6);
                        lngInput.value = lng.toFixed(6);
                        console.log('📍 Ubicación auto-llenada:', lat, lng);
                    }
                },
                error => {
                    console.log('Geolocalización no disponible:', error.message);
                }
            );
        }
    },

    getGeolocalizacion: function() {
        if ('geolocation' in navigator) {
            showToast('📍 Obteniendo ubicación...', 'info');
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    
                    document.getElementById('lat').value = lat.toFixed(6);
                    document.getElementById('lng').value = lng.toFixed(6);
                    
                    if (typeof map !== 'undefined' && map.setCenter) {
                        map.flyTo({
                            center: [lng, lat],
                            zoom: 14,
                            duration: 1000
                        });
                    }
                    
                    showToast('✓ Ubicación obtenida', 'success');
                    console.log('✓ Ubicación obtenida y mapa centrado');
                },
                error => {
                    console.error('Error de geolocalización:', error);
                    showToast('❌ No se pudo obtener la ubicación', 'error');
                }
            );
        } else {
            showToast('⚠️ Geolocalización no disponible', 'warning');
        }
    },

    validateForm: function() {
        const lat = document.getElementById('lat').value;
        const lng = document.getElementById('lng').value;
        const tipo = document.getElementById('tipo-denuncia').value;
        const titulo = document.getElementById('titulo').value;
        const descripcion = document.getElementById('descripcion').value;
        const severidad = document.querySelector('input[name="severidad"]:checked');
        const nombre = document.getElementById('nombre').value;
        const email = document.getElementById('email').value;

        console.log('Validando formulario...');

        if (!lat || !lng) {
            showToast('⚠️ Ingresa la ubicación (Latitud y Longitud)', 'warning');
            return false;
        }

        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        
        if (isNaN(latNum) || isNaN(lngNum)) {
            showToast('⚠️ Las coordenadas deben ser números válidos', 'warning');
            return false;
        }

        if (!tipo) {
            showToast('⚠️ Selecciona un tipo de denuncia', 'warning');
            return false;
        }

        if (!titulo || titulo.trim() === '') {
            showToast('⚠️ Ingresa un título', 'warning');
            return false;
        }

        if (!descripcion || descripcion.trim() === '') {
            showToast('⚠️ Describe el problema', 'warning');
            return false;
        }

        if (!severidad) {
            showToast('⚠️ Selecciona el nivel de severidad', 'warning');
            return false;
        }

        if (!nombre || nombre.trim() === '') {
            showToast('⚠️ Ingresa tu nombre', 'warning');
            return false;
        }

        if (!email || email.trim() === '') {
            showToast('⚠️ Ingresa tu email', 'warning');
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('⚠️ Email inválido', 'warning');
            return false;
        }

        console.log('✓ Formulario validado correctamente');
        return true;
    },

    submitForm: async function(event) {
        event.preventDefault();

        if (!this.validateForm()) {
            return;
        }

        const lat = parseFloat(document.getElementById('lat').value);
        const lng = parseFloat(document.getElementById('lng').value);

        const formData = {
            latitud: lat,
            longitud: lng,
            tipo: document.getElementById('tipo-denuncia').value,
            titulo: document.getElementById('titulo').value,
            descripcion: document.getElementById('descripcion').value,
            severidad: document.querySelector('input[name="severidad"]:checked').value,
            nombre: document.getElementById('nombre').value,
            email: document.getElementById('email').value,
            telefono: document.getElementById('telefono').value || null,
            anonimo: document.getElementById('anonimo').checked,
            estado: 'Pendiente',
            created_at: new Date().toISOString()
        };

        try {
            console.log('📤 Enviando reporte...', formData);
            showToast('📤 Enviando reporte...', 'info');

            if (this.supabase) {
                const { data, error } = await this.supabase
                    .from('reportes')
                    .insert([formData]);

                if (error) {
                    console.error('❌ Error Supabase:', error);
                    showToast('⚠️ Guardado localmente (BD error)', 'warning');
                } else {
                    console.log('✅ Reporte guardado en Supabase:', data);
                    showToast('✓ Reporte enviado exitosamente!', 'success');
                }
            } else {
                console.warn('⚠️ Supabase no disponible, guardando localmente');
                showToast('⚠️ Guardado solo localmente', 'warning');
            }

            this.reportes.push(formData);
            localStorage.setItem('reportes', JSON.stringify(this.reportes));
            console.log('✓ Reporte guardado en localStorage');

            document.getElementById('reporte-form').reset();
            this.closeForm();

            this.updateReportesList();

            this.addReporteMarker(formData);

        } catch (error) {
            console.error('❌ Error al enviar reporte:', error);
            showToast('❌ Error: ' + error.message, 'error');
        }
    },

    addReporteMarker: function(formData) {
        try {
            if (typeof map !== 'undefined' && map) {
                const severityColor = {
                    'baja': '#10b981',
                    'media': '#f59e0b',
                    'alta': '#ef4444'
                };

                const color = severityColor[formData.severidad] || '#00a0e0';

                const popup = new maplibregl.Popup({ offset: 25 })
                    .setHTML(`<div style="padding: 10px; max-width: 200px;">
                        <strong>${formData.titulo}</strong>
                        <p style="margin: 5px 0; font-size: 12px;">${formData.descripcion}</p>
                        <small>${formData.nombre} - ${formData.estado}</small>
                    </div>`);

                const marker = new maplibregl.Marker({ color: color })
                    .setLngLat([formData.longitud, formData.latitud])
                    .setPopup(popup)
                    .addTo(map);

                console.log('✅ Marcador agregado al mapa en:', formData.latitud, formData.longitud);
            }
        } catch (error) {
            console.error('Error al agregar marcador:', error);
        }
    },

    updateReportesList: function() {
        const container = document.getElementById('reportes-list');
        if (!container) {
            console.error('❌ reportes-list no encontrado');
            return;
        }

        container.innerHTML = '';

        if (this.reportes.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 20px;">No hay reportes aún</p>';
            return;
        }

        const recent = this.reportes.slice(-5).reverse();
        console.log('📊 Mostrando', recent.length, 'reportes');

        recent.forEach(reporte => {
            const item = document.createElement('div');
            item.className = `reporte-item ${reporte.estado.toLowerCase()}`;
            
            const statusEmoji = {
                'Pendiente': '🟡',
                'Revisado': '🔵',
                'Atendido': '🟢'
            };

            const fecha = new Date(reporte.created_at).toLocaleDateString('es-ES');

            item.innerHTML = `
                <div class="reporte-item-title">${statusEmoji[reporte.estado] || '⚪'} ${reporte.titulo}</div>
                <small style="color: #64748b;">${fecha}</small><br>
                <span class="reporte-item-status">${reporte.severidad.toUpperCase()}</span>
            `;

            item.onclick = () => this.showReporteDetail(reporte);
            container.appendChild(item);
        });
    },

    showReporteDetail: function(reporte) {
        console.log('📍 Mostrando detalle de reporte:', reporte);
        
        if (typeof map !== 'undefined' && map.setCenter) {
            map.flyTo({
                center: [reporte.longitud, reporte.latitud],
                zoom: 14,
                duration: 1000
            });
        }

        showToast(`📍 ${reporte.titulo} - ${reporte.estado}`, 'info');
    },

    loadReportes: function() {
        try {
            const stored = localStorage.getItem('reportes');
            if (stored) {
                this.reportes = JSON.parse(stored);
                console.log('✓ Cargados', this.reportes.length, 'reportes del localStorage');
                this.updateReportesList();
            }
        } catch (error) {
            console.error('Error cargando reportes:', error);
        }
    }
};

window.openReporteForm = function() {
    ReportesManager.openForm();
};

window.closeReporteForm = function() {
    ReportesManager.closeForm();
};

window.getGeolocalizacion = function() {
    ReportesManager.getGeolocalizacion();
};

window.toggleAnonimo = function() {
    const anonimo = document.getElementById('anonimo').checked;
    const nombre = document.getElementById('nombre');
    const email = document.getElementById('email');
    
    if (anonimo) {
        nombre.disabled = true;
        email.disabled = true;
        nombre.value = 'Anónimo';
        email.value = 'anonimo@reportes.local';
        nombre.style.opacity = '0.6';
        email.style.opacity = '0.6';
    } else {
        nombre.disabled = false;
        email.disabled = false;
        nombre.value = '';
        email.value = '';
        nombre.style.opacity = '1';
        email.style.opacity = '1';
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 Inicializando Sistema de Reportes...');
    ReportesManager.init();

    const form = document.getElementById('reporte-form');
    if (form) {
        form.addEventListener('submit', (e) => ReportesManager.submitForm(e));
        console.log('✓ Evento submit del formulario registrado');
    } else {
        console.error('❌ Formulario de reporte no encontrado');
    }

    const modal = document.getElementById('reporte-modal');
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                ReportesManager.closeForm();
            }
        });
    }

    ReportesManager.loadReportes();
    console.log('✅ Sistema de reportes con Supabase cargado');
});
